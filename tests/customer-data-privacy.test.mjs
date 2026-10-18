import assert from "node:assert/strict";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import {
  customerDataFindings,
  isWatcherProcessMetadata,
  normalizeSensitiveText,
  privacyFailures,
  root,
  sha256,
  verifiedGithubMetadataText
} from "../scripts/check-customer-data.mjs";
import {syntheticIdentity} from "../scripts/lib/synthetic-fixtures.mjs";

test("privacy scanner narrowly recognizes bounded ASCII watcher process metadata", () => {
  const path = join(root, "Vault", "tmp", "vault-index", "watcher.pid");
  for (const value of ["1", "12345\n", `${2 ** 31 - 1}\n`]) {
    assert.equal(isWatcherProcessMetadata(path, Buffer.from(value)), true);
  }
  for (const value of ["", "0\n", `${2 ** 31}\n`, "1".repeat(11), "12\n34", "12\r\n", "123@example.com", "123\0"]) {
    assert.equal(isWatcherProcessMetadata(path, Buffer.from(value)), false);
  }
  assert.equal(isWatcherProcessMetadata(path, Buffer.from([0xb1])), false);
  assert.equal(isWatcherProcessMetadata(join(root, "watcher.pid"), Buffer.from("123\n")), false);
});

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

test("verified owned GitHub identity normalizes only exact provider slots", () => {
  const repository = "cody-marcel-dfsm/bos_operations_ceneter";
  const id = Number(["202", "867", "5309"].join(""));
  const node_id = "synthetic-owned-native-provider-identity";
  const identities = {repository, pull_requests: {"7": {id_sha256: sha256(String(id)), node_id_sha256: sha256(node_id)}}};
  const row = {id, node_id, number: 7, url: `https://api.github.com/repos/${repository}/pulls/7`,
    html_url: `https://github.com/${repository}/pull/7`,
    head: {repo: {full_name: repository, ssh_url: `${["git", "github.com"].join("@")}:${repository}.git`}},
    base: {repo: {full_name: repository, ssh_url: `${["git", "github.com"].join("@")}:${repository}.git`}}};
  const scan = (value, registry = identities) => customerDataFindings(
    verifiedGithubMetadataText(JSON.stringify(value), registry), "native-provider.json", new Set());
  assert.deepEqual(scan(row), []);
  assert(scan({...row, id: id + 1}).some((x) => x.includes("phone")));
  assert(scan({...row, node_id: "forged-provider-id"}).some((x) => x.includes("phone")));
  assert(scan({...row, url: "https://api.github.com/repos/foreign/customer/pulls/7"}).some((x) => x.includes("phone")));
  assert(scan(row, {repository: "foreign/customer", pull_requests: identities.pull_requests}).some((x) => x.includes("phone")));
  const external = ["person", "production-domain.invalidated"].join("@");
  assert(scan({...row, body: external}).some((x) => x.includes("email")));
  assert(scan({...row, customer_phone: String(id)}).some((x) => x.includes("phone")));
  const other = structuredClone(row);
  other.head.repo.ssh_url = external;
  assert(scan(other).some((x) => x.includes("email")));
  const rawCases = [
    JSON.stringify(row).replace('"id":', `"body":${JSON.stringify(external)},"body":"","id":`),
    JSON.stringify(row).replace('"id":', `"nested":{"phone":"${id}","phone":""},"id":`),
    JSON.stringify(row).replace('"id":', `"id":${JSON.stringify(external)},"id":`),
    JSON.stringify(row).replace('"id":', `"body":${JSON.stringify(external)},"b\\u006fdy":"","id":`),
  ];
  for (const raw of rawCases) {
    assert(verifiedGithubMetadataText(raw, identities).startsWith(raw));
    assert(customerDataFindings(raw, "duplicate-provider.json", new Set()).length > 0);
  }
  const sensitive = "blocked synthetic duplicate identity";
  const rawBlocked = JSON.stringify(row).replace('"id":',
    `"nested":{"label":${JSON.stringify(sensitive)},"label":""},"id":`);
  assert(customerDataFindings(verifiedGithubMetadataText(rawBlocked, identities), "duplicate-provider.json",
    new Set([sha256(normalizeSensitiveText(sensitive))])).some((x) => x.includes("identifier digest")));
  for (const number of ["9007199254740993", "1.0000000000000001", "9.007199254740993e15", "1e+30", "-0"]) {
    for (const member of [`"synthetic_customer_identifier":${number}`, `"nested":[{"identifier":${number}}]`]) {
      const raw = JSON.stringify(row).replace('"id":', `${member},"id":`);
      const masked = verifiedGithubMetadataText(raw, identities);
      assert(masked.includes(member), "original nonmetadata numeric bytes remain scanned");
      const blocked = new Set([sha256(normalizeSensitiveText(number))]);
      assert(customerDataFindings(masked, "numeric-provider.json", blocked)
        .some((x) => x.includes("identifier digest")));
    }
  }
  const escaped = JSON.stringify(row).replace('"id":', '"customer":"blocked \\u0073ynthetic identifier","id":');
  assert(customerDataFindings(verifiedGithubMetadataText(escaped, identities), "escaped-provider.json",
    new Set([sha256(normalizeSensitiveText("blocked synthetic identifier"))]))
    .some((x) => x.includes("identifier digest")));
  const phrase = "generated synthetic deny phrase";
  const encoded = JSON.stringify(phrase).replaceAll(" ", "\\u0020");
  const scientific = JSON.stringify(row).replace(`"id":${id}`, `"id":${id.toExponential()}`);
  const unique = scientific.replace('"node_id":', `"body":${encoded},"node_id":`);
  const duplicate = unique.replace(`"body":${encoded}`, `"body":${encoded},"body":""`);
  const blocked = new Set([sha256(normalizeSensitiveText(phrase))]);
  for (const raw of [unique, duplicate]) {
    assert(customerDataFindings(verifiedGithubMetadataText(raw, identities), "overwritten-provider.json", blocked)
      .some((x) => x.includes("identifier digest")));
  }
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

test("privacy scanner reads text logs and diffs instead of rejecting them as binaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-privacy-text-"));
  const candidates = ["workflow-output.log", "workflow-output.diff", "workflow-output.patch"]
    .map((name) => join(directory, name));
  try {
    for (const candidate of candidates) await writeFile(candidate, "ok 1 - synthetic output\n");
    const findings = (await privacyFailures({extraPaths: candidates}))
      .filter((finding) => finding.includes("workflow-output"));
    assert.deepEqual(findings, []);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
