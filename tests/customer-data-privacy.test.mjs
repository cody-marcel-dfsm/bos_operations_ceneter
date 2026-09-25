import assert from "node:assert/strict";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import {
  customerDataFindings,
  normalizeSensitiveText,
  privacyFailures,
  sha256
} from "../scripts/check-customer-data.mjs";
import {syntheticIdentity} from "../scripts/lib/synthetic-fixtures.mjs";

test("privacy scanner accepts generated tenant-neutral fixtures", () => {
  const fixture = syntheticIdentity("privacy-test");
  assert.deepEqual(customerDataFindings(JSON.stringify(fixture), "fixture.json", new Set()), []);
});

test("privacy scanner rejects non-synthetic emails without embedding customer data", () => {
  const externalAddress = `${["person", "production-domain"].join("@")}\.${"invalidated"}`;
  assert.deepEqual(
    customerDataFindings(`contact ${externalAddress}`, "fixture.json", new Set()),
    ["fixture.json: non-synthetic email address"]
  );
});

test("privacy scanner accepts reserved fictional phones and rejects ordinary NANP phones", () => {
  assert.deepEqual(
    customerDataFindings("+1-202-555-0142", "fixture.json", new Set()),
    []
  );
  assert.deepEqual(
    customerDataFindings(["+1", "202", "867", "5309"].join("-"), "fixture.json", new Set()),
    ["fixture.json: non-fictional phone number"]
  );
  assert.deepEqual(
    customerDataFindings(["202", "867", "5309"].join(""), "fixture.json", new Set()),
    ["fixture.json: non-fictional phone number"]
  );
});

test("privacy scanner rejects hashed identifiers without shipping their values", () => {
  const syntheticSensitive = "prohibited fixture identity with five tokens";
  const blocked = new Set([sha256(normalizeSensitiveText(syntheticSensitive))]);
  assert.deepEqual(
    customerDataFindings(`prefix ${syntheticSensitive} suffix`, "fixture.json", blocked),
    ["fixture.json: prohibited customer identifier digest"]
  );
});

test("privacy scanner includes untracked candidates and rejects unreviewed binaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-privacy-gate-"));
  const candidate = join(directory, "customer-screenshot.png");
  await writeFile(candidate, Buffer.from("unreviewed-binary-fixture"));
  try {
    const findings = (await privacyFailures({extraPaths: [candidate]}))
      .filter((finding) => finding.includes("customer-screenshot"));
    assert.equal(findings.length, 1);
    assert.match(findings[0], /customer-screenshot\.png: unreviewed binary publication artifact$/u);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
