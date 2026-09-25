#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const schemaVersion = "bos-document-cache/v1";
const requiredAuthorityFields = [
  "organization_id",
  "installation_id",
  "actor_user_id",
  "delegated_role_id",
  "application",
  "skill_group"
];

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
        .map((key) => [key, normalizeJson(value[key], `${label}.${key}`)])
    );
  }
  throw new Error(`${label} must contain JSON values only`);
}

export function canonicalJson(value) {
  return JSON.stringify(normalizeJson(value));
}

export function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function privateRoot(path) {
  if (!isAbsolute(path)) {
    throw new Error("BOS_DOCUMENT_CACHE_DIR must be an absolute path");
  }
  return resolve(path);
}

export function resolveDocumentCacheRoot({
  platform = process.platform,
  environment = process.env,
  userHome = homedir()
} = {}) {
  if (environment.BOS_DOCUMENT_CACHE_DIR) {
    return privateRoot(environment.BOS_DOCUMENT_CACHE_DIR);
  }
  if (platform === "darwin") {
    return join(userHome, "Library", "Caches", "ai.dfsm.bos", "documents", "v1");
  }
  if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA ||
      join(userHome, "AppData", "Local");
    return join(localAppData, "DFSM", "BOS", "Cache", "documents", "v1");
  }
  const cacheHome = environment.XDG_CACHE_HOME || join(userHome, ".cache");
  return join(cacheHome, "ai.dfsm.bos", "documents", "v1");
}

function normalizeInstant(value, label) {
  const text = requireString(value, label);
  const instant = new Date(text);
  if (Number.isNaN(instant.valueOf())) throw new Error(`${label} must be an ISO instant`);
  return instant.toISOString();
}

function normalizeRequest(input) {
  const authorityInput = requireObject(input.authority, "authority");
  const authority = {};
  for (const field of requiredAuthorityFields) {
    authority[field] = requireString(authorityInput[field], `authority.${field}`);
  }
  const sourceInput = requireObject(input.source, "source");
  const source = {
    provider: requireString(sourceInput.provider, "source.provider"),
    account: requireString(sourceInput.account, "source.account")
  };
  const queryInput = requireObject(input.query, "query");
  const query = {
    resource_kind: requireString(queryInput.resource_kind, "query.resource_kind"),
    selector: normalizeJson(queryInput.selector ?? {}, "query.selector")
  };
  const windowInput = requireObject(input.window, "window");
  const window = {
    from: normalizeInstant(windowInput.from, "window.from"),
    through: normalizeInstant(windowInput.through, "window.through")
  };
  if (Date.parse(window.from) > Date.parse(window.through)) {
    throw new Error("window.from must be at or before window.through");
  }
  const refreshThrough = normalizeInstant(
    input.refresh_through,
    "refresh_through"
  );
  const sourceIdentity = { ...source, resource_kind: query.resource_kind };
  const freshnessInput = input.freshness_policy === undefined
    ? null
    : requireObject(input.freshness_policy, "freshness_policy");
  let freshnessPolicy = null;
  if (freshnessInput !== null) {
    const maxAgeSeconds = freshnessInput.max_age_seconds;
    if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 0 ||
        maxAgeSeconds > 31_536_000) {
      throw new Error(
        "freshness_policy.max_age_seconds must be an integer from 0 through 31536000"
      );
    }
    if (freshnessInput.allow_stale_on_error !== undefined &&
        typeof freshnessInput.allow_stale_on_error !== "boolean") {
      throw new Error("freshness_policy.allow_stale_on_error must be a boolean");
    }
    freshnessPolicy = {
      max_age_seconds: maxAgeSeconds,
      allow_stale_on_error: freshnessInput.allow_stale_on_error ?? false
    };
  }
  return {
    authority,
    source,
    query,
    window,
    refresh_through: refreshThrough,
    freshness_policy: freshnessPolicy,
    authority_key: digest({ ...authority, source_account: source.account }),
    provider_key: digest(source),
    source_key: digest(sourceIdentity),
    query_key: digest({ source: sourceIdentity, selector: query.selector })
  };
}

function cacheRootFromInput(input, options = {}) {
  if (options.cacheRoot) return privateRoot(options.cacheRoot);
  return resolveDocumentCacheRoot(options);
}

function locations(root, request) {
  const scope = join(root, "scopes", request.authority_key);
  const queryDirectory = join(scope, "queries");
  const stem = join(queryDirectory, request.query_key);
  return {
    root,
    queryDirectory,
    manifest: `${stem}.json`,
    lease: `${stem}.lease.json`,
    mutationLock: join(root, "locks", `${request.authority_key}.mutation.lock.json`),
    objects: join(root, "objects")
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

function emptyManifest(request) {
  return {
    schema_version: schemaVersion,
    authority_key: request.authority_key,
    provider_key: request.provider_key,
    source_key: request.source_key,
    query_key: request.query_key,
    coverage: [],
    watermark: null,
    sync_completed_at: null,
    resources: {}
  };
}

function validateManifest(manifest, request) {
  if (manifest.schema_version !== schemaVersion ||
      manifest.authority_key !== request.authority_key ||
      manifest.source_key !== request.source_key ||
      (manifest.provider_key !== undefined && manifest.provider_key !== request.provider_key) ||
      manifest.query_key !== request.query_key ||
      !Array.isArray(manifest.coverage) ||
      !manifest.resources || typeof manifest.resources !== "object") {
    throw new Error("cache manifest is invalid or belongs to another request");
  }
  return manifest;
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .map((interval) => ({
      from: normalizeInstant(interval.from, "coverage.from"),
      through: normalizeInstant(interval.through, "coverage.through")
    }))
    .sort((left, right) => Date.parse(left.from) - Date.parse(right.from));
  const merged = [];
  for (const interval of sorted) {
    if (Date.parse(interval.from) > Date.parse(interval.through)) {
      throw new Error("coverage.from must be at or before coverage.through");
    }
    const previous = merged.at(-1);
    if (!previous || Date.parse(interval.from) > Date.parse(previous.through)) {
      merged.push(interval);
      continue;
    }
    if (Date.parse(interval.through) > Date.parse(previous.through)) {
      previous.through = interval.through;
    }
  }
  return merged;
}

function missingIntervals(requested, coverage) {
  const gaps = [];
  let cursor = Date.parse(requested.from);
  const end = Date.parse(requested.through);
  for (const interval of mergeIntervals(coverage)) {
    const start = Math.max(Date.parse(interval.from), cursor);
    const through = Math.min(Date.parse(interval.through), end);
    if (through < cursor || start > end) continue;
    if (start > cursor) {
      gaps.push({
        from: new Date(cursor).toISOString(),
        through: new Date(start).toISOString()
      });
    }
    cursor = Math.max(cursor, through);
  }
  if (cursor < end) {
    gaps.push({
      from: new Date(cursor).toISOString(),
      through: new Date(end).toISOString()
    });
  }
  return gaps;
}

function freshnessEvidence(request, manifest, now) {
  const completed = manifest.sync_completed_at;
  const policy = request.freshness_policy;
  if (!completed) {
    return {
      freshness_status: "missing",
      age_seconds: null,
      max_age_seconds: policy?.max_age_seconds ?? null,
      allow_stale_on_error: policy?.allow_stale_on_error ?? false,
      stale: false
    };
  }
  const ageSeconds = Math.max(
    0,
    Math.floor((now.valueOf() - Date.parse(completed)) / 1000)
  );
  const stale = policy !== null && ageSeconds > policy.max_age_seconds;
  return {
    freshness_status: stale ? "stale" : "fresh",
    age_seconds: ageSeconds,
    max_age_seconds: policy?.max_age_seconds ?? null,
    allow_stale_on_error: policy?.allow_stale_on_error ?? false,
    stale
  };
}

function syncPlan(request, manifest, now = new Date()) {
  const coverageGaps = missingIntervals(request.window, manifest.coverage);
  const previousThrough = manifest.watermark?.through ?? null;
  const changeGap = !previousThrough ||
    Date.parse(previousThrough) < Date.parse(request.refresh_through)
    ? { after: previousThrough, through: request.refresh_through }
    : null;
  const freshness = freshnessEvidence(request, manifest, now);
  const needsContent = coverageGaps.length || changeGap;
  return {
    state: needsContent
      ? (manifest.sync_completed_at ? "catch_up" : "cold")
      : (freshness.stale ? "refresh_required" : "current"),
    authority_key: request.authority_key,
    source_key: request.source_key,
    query_key: request.query_key,
    coverage_gaps: coverageGaps,
    change_gap: changeGap,
    cursor: manifest.watermark?.cursor ?? null,
    cached_resource_count: Object.values(manifest.resources)
      .filter((resource) => !resource.deleted).length,
    sync_completed_at: manifest.sync_completed_at,
    origin: manifest.sync_completed_at ? "cache" : null,
    ...freshness
  };
}

async function loadManifest(path, request) {
  const manifest = await readJson(path, emptyManifest(request));
  return validateManifest(manifest, request);
}

async function acquireLease(path, request, leaseMs, now) {
  const lease = {
    schema_version: schemaVersion,
    token: randomUUID(),
    authority_key: request.authority_key,
    provider_key: request.provider_key,
    source_key: request.source_key,
    query_key: request.query_key,
    request_key: digest({
      authority_key: request.authority_key,
      query_key: request.query_key,
      window: request.window,
      refresh_through: request.refresh_through
    }),
    expires_at: new Date(now.valueOf() + leaseMs).toISOString()
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(lease, null, 2)}\n`);
      await handle.close();
      await chmod(path, 0o600);
      return { acquired: true, lease };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const current = await readJson(path, null);
      if (current && Date.parse(current.expires_at) > now.valueOf()) {
        return {
          acquired: false,
          retry_after_ms: Math.max(0, Date.parse(current.expires_at) - now.valueOf())
        };
      }
      await rm(path, { force: true });
    }
  }
  return { acquired: false, retry_after_ms: leaseMs };
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function reclaimExpiredAuthorityMutationLock(
  path,
  observed,
  { now, isProcessAlive }
) {
  if (!observed?.token || Date.parse(observed.expires_at) > now.valueOf() ||
      isProcessAlive(observed.pid)) return false;
  const reclaimPath = `${path}.reclaim.${digest(observed.token)}`;
  let handle;
  try {
    handle = await open(reclaimPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({ token: observed.token, pid: process.pid })}\n`);
    await handle.close();
    handle = null;
    await chmod(reclaimPath, 0o600);
  } catch (error) {
    if (handle) await handle.close();
    if (error.code === "EEXIST") return false;
    throw error;
  }
  try {
    const current = await readJson(path, null);
    if (current?.token !== observed.token ||
        Date.parse(current.expires_at) > now.valueOf() ||
        isProcessAlive(current.pid)) return false;
    await rm(path, { force: true });
    return true;
  } finally {
    await rm(reclaimPath, { force: true });
  }
}

async function acquireAuthorityMutationLock(path, options = {}) {
  await ensurePrivateDirectory(dirname(path));
  const token = randomUUID();
  const leaseMs = options.mutationLockLeaseMs ?? 600_000;
  const isProcessAlive = options.processAlive ?? processIsAlive;
  if (!Number.isInteger(leaseMs) || leaseMs < 20 || leaseMs > 600_000) {
    throw new Error("mutationLockLeaseMs must be an integer from 20 through 600000");
  }
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const now = new Date();
    const expiresAt = new Date(now.valueOf() + leaseMs).toISOString();
    try {
      const handle = await open(path, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ token, pid: process.pid, expires_at: expiresAt })}\n`);
      await handle.close();
      await chmod(path, 0o600);
      return { token, pid: process.pid, expires_at: expiresAt, leaseMs };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const current = await readJson(path, null);
      if (!current) continue;
      if (await reclaimExpiredAuthorityMutationLock(path, current, {
        now,
        isProcessAlive
      })) {
        continue;
      }
      await delay(10);
    }
  }
  throw new Error("cache authority mutation is busy");
}

async function releaseAuthorityMutationLock(path, token) {
  const current = await readJson(path, null);
  if (current?.token === token) await rm(path, { force: true });
}

async function renewAuthorityMutationLock(path, lock) {
  const current = await readJson(path, null);
  if (current?.token !== lock.token || current.pid !== lock.pid) {
    throw new Error("cache authority mutation lock ownership was lost");
  }
  const expiresAt = new Date(Date.now() + lock.leaseMs).toISOString();
  await atomicWriteJson(path, { ...current, expires_at: expiresAt });
  lock.expires_at = expiresAt;
}

async function withAuthorityMutationLock(path, operation, options = {}) {
  const lock = await acquireAuthorityMutationLock(path, options);
  const heartbeatMs = options.mutationLockHeartbeatMs ??
    Math.max(10, Math.floor(lock.leaseMs / 3));
  if (!Number.isInteger(heartbeatMs) || heartbeatMs < 5 || heartbeatMs >= lock.leaseMs) {
    await releaseAuthorityMutationLock(path, lock.token);
    throw new Error("mutationLockHeartbeatMs must be an integer below the lock lease");
  }
  let timer;
  let renewal = Promise.resolve();
  let renewalError;
  let stopped = false;
  const scheduleRenewal = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      renewal = renewAuthorityMutationLock(path, lock)
        .then(scheduleRenewal)
        .catch((error) => { renewalError = error; });
    }, heartbeatMs);
  };
  scheduleRenewal();
  try {
    const result = await operation();
    await renewal;
    if (renewalError) throw renewalError;
    await renewAuthorityMutationLock(path, lock);
    return result;
  } finally {
    stopped = true;
    clearTimeout(timer);
    await renewal.catch(() => {});
    clearTimeout(timer);
    await releaseAuthorityMutationLock(path, lock.token);
  }
}

export async function beginDocumentSync(input, options = {}) {
  const request = normalizeRequest(input);
  const root = cacheRootFromInput(input, options);
  const path = locations(root, request);
  await ensurePrivateDirectory(path.root);
  await ensurePrivateDirectory(path.queryDirectory);
  const now = options.now ? new Date(options.now) : new Date();
  const leaseMs = input.lease_ms ?? 120_000;
  if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 600_000) {
    throw new Error("lease_ms must be an integer from 1000 through 600000");
  }
  return withAuthorityMutationLock(path.mutationLock, async () => {
    const acquired = await acquireLease(path.lease, request, leaseMs, now);
    if (!acquired.acquired) {
      return {
        state: "busy",
        authority_key: request.authority_key,
        query_key: request.query_key,
        retry_after_ms: acquired.retry_after_ms
      };
    }
    if (typeof options.afterLeaseAcquired === "function") {
      await options.afterLeaseAcquired();
    }
    const manifest = await loadManifest(path.manifest, request);
    const plan = syncPlan(request, manifest, now);
    if (plan.state === "current") {
      await rm(path.lease, { force: true });
      return plan;
    }
    return {
      ...plan,
      lease_token: acquired.lease.token,
      lease_expires_at: acquired.lease.expires_at
    };
  }, options);
}

async function requireLease(path, token) {
  const lease = await readJson(path, null);
  if (!lease || lease.schema_version !== schemaVersion || lease.token !== token) {
    throw new Error("cache lease is missing, expired, or owned by another process");
  }
  return lease;
}

function normalizeDocument(document, index) {
  requireObject(document, `documents[${index}]`);
  if (Object.hasOwn(document, "deleted") && typeof document.deleted !== "boolean") {
    throw new Error(`documents[${index}].deleted must be a boolean`);
  }
  const deleted = document.deleted === true;
  const allowed = new Set([
    "resource_id", "version", "modified_at", "deleted",
    ...(deleted ? [] : ["payload"])
  ]);
  for (const key of Object.keys(document)) {
    if (!allowed.has(key)) {
      throw new Error(`documents[${index}] contains unsupported field ${key}`);
    }
  }
  const normalized = {
    resource_id: requireString(document.resource_id, `documents[${index}].resource_id`),
    version: requireString(document.version, `documents[${index}].version`),
    modified_at: normalizeInstant(
      document.modified_at,
      `documents[${index}].modified_at`
    ),
    deleted
  };
  if (!deleted) normalized.payload = normalizeJson(document.payload, `documents[${index}].payload`);
  return normalized;
}

async function storeDocumentObject(path, request, document) {
  const envelope = {
    schema_version: schemaVersion,
    source_key: request.source_key,
    resource_id: document.resource_id,
    version: document.version,
    modified_at: document.modified_at,
    payload: document.payload
  };
  const objectHash = digest(envelope);
  const objectPath = join(path.objects, objectHash.slice(0, 2), `${objectHash}.json`);
  try {
    await atomicWriteJson(objectPath, envelope);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  return objectHash;
}

export async function commitDocumentSync(input, options = {}) {
  const request = normalizeRequest(input);
  const token = requireString(input.lease_token, "lease_token");
  const root = cacheRootFromInput(input, options);
  const path = locations(root, request);
  return withAuthorityMutationLock(path.mutationLock, async () => {
    await requireLease(path.lease, token);
    const manifest = await loadManifest(path.manifest, request);
    const documents = (input.documents ?? []).map(normalizeDocument);
    const resources = { ...manifest.resources };
    for (const document of documents) {
      const resourceKey = digest({
        source_key: request.source_key,
        resource_id: document.resource_id
      });
      const objectHash = document.deleted ? null :
        await storeDocumentObject(path, request, document);
      resources[resourceKey] = {
        object_hash: objectHash,
        version: document.version,
        modified_at: document.modified_at,
        deleted: document.deleted
      };
    }
    const suppliedCoverage = input.covered_intervals ?? [request.window];
    if (!Array.isArray(suppliedCoverage)) {
      throw new Error("covered_intervals must be an array");
    }
    const completedAt = options.now ? new Date(options.now) : new Date();
    const nextCursor = Object.hasOwn(input, "next_cursor") ? input.next_cursor :
      manifest.watermark?.cursor ?? null;
    if (nextCursor !== null && typeof nextCursor !== "string") {
      throw new Error("next_cursor must be a string or null");
    }
    const next = {
      ...manifest,
      provider_key: request.provider_key,
      coverage: mergeIntervals([...manifest.coverage, ...suppliedCoverage]),
      watermark: { through: request.refresh_through, cursor: nextCursor },
      sync_completed_at: completedAt.toISOString(),
      resources
    };
    if (typeof options.beforeManifestPublish === "function") {
      await options.beforeManifestPublish();
    }
    await requireLease(path.lease, token);
    await atomicWriteJson(path.manifest, next);
    await rm(path.lease, { force: true });
    return {
      state: "committed",
      authority_key: request.authority_key,
      query_key: request.query_key,
      document_count: documents.filter((document) => !document.deleted).length,
      tombstone_count: documents.filter((document) => document.deleted).length,
      cached_resource_count: Object.values(resources)
        .filter((resource) => !resource.deleted).length,
      sync_completed_at: next.sync_completed_at
    };
  }, options);
}

export async function abortDocumentSync(input, options = {}) {
  const request = normalizeRequest(input);
  const token = requireString(input.lease_token, "lease_token");
  const root = cacheRootFromInput(input, options);
  const path = locations(root, request);
  return withAuthorityMutationLock(path.mutationLock, async () => {
    await requireLease(path.lease, token);
    await rm(path.lease, { force: true });
    return {
      state: "aborted",
      authority_key: request.authority_key,
      query_key: request.query_key
    };
  }, options);
}

export async function readDocumentCache(input, options = {}) {
  const request = normalizeRequest(input);
  const root = cacheRootFromInput(input, options);
  const path = locations(root, request);
  const manifest = await loadManifest(path.manifest, request);
  const documents = [];
  for (const resource of Object.values(manifest.resources)) {
    if (resource.deleted || !resource.object_hash) continue;
    const objectPath = join(
      path.objects,
      resource.object_hash.slice(0, 2),
      `${resource.object_hash}.json`
    );
    const envelope = await readJson(objectPath, null);
    if (!envelope || envelope.schema_version !== schemaVersion ||
        envelope.source_key !== request.source_key) {
      throw new Error("cache object is missing or invalid");
    }
    documents.push({
      resource_id: envelope.resource_id,
      version: envelope.version,
      modified_at: envelope.modified_at,
      payload: envelope.payload
    });
  }
  documents.sort((left, right) =>
    left.resource_id.localeCompare(right.resource_id) ||
    left.version.localeCompare(right.version)
  );
  const now = options.now ? new Date(options.now) : new Date();
  return {
    ...syncPlan(request, manifest, now),
    documents
  };
}

export async function inspectDocumentCache(input, options = {}) {
  const result = await readDocumentCache(input, options);
  const { documents, ...metadata } = result;
  return { ...metadata, document_count: documents.length };
}

export async function invalidateDocumentCache(input, options = {}) {
  const request = normalizeRequest(input);
  const root = cacheRootFromInput(input, options);
  const path = locations(root, request);
  return withAuthorityMutationLock(path.mutationLock, async () => {
    await rm(path.manifest, { force: true });
    await rm(path.lease, { force: true });
    return {
      state: "invalidated",
      authority_key: request.authority_key,
      source_key: request.source_key,
      query_key: request.query_key
    };
  }, options);
}

async function invalidateMatchingQueries(root, request, predicate) {
  const path = locations(root, request);
  let entries = [];
  try {
    entries = await readdir(path.queryDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const invalidated = new Set();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const candidatePath = join(path.queryDirectory, entry.name);
    const candidate = await readJson(candidatePath, null);
    if (!candidate || (candidate.authority_key !== undefined &&
        candidate.authority_key !== request.authority_key)) continue;
    if (!predicate(candidate)) continue;
    const stem = candidatePath.slice(
      0,
      entry.name.endsWith(".lease.json") ? -11 : -5
    );
    await rm(`${stem}.json`, { force: true });
    await rm(`${stem}.lease.json`, { force: true });
    invalidated.add(candidate.query_key ?? stem);
  }
  return invalidated.size;
}

export async function invalidateDocumentCacheDataset(input, options = {}) {
  const request = normalizeRequest(input);
  const root = cacheRootFromInput(input, options);
  const path = locations(root, request);
  return withAuthorityMutationLock(path.mutationLock, async () => {
    const invalidated = await invalidateMatchingQueries(
      root,
      request,
      // A lease created by an older v1 client may not include its source key.
      // Remove it conservatively inside this authority scope.
      (manifest) => manifest.source_key === undefined ||
        manifest.source_key === request.source_key
    );
    return {
      state: "invalidated",
      scope: "dataset",
      authority_key: request.authority_key,
      source_key: request.source_key,
      invalidated_query_count: invalidated
    };
  }, options);
}

export async function invalidateDocumentCacheSource(input, options = {}) {
  const request = normalizeRequest(input);
  const root = cacheRootFromInput(input, options);
  const path = locations(root, request);
  return withAuthorityMutationLock(path.mutationLock, async () => {
    const invalidated = await invalidateMatchingQueries(
      root,
      request,
      // A v1 manifest created before provider_key existed cannot be safely
      // attributed to one source. Remove it conservatively during source-level
      // maintenance rather than risk retaining stale data.
      (manifest) => manifest.provider_key === undefined ||
        manifest.provider_key === request.provider_key
    );
    return {
      state: "invalidated",
      scope: "source",
      authority_key: request.authority_key,
      invalidated_query_count: invalidated
    };
  }, options);
}

export async function invalidateDocumentCacheAuthority(input, options = {}) {
  const request = normalizeRequest(input);
  const root = cacheRootFromInput(input, options);
  const path = locations(root, request);
  return withAuthorityMutationLock(path.mutationLock, async () => {
    await rm(resolve(path.queryDirectory, ".."), { recursive: true, force: true });
    return {
      state: "invalidated",
      scope: "current_authority",
      authority_key: request.authority_key
    };
  });
}

async function runCli() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const operation = requireString(input.operation, "operation");
  let result;
  if (operation === "root") {
    result = { state: "current", cache_root: resolveDocumentCacheRoot() };
  } else if (operation === "begin") {
    result = await beginDocumentSync(input);
  } else if (operation === "commit") {
    result = await commitDocumentSync(input);
  } else if (operation === "abort") {
    result = await abortDocumentSync(input);
  } else if (operation === "read") {
    result = await readDocumentCache(input);
  } else if (operation === "inspect") {
    result = await inspectDocumentCache(input);
  } else if (operation === "invalidate") {
    result = await invalidateDocumentCache(input);
  } else if (operation === "invalidate_dataset") {
    result = await invalidateDocumentCacheDataset(input);
  } else if (operation === "invalidate_source") {
    result = await invalidateDocumentCacheSource(input);
  } else if (operation === "invalidate_current_authority") {
    result = await invalidateDocumentCacheAuthority(input);
  } else {
    throw new Error(
      "operation must be root, begin, commit, abort, read, inspect, invalidate, invalidate_dataset, invalidate_source, or invalidate_current_authority"
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
