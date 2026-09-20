#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  canonicalJson,
  resolveDocumentCacheRoot
} from "./document-cache.mjs";

const schemaVersion = "bos-journey-contract-cache/v1";
const cacheableKinds = new Set([
  "bosl_schema",
  "bosl_reference",
  "bosl_examples",
  "service_description"
]);
const authorityFields = [
  "organization",
  "application",
  "installation",
  "role",
  "user",
  "authority_partition",
  "connection_generation"
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
  return value;
}

function requireCanonicalString(value, label) {
  requireString(value, label);
  if (value !== value.trim()) {
    throw new Error(`${label} must not contain surrounding whitespace`);
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function normalizeAuthority(value) {
  const input = requireObject(value, "authority");
  for (const key of Object.keys(input)) {
    if (!authorityFields.includes(key)) {
      throw new Error(`authority has undeclared field ${key}`);
    }
  }
  return Object.fromEntries(
    authorityFields.map((field) => [
      field,
      requireCanonicalString(input[field], `authority.${field}`)
    ])
  );
}

function normalizeResourceUri(value) {
  requireCanonicalString(value, "resource_uri");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("resource_uri must be an authenticated BOS or HTTPS URI");
  }
  if (!["bos:", "https:"].includes(parsed.protocol) ||
      parsed.username || parsed.password || parsed.hash) {
    throw new Error("resource_uri must be an authenticated BOS or HTTPS URI");
  }
  return value;
}

function normalizeServiceReference(value, required = false) {
  if (value === undefined && !required) return null;
  const reference = requireObject(value, "service_reference");
  const allowed = new Set(["platform", "application", "plugin"]);
  for (const key of Object.keys(reference)) {
    if (!allowed.has(key)) throw new Error(`service_reference.${key} is not allowed`);
  }
  return Object.fromEntries(
    [...allowed].map((field) => [
      field,
      requireCanonicalString(reference[field], `service_reference.${field}`)
    ])
  );
}

function normalizeRequest(input) {
  const authority = normalizeAuthority(input.authority);
  const kind = requireString(input.kind, "kind");
  if (kind === "app.describe") {
    throw new Error("app.describe must remain fresh and cannot be cached");
  }
  if (!cacheableKinds.has(kind)) throw new Error("kind is not a cacheable journey contract");
  const resourceUri = normalizeResourceUri(input.resource_uri);
  const descriptorEtag = requireString(input.descriptor_etag, "descriptor_etag");
  const serviceReference = normalizeServiceReference(
    input.service_reference,
    kind === "service_description"
  );
  let maxAgeSeconds = null;
  if (input.freshness_policy !== undefined) {
    const policy = requireObject(input.freshness_policy, "freshness_policy");
    if (!Number.isInteger(policy.max_age_seconds) ||
        policy.max_age_seconds < 0 ||
        policy.max_age_seconds > 31_536_000) {
      throw new Error(
        "freshness_policy.max_age_seconds must be an integer from 0 through 31536000"
      );
    }
    maxAgeSeconds = policy.max_age_seconds;
  }
  const authorityKey = digest(authority);
  const entryKey = digest({
    authority_key: authorityKey,
    kind,
    resource_uri: resourceUri,
    descriptor_etag: descriptorEtag,
    service_reference: serviceReference
  });
  return {
    authority,
    authority_key: authorityKey,
    entry_key: entryKey,
    kind,
    resource_uri: resourceUri,
    descriptor_etag: descriptorEtag,
    service_reference: serviceReference,
    max_age_seconds: maxAgeSeconds
  };
}

function rootFromOptions(options) {
  const root = options.cacheRoot
    ? resolve(options.cacheRoot)
    : resolveDocumentCacheRoot(options);
  return join(root, "journey-contracts", "v1");
}

function locations(root, request) {
  const partition = join(root, "partitions", request.authority_key);
  return {
    root,
    partition,
    entries: join(partition, "entries"),
    entry: join(partition, "entries", `${request.entry_key}.json`)
  };
}

async function ensurePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function atomicWrite(path, value) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600
  });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

export async function writeJourneyContractCache(input, options = {}) {
  const request = normalizeRequest(input);
  if (!Object.hasOwn(input, "payload")) throw new Error("payload is required");
  canonicalJson(input.payload);
  const root = rootFromOptions(options);
  const path = locations(root, request);
  await ensurePrivateDirectory(root);
  await ensurePrivateDirectory(path.partition);
  await ensurePrivateDirectory(path.entries);
  const storedAt = new Date(options.now ?? Date.now()).toISOString();
  await atomicWrite(path.entry, {
    schema_version: schemaVersion,
    authority_key: request.authority_key,
    entry_key: request.entry_key,
    kind: request.kind,
    resource_uri: request.resource_uri,
    descriptor_etag: request.descriptor_etag,
    service_reference: request.service_reference,
    stored_at: storedAt,
    payload_sha256: digest(input.payload),
    payload: input.payload
  });
  return {
    state: "stored",
    cache_key: request.entry_key,
    stored_at: storedAt
  };
}

export async function readJourneyContractCache(input, options = {}) {
  const request = normalizeRequest(input);
  const path = locations(rootFromOptions(options), request);
  const entry = await readJson(path.entry);
  if (!entry) return { state: "miss", origin: null };
  if (entry.schema_version !== schemaVersion ||
      entry.authority_key !== request.authority_key ||
      entry.entry_key !== request.entry_key ||
      entry.kind !== request.kind ||
      entry.resource_uri !== request.resource_uri ||
      entry.descriptor_etag !== request.descriptor_etag ||
      canonicalJson(entry.service_reference) !== canonicalJson(request.service_reference)) {
    throw new Error("journey contract cache entry is invalid or belongs to another scope");
  }
  if (entry.payload_sha256 !== digest(entry.payload)) {
    throw new Error("journey contract cache payload integrity check failed");
  }
  const now = new Date(options.now ?? Date.now());
  const storedAt = Date.parse(entry.stored_at);
  if (!Number.isFinite(storedAt) || storedAt > now.valueOf()) {
    throw new Error("journey contract cache stored_at is invalid");
  }
  const ageSeconds = Math.max(
    0,
    Math.floor((now.valueOf() - storedAt) / 1000)
  );
  if (request.max_age_seconds !== null && ageSeconds > request.max_age_seconds) {
    return {
      state: "stale",
      origin: "cache",
      cache_key: request.entry_key,
      stored_at: entry.stored_at,
      age_seconds: ageSeconds,
      max_age_seconds: request.max_age_seconds
    };
  }
  return {
    state: "hit",
    origin: "cache",
    cache_key: request.entry_key,
    stored_at: entry.stored_at,
    age_seconds: ageSeconds,
    max_age_seconds: request.max_age_seconds,
    payload: entry.payload
  };
}

async function listEntryPaths(entries) {
  try {
    return (await readdir(entries, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(entries, entry.name));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function invalidateJourneyContractCache(input, options = {}) {
  const authority = normalizeAuthority(input.authority);
  const authorityKey = digest(authority);
  const root = rootFromOptions(options);
  const partition = join(root, "partitions", authorityKey);
  const scope = requireString(input.scope, "scope");
  if (["application", "current_authority"].includes(scope)) {
    await rm(partition, { recursive: true, force: true });
    return { state: "invalidated", scope, removed_count: null };
  }
  const entries = join(partition, "entries");
  let removedCount = 0;
  const targetReference = scope === "service"
    ? normalizeServiceReference(input.service_reference, true)
    : null;
  const targetUri = scope === "resource"
    ? normalizeResourceUri(input.resource_uri)
    : null;
  if (!targetReference && !targetUri) {
    throw new Error("scope must be resource, service, application, or current_authority");
  }
  for (const path of await listEntryPaths(entries)) {
    const entry = await readJson(path);
    if (!entry || entry.authority_key !== authorityKey) continue;
    const matches = targetUri
      ? entry.resource_uri === targetUri
      : canonicalJson(entry.service_reference) === canonicalJson(targetReference);
    if (!matches) continue;
    await rm(path, { force: true });
    removedCount += 1;
  }
  return { state: "invalidated", scope, removed_count: removedCount };
}
