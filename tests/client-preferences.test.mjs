import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  readClientPreferences,
  resolveClientPreferencesRoot,
  setDefaultOrganizationPreference
} from "../source/platform/bos-mcp-client/scripts/client-preferences.mjs";

const organizations = [
  "Example North",
  "Example South",
  "Primary Center",
  "Primary Center"
];

test("client preferences use a shared platform-native config root", () => {
  const macHome = join("/", "Users", "example");
  assert.equal(
    resolveClientPreferencesRoot({ platform: "darwin", environment: {}, userHome: macHome }),
    join(macHome, "Library", "Application Support", "ai.dfsm.bos", "client-preferences", "v1")
  );
  assert.equal(
    resolveClientPreferencesRoot({ platform: "linux", environment: {}, userHome: "/home/example" }),
    "/home/example/.config/ai.dfsm.bos/client-preferences/v1"
  );
  assert.equal(
    resolveClientPreferencesRoot({
      platform: "win32",
      environment: { APPDATA: "C:\\Users\\example\\AppData\\Roaming" },
      userHome: "C:\\Users\\example"
    }),
    join("C:\\Users\\example\\AppData\\Roaming", "DFSM", "BOS", "client-preferences", "v1")
  );
});

test("default organization is committed only after authorized-label validation", async () => {
  const preferencesRoot = await mkdtemp(join(tmpdir(), "bos-client-preferences-"));
  const result = await setDefaultOrganizationPreference({
    organization_label: "  primary   center ",
    available_organization_labels: organizations
  }, { preferencesRoot, now: "2026-08-30T12:00:00.000Z" });

  assert.deepEqual(result, {
    state: "committed",
    default_organization_label: "Primary Center",
    updated_at: "2026-08-30T12:00:00.000Z"
  });
  const file = join(preferencesRoot, "preferences.json");
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), {
    schema_version: "bos-client-preferences/v1",
    default_organization_label: "Primary Center",
    updated_at: "2026-08-30T12:00:00.000Z"
  });
});

test("default organization preference never authorizes an unavailable organization", async () => {
  const preferencesRoot = await mkdtemp(join(tmpdir(), "bos-client-preferences-"));
  await assert.rejects(
    setDefaultOrganizationPreference({
      organization_label: "Unknown Center",
      available_organization_labels: organizations
    }, { preferencesRoot }),
    /match exactly one currently authorized organization label/
  );
});

test("saved preference becomes stale when the current login lacks that organization", async () => {
  const preferencesRoot = await mkdtemp(join(tmpdir(), "bos-client-preferences-"));
  await setDefaultOrganizationPreference({
    organization_label: "Primary Center",
    available_organization_labels: organizations
  }, { preferencesRoot });

  assert.deepEqual(
    await readClientPreferences({
      available_organization_labels: ["Example South"]
    }, { preferencesRoot }),
    {
      state: "stale",
      reason: "default_organization_unavailable",
      default_organization_label: "Primary Center"
    }
  );
});

test("reader rejects authority-shaped or unknown preference fields", async () => {
  const preferencesRoot = await mkdtemp(join(tmpdir(), "bos-client-preferences-"));
  await writeFile(join(preferencesRoot, "preferences.json"), JSON.stringify({
    schema_version: "bos-client-preferences/v1",
    default_organization_label: "Primary Center",
    updated_at: "2026-08-30T12:00:00.000Z",
    organization_id: "example-authority-value"
  }));

  await assert.rejects(
    readClientPreferences({
      available_organization_labels: organizations
    }, { preferencesRoot }),
    /unsupported field: organization_id/
  );
});
