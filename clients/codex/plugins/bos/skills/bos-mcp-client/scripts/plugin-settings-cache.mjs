#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cacheSchemaVersion = "bos-plugin-settings-cache/v1";
const receiptSchemaVersion = "bos-plugin-settings-initialization-receipt/v1";
const defaultMaxAgeSeconds = 30 * 24 * 60 * 60;
const allowedCanonicalSources = new Set([
  "bos_read",
  "bos_committed",
  "bos_reconciled"
]);
const forbiddenKeys = new Set([
  "access_token",
  "actor_id",
  "api_key",
  "authorization",
  "client_secret",
  "context_id",
  "cookie",
  "credential",
  "delegated_role_id",
  "installation_id",
  "org_id",
  "organization_id",
  "password",
  "private_key",
  "provider_account_id",
  "refresh_token",
  "tenant_id",
  "token"
]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeJson(value, label = "value") {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeJson(item, `${label}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => {
          const normalizedKey = key.toLowerCase();
          if (forbiddenKeys.has(normalizedKey) ||
              /(?:^|_)(?:api_?key|access_?token|refresh_?token|client_?secret|private_?key|password|credential|authorization|cookie)(?:$|_)/i
                .test(normalizedKey)) {
            throw new Error(`${label}.${key} is a secret-shaped key and cannot be cached`);
          }
          return [key, normalizeJson(value[key], `${label}.${key}`)];
        })
    );
  }
  throw new Error(`${label} must contain JSON values only`);
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(normalizeJson(value)))
    .digest("hex");
}

function privateRoot(path) {
  if (!isAbsolute(path)) {
    throw new Error("BOS_PLUGIN_SETTINGS_CACHE_DIR must be an absolute path");
  }
  return resolve(path);
}

export function resolvePluginSettingsCacheRoot({
  platform = process.platform,
  environment = process.env,
  userHome = homedir()
} = {}) {
  if (environment.BOS_PLUGIN_SETTINGS_CACHE_DIR) {
    return privateRoot(environment.BOS_PLUGIN_SETTINGS_CACHE_DIR);
  }
  if (platform === "darwin") {
    return join(
      userHome,
      "Library",
      "Caches",
      "ai.dfsm.bos",
      "plugin-settings",
      "v1"
    );
  }
  if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA ||
      join(userHome, "AppData", "Local");
    return join(
      localAppData,
      "DFSM",
      "BOS",
      "Cache",
      "plugin-settings",
      "v1"
    );
  }
  const cacheHome = environment.XDG_CACHE_HOME || join(userHome, ".cache");
  return join(cacheHome, "ai.dfsm.bos", "plugin-settings", "v1");
}

function normalizeIdentity(input) {
  return {
    cache_scope: requireString(input.cache_scope, "cache_scope"),
    plugin_key: requireString(input.plugin_key, "plugin_key"),
    settings_schema_version: requireString(
      input.settings_schema_version,
      "settings_schema_version"
    ),
    settings_epoch: requireString(input.settings_epoch, "settings_epoch")
  };
}

function cacheRootFromOptions(options) {
  return options.cacheRoot
    ? privateRoot(options.cacheRoot)
    : resolvePluginSettingsCacheRoot(options);
}

function settingsLocation(root, identity) {
  const scopeKey = digest({ cache_scope: identity.cache_scope });
  const pluginKey = digest({
    plugin_key: identity.plugin_key,
    settings_schema_version: identity.settings_schema_version
  });
  return {
    scopeKey,
    pluginKey,
    file: join(root, "scopes", scopeKey, "plugins", `${pluginKey}.json`)
  };
}

function receiptLocation(root, input) {
  const cacheScope = requireString(input.cache_scope, "cache_scope");
  const productKey = requireString(input.product_key, "product_key");
  const scopeKey = digest({ cache_scope: cacheScope });
  const productDigest = digest({ product_key: productKey });
  return {
    scopeKey,
    productKey,
    file: join(root, "scopes", scopeKey, "receipts", `${productDigest}.json`)
  };
}

async function ensurePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicWriteJson(path, value) {
  await ensurePrivateDirectory(dirname(path));
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx"
  });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

function normalizeNow(options) {
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.valueOf())) throw new Error("now must be an ISO instant");
  return now;
}

function maxAgeFromOptions(options) {
  const value = options.maxAgeSeconds ?? defaultMaxAgeSeconds;
  if (!Number.isInteger(value) || value < 0 || value > 31_536_000) {
    throw new Error("maxAgeSeconds must be an integer from 0 through 31536000");
  }
  return value;
}

export async function readPluginSettingsCache(input, options = {}) {
  const identity = normalizeIdentity(requireObject(input, "input"));
  const root = cacheRootFromOptions(options);
  const location = settingsLocation(root, identity);
  const envelope = await readJson(location.file, null);
  if (!envelope) {
    return {
      state: "miss",
      scope_key: location.scopeKey,
      plugin_key: identity.plugin_key
    };
  }
  requireObject(envelope, "plugin settings cache entry");
  if (envelope.schema_version !== cacheSchemaVersion ||
      envelope.scope_key !== location.scopeKey ||
      envelope.plugin_key_hash !== location.pluginKey ||
      envelope.settings_schema_version !== identity.settings_schema_version) {
    throw new Error("plugin settings cache entry is invalid or belongs to another scope");
  }
  const revision = requireString(envelope.revision, "cached revision");
  const changeCursor = envelope.change_cursor === null
    ? null
    : requireString(envelope.change_cursor, "cached change_cursor");
  const syncCompletedAt = requireString(
    envelope.sync_completed_at,
    "cached sync_completed_at"
  );
  if (Number.isNaN(Date.parse(syncCompletedAt))) {
    throw new Error("cached sync_completed_at must be an ISO instant");
  }
  if (!allowedCanonicalSources.has(envelope.canonical_source)) {
    throw new Error("plugin settings cache entry has an invalid canonical source");
  }
  const snapshot = normalizeJson(
    requireObject(envelope.snapshot, "cached snapshot"),
    "cached snapshot"
  );
  if (envelope.settings_epoch !== identity.settings_epoch) {
    return {
      state: "stale",
      reason: "settings_epoch_changed",
      scope_key: location.scopeKey,
      plugin_key: identity.plugin_key,
      revision,
      change_cursor: changeCursor,
      sync_completed_at: syncCompletedAt
    };
  }
  const now = normalizeNow(options);
  const ageSeconds = Math.max(
    0,
    Math.floor((now.valueOf() - Date.parse(syncCompletedAt)) / 1000)
  );
  const maxAgeSeconds = maxAgeFromOptions(options);
  if (ageSeconds > maxAgeSeconds) {
    return {
      state: "stale",
      reason: "expired",
      scope_key: location.scopeKey,
      plugin_key: identity.plugin_key,
      revision,
      change_cursor: changeCursor,
      sync_completed_at: syncCompletedAt,
      age_seconds: ageSeconds,
      max_age_seconds: maxAgeSeconds
    };
  }
  return {
    state: "current",
    origin: "cache",
    scope_key: location.scopeKey,
    plugin_key: identity.plugin_key,
    revision,
    change_cursor: changeCursor,
    settings_epoch: envelope.settings_epoch,
    sync_completed_at: syncCompletedAt,
    age_seconds: ageSeconds,
    max_age_seconds: maxAgeSeconds,
    snapshot
  };
}

export async function commitPluginSettingsCache(input, options = {}) {
  requireObject(input, "input");
  const identity = normalizeIdentity(input);
  const canonicalSource = requireString(input.canonical_source, "canonical_source");
  if (!allowedCanonicalSources.has(canonicalSource)) {
    throw new Error(
      "canonical_source must be bos_read, bos_committed, or bos_reconciled"
    );
  }
  const revision = requireString(input.revision, "revision");
  const snapshot = normalizeJson(requireObject(input.snapshot, "snapshot"), "snapshot");
  const root = cacheRootFromOptions(options);
  const location = settingsLocation(root, identity);
  const now = normalizeNow(options).toISOString();
  const envelope = {
    schema_version: cacheSchemaVersion,
    scope_key: location.scopeKey,
    plugin_key_hash: location.pluginKey,
    plugin_key: identity.plugin_key,
    settings_schema_version: identity.settings_schema_version,
    settings_epoch: identity.settings_epoch,
    revision,
    change_cursor: input.change_cursor === undefined || input.change_cursor === null
      ? null
      : requireString(input.change_cursor, "change_cursor"),
    canonical_source: canonicalSource,
    sync_completed_at: now,
    snapshot
  };
  await atomicWriteJson(location.file, envelope);
  return {
    state: "committed",
    scope_key: location.scopeKey,
    plugin_key: identity.plugin_key,
    revision,
    change_cursor: envelope.change_cursor,
    sync_completed_at: now
  };
}

export async function invalidatePluginSettingsCache(input, options = {}) {
  const identity = normalizeIdentity(requireObject(input, "input"));
  const root = cacheRootFromOptions(options);
  const location = settingsLocation(root, identity);
  await rm(location.file, { force: true });
  return {
    state: "invalidated",
    scope_key: location.scopeKey,
    plugin_key: identity.plugin_key
  };
}

export async function readPluginSettingsInitializationReceipt(input, options = {}) {
  requireObject(input, "input");
  const initializationEpoch = requireString(
    input.initialization_epoch,
    "initialization_epoch"
  );
  const root = cacheRootFromOptions(options);
  const location = receiptLocation(root, input);
  const receipt = await readJson(location.file, null);
  if (!receipt) {
    return {
      state: "missing",
      scope_key: location.scopeKey,
      product_key: location.productKey
    };
  }
  requireObject(receipt, "plugin settings initialization receipt");
  if (receipt.schema_version !== receiptSchemaVersion ||
      receipt.scope_key !== location.scopeKey ||
      receipt.product_key !== location.productKey) {
    throw new Error("plugin settings initialization receipt is invalid");
  }
  const completedAt = requireString(receipt.completed_at, "receipt completed_at");
  if (Number.isNaN(Date.parse(completedAt))) {
    throw new Error("receipt completed_at must be an ISO instant");
  }
  if (!Array.isArray(receipt.completed_plugins)) {
    throw new Error("receipt completed_plugins must be an array");
  }
  const completedPlugins = normalizeJson(
    receipt.completed_plugins,
    "receipt completed_plugins"
  );
  for (const [index, plugin] of completedPlugins.entries()) {
    requireObject(plugin, `receipt completed_plugins[${index}]`);
    requireString(plugin.plugin_key, `receipt completed_plugins[${index}].plugin_key`);
    requireString(plugin.revision, `receipt completed_plugins[${index}].revision`);
  }
  if (receipt.initialization_epoch !== initializationEpoch) {
    return {
      state: "stale",
      scope_key: location.scopeKey,
      product_key: location.productKey,
      completed_at: completedAt
    };
  }
  return {
    state: "current",
    scope_key: location.scopeKey,
    product_key: location.productKey,
    initialization_epoch: receipt.initialization_epoch,
    completed_at: completedAt,
    completed_plugins: completedPlugins
  };
}

export async function commitPluginSettingsInitializationReceipt(input, options = {}) {
  requireObject(input, "input");
  const initializationEpoch = requireString(
    input.initialization_epoch,
    "initialization_epoch"
  );
  if (!Array.isArray(input.completed_plugins)) {
    throw new Error("completed_plugins must be an array");
  }
  const completedPlugins = normalizeJson(
    input.completed_plugins,
    "completed_plugins"
  );
  for (const [index, plugin] of completedPlugins.entries()) {
    requireObject(plugin, `completed_plugins[${index}]`);
    requireString(plugin.plugin_key, `completed_plugins[${index}].plugin_key`);
    requireString(plugin.revision, `completed_plugins[${index}].revision`);
  }
  const root = cacheRootFromOptions(options);
  const location = receiptLocation(root, input);
  const completedAt = normalizeNow(options).toISOString();
  await atomicWriteJson(location.file, {
    schema_version: receiptSchemaVersion,
    scope_key: location.scopeKey,
    product_key: location.productKey,
    initialization_epoch: initializationEpoch,
    completed_at: completedAt,
    completed_plugins: completedPlugins
  });
  return {
    state: "committed",
    scope_key: location.scopeKey,
    product_key: location.productKey,
    initialization_epoch: initializationEpoch,
    completed_at: completedAt
  };
}

async function runCli() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const operation = requireString(input.operation, "operation");
  let result;
  if (operation === "root") {
    result = { state: "current", cache_root: resolvePluginSettingsCacheRoot() };
  } else if (operation === "read") {
    result = await readPluginSettingsCache(input);
  } else if (operation === "commit") {
    result = await commitPluginSettingsCache(input);
  } else if (operation === "invalidate") {
    result = await invalidatePluginSettingsCache(input);
  } else if (operation === "read_receipt") {
    result = await readPluginSettingsInitializationReceipt(input);
  } else if (operation === "commit_receipt") {
    result = await commitPluginSettingsInitializationReceipt(input);
  } else {
    throw new Error(
      "operation must be root, read, commit, invalidate, read_receipt, or commit_receipt"
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
