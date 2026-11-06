import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  PROFILE_SCHEMA,
  publicWebsite,
  readProfile,
  saveProfile,
  validateProfile
} from "../source/platform/bos-customer-initialization/scripts/customer-profile.mjs";

async function tempPath() {
  return join(await mkdtemp(join(tmpdir(), "bos-profile-")), "BOS", "plugins", "bos", "customer-profile.json");
}

const example = {
  organization: { display_name: "Example Org", website_url: "https://example.com", timezone: "America/Denver" },
  user: { display_name: "Pat Example", email: "pat@example.com", role_label: "Admin" },
  sources: { "organization.display_name": { status: "server", source: "bos:context" } },
  server_sync: { status: "not_available" }
};

test("missing profile reads as missing", async () => {
  const path = await tempPath();
  assert.equal((await readProfile({ path })).state, "missing");
  assert.equal((await readProfile({ path, organization: "Example Org" })).state, "missing");
});

test("save writes a private file and merges organizations", async () => {
  const path = await tempPath();
  await saveProfile({ organizations: { "Example Org": example } }, { path });
  await saveProfile({ organizations: { "Second Org": { organization: { display_name: "Second Org" } } } }, { path });
  const saved = JSON.parse(await readFile(path, "utf8"));
  assert.equal(saved.schema_version, PROFILE_SCHEMA);
  assert.deepEqual(Object.keys(saved.organizations).sort(), ["Example Org", "Second Org"]);
  if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("organization lookup is case-insensitive and replaces the same label", async () => {
  const path = await tempPath();
  await saveProfile({ organizations: { "Example Org": example } }, { path });
  await saveProfile({ organizations: { "example org": { ...example, organization: { display_name: "Example Org", timezone: "UTC" } } } }, { path });
  const result = await readProfile({ path, organization: "EXAMPLE ORG" });
  assert.equal(result.state, "current");
  assert.equal(result.entry.organization.timezone, "UTC");
  assert.equal(Object.keys((await readProfile({ path })).profile.organizations).length, 1);
});

test("validation rejects unknown fields, secrets slots, and unsafe values", () => {
  const bad = (entry) => validateProfile({ schema_version: PROFILE_SCHEMA, organizations: { Org: entry } });
  assert.deepEqual(bad({ organization: { display_name: "Org" } }), []);
  assert.notDeepEqual(bad({ organization: { display_name: "Org" }, api_key: "x" }), []);
  assert.notDeepEqual(bad({ organization: { display_name: "Org", token: "x" } }), []);
  assert.notDeepEqual(bad({ organization: {} }), []);
  assert.notDeepEqual(bad({ organization: { display_name: "Org\ninjected" } }), []);
  assert.notDeepEqual(bad({ organization: { display_name: "Org", timezone: "Mars/Base" } }), []);
  assert.notDeepEqual(bad({ organization: { display_name: "Org" }, user: { email: "not-an-email" } }), []);
  assert.notDeepEqual(bad({ organization: { display_name: "Org" }, server_sync: { status: "approved" } }), []);
  assert.notDeepEqual(validateProfile({ schema_version: "other", organizations: {} }), []);
});

test("website must be public HTTP or HTTPS", () => {
  assert.equal(publicWebsite("https://example.com/location"), true);
  for (const url of ["http://127.0.0.1", "http://10.1.2.3", "https://intranet.local", "ftp://example.com",
    "https://user:pass@example.com", "http://[::1]", "https://localhost"]) {
    assert.equal(publicWebsite(url), false, url);
  }
});

test("invalid input or invalid saved file never overwrites", async () => {
  const path = await tempPath();
  await assert.rejects(saveProfile({ organizations: { Org: { organization: { display_name: "Org", website_url: "http://192.168.1.1" } } } }, { path }));
  assert.equal((await readProfile({ path })).state, "missing");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "{not json");
  assert.equal((await readProfile({ path })).state, "invalid");
  await assert.rejects(saveProfile({ organizations: { "Example Org": example } }, { path }));
  assert.equal(await readFile(path, "utf8"), "{not json");
});
