import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  commitPluginSettingsCache,
  commitPluginSettingsInitializationReceipt,
  invalidatePluginSettingsCache,
  readPluginSettingsCache,
  readPluginSettingsInitializationReceipt,
  resolvePluginSettingsCacheRoot
} from "../source/platform/bos-mcp-client/scripts/plugin-settings-cache.mjs";

const identity = {
  cache_scope: "opaque-authority-scope-example",
  plugin_key: "business-hours",
  settings_schema_version: "1",
  settings_epoch: "epoch-1"
};

const snapshot = {
  schema_version: "1",
  state: "configured",
  revision: "revision-1",
  fields: [{
    semantic_key: "trial_hours",
    label: "Trial Hours",
    value_type: "weekly_schedule",
    control: "hours_grid",
    editable: true,
    value: {
      timezone: "Etc/UTC",
      monday: [{ opens: "16:00", closes: "19:00" }]
    }
  }]
};

async function temporaryCache(context) {
  const path = await mkdtemp(join(tmpdir(), "bos-plugin-settings-cache-test-"));
  context.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("plugin settings cache resolves one product-independent root", () => {
  assert.equal(
    resolvePluginSettingsCacheRoot({
      platform: "darwin",
      userHome: "/sample-home",
      environment: {}
    }),
    "/sample-home/Library/Caches/ai.dfsm.bos/plugin-settings/v1"
  );
  assert.equal(
    resolvePluginSettingsCacheRoot({
      platform: "linux",
      userHome: "/home/example",
      environment: {}
    }),
    "/home/example/.cache/ai.dfsm.bos/plugin-settings/v1"
  );
  assert.equal(
    resolvePluginSettingsCacheRoot({
      platform: "win32",
      userHome: "C:\\Users\\example",
      environment: { LOCALAPPDATA: "C:\\Users\\example\\AppData\\Local" }
    }),
    "C:\\Users\\example\\AppData\\Local/DFSM/BOS/Cache/plugin-settings/v1"
  );
  assert.throws(
    () => resolvePluginSettingsCacheRoot({
      platform: "linux",
      userHome: "/home/example",
      environment: { BOS_PLUGIN_SETTINGS_CACHE_DIR: "relative/cache" }
    }),
    /absolute path/
  );
});

test("cache miss becomes current only after a canonical commit", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const missing = await readPluginSettingsCache(identity, { cacheRoot });
  assert.equal(missing.state, "miss");

  const committed = await commitPluginSettingsCache({
    ...identity,
    canonical_source: "bos_committed",
    revision: "revision-1",
    change_cursor: "cursor-1",
    snapshot
  }, { cacheRoot, now: "2026-08-26T12:00:00.000Z" });
  assert.equal(committed.state, "committed");

  const current = await readPluginSettingsCache(identity, {
    cacheRoot,
    now: "2026-08-26T12:01:00.000Z"
  });
  assert.equal(current.state, "current");
  assert.equal(current.origin, "cache");
  assert.equal(current.revision, "revision-1");
  assert.equal(current.change_cursor, "cursor-1");
  assert.deepEqual(current.snapshot, snapshot);
  assert.equal(current.sync_completed_at, "2026-08-26T12:00:00.000Z");
  assert.equal(current.age_seconds, 60);

  const scopeDirectories = await readdir(`${cacheRoot}/scopes`);
  assert.equal(scopeDirectories.length, 1);
  const pluginFiles = await readdir(
    `${cacheRoot}/scopes/${scopeDirectories[0]}/plugins`
  );
  assert.equal(pluginFiles.length, 1);
  const cacheFile = `${cacheRoot}/scopes/${scopeDirectories[0]}/plugins/${pluginFiles[0]}`;
  assert.equal((await stat(cacheFile)).mode & 0o777, 0o600);
  const envelope = JSON.parse(await readFile(cacheFile, "utf8"));
  assert.equal(Object.hasOwn(envelope, "cache_scope"), false);
});

test("epoch and schema changes make confirmed cache entries stale", async (context) => {
  const cacheRoot = await temporaryCache(context);
  await commitPluginSettingsCache({
    ...identity,
    canonical_source: "bos_read",
    revision: "revision-1",
    snapshot
  }, { cacheRoot, now: "2026-08-26T12:00:00.000Z" });

  const changedEpoch = await readPluginSettingsCache({
    ...identity,
    settings_epoch: "epoch-2"
  }, { cacheRoot });
  assert.equal(changedEpoch.state, "stale");
  assert.equal(changedEpoch.reason, "settings_epoch_changed");

  const changedSchema = await readPluginSettingsCache({
    ...identity,
    settings_schema_version: "2"
  }, { cacheRoot });
  assert.equal(changedSchema.state, "miss");
});

test("authority scopes remain isolated and invalidation is exact", async (context) => {
  const cacheRoot = await temporaryCache(context);
  await commitPluginSettingsCache({
    ...identity,
    canonical_source: "bos_read",
    revision: "revision-1",
    snapshot
  }, { cacheRoot });

  const foreign = await readPluginSettingsCache({
    ...identity,
    cache_scope: "opaque-other-authority-scope"
  }, { cacheRoot });
  assert.equal(foreign.state, "miss");

  const invalidated = await invalidatePluginSettingsCache(identity, { cacheRoot });
  assert.equal(invalidated.state, "invalidated");
  assert.equal((await readPluginSettingsCache(identity, { cacheRoot })).state, "miss");
});

test("cache rejects secret-shaped snapshots and unconfirmed sources", async (context) => {
  const cacheRoot = await temporaryCache(context);
  await assert.rejects(
    commitPluginSettingsCache({
      ...identity,
      canonical_source: "recommendation",
      revision: "revision-1",
      snapshot
    }, { cacheRoot }),
    /canonical_source/
  );
  await assert.rejects(
    commitPluginSettingsCache({
      ...identity,
      canonical_source: "bos_read",
      revision: "revision-1",
      snapshot: { ...snapshot, api_key: "secret-value" }
    }, { cacheRoot }),
    /secret-shaped key/
  );
});

test("cache fails closed on corrupted confirmed envelopes", async (context) => {
  const cacheRoot = await temporaryCache(context);
  await commitPluginSettingsCache({
    ...identity,
    canonical_source: "bos_read",
    revision: "revision-1",
    snapshot
  }, { cacheRoot, now: "2026-08-26T12:00:00.000Z" });

  const scopeDirectories = await readdir(`${cacheRoot}/scopes`);
  const pluginFiles = await readdir(
    `${cacheRoot}/scopes/${scopeDirectories[0]}/plugins`
  );
  const cacheFile = `${cacheRoot}/scopes/${scopeDirectories[0]}/plugins/${pluginFiles[0]}`;
  const envelope = JSON.parse(await readFile(cacheFile, "utf8"));
  envelope.sync_completed_at = "invalid";
  await writeFile(cacheFile, `${JSON.stringify(envelope)}\n`);

  await assert.rejects(
    readPluginSettingsCache(identity, { cacheRoot }),
    /sync_completed_at must be an ISO instant/
  );
});

test("initialization receipts bind completion to scope and epoch", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const receiptIdentity = {
    cache_scope: identity.cache_scope,
    product_key: "education-center",
    initialization_epoch: "initialization-1"
  };
  const missing = await readPluginSettingsInitializationReceipt(
    receiptIdentity,
    { cacheRoot }
  );
  assert.equal(missing.state, "missing");

  await commitPluginSettingsInitializationReceipt({
    ...receiptIdentity,
    completed_plugins: [{ plugin_key: "business-hours", revision: "revision-1" }]
  }, { cacheRoot, now: "2026-08-26T12:00:00.000Z" });

  const current = await readPluginSettingsInitializationReceipt(
    receiptIdentity,
    { cacheRoot }
  );
  assert.equal(current.state, "current");
  assert.equal(current.completed_plugins[0].plugin_key, "business-hours");

  const changed = await readPluginSettingsInitializationReceipt({
    ...receiptIdentity,
    initialization_epoch: "initialization-2"
  }, { cacheRoot });
  assert.equal(changed.state, "stale");
});
