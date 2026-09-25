import {
  abortDocumentSync,
  beginDocumentSync,
  commitDocumentSync,
  inspectDocumentCache,
  invalidateDocumentCache,
  invalidateDocumentCacheAuthority,
  invalidateDocumentCacheDataset,
  invalidateDocumentCacheSource,
  readDocumentCache
} from "./document-cache.mjs";

const schemaVersion = "bos.shared-cache-consumer/v1";
const baseFields = new Set([
  "schema_version", "source", "query", "window", "refresh_through",
  "freshness_policy"
]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requireExactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unsupported field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label}.${key} is required`);
  }
}

function validatePublicRequest(input, operation) {
  requireObject(input, "shared-cache request");
  const required = [...baseFields].filter((field) => field !== "freshness_policy");
  const optional = ["freshness_policy"];
  if (operation === "commit") {
    required.push("lease_token", "documents");
    optional.push("next_cursor", "covered_intervals");
  } else if (operation === "abort") {
    required.push("lease_token");
  }
  requireExactKeys(input, required, optional, "shared-cache request");
  if (input.schema_version !== schemaVersion) {
    throw new TypeError(`shared-cache request.schema_version must be ${schemaVersion}`);
  }
  const source = requireObject(input.source, "shared-cache request.source");
  requireExactKeys(source, ["platform", "application", "plugin"], [],
    "shared-cache request.source");
  const query = requireObject(input.query, "shared-cache request.query");
  requireExactKeys(
    query,
    ["operation", "resource_kind", "selector", "descriptor_token"],
    [],
    "shared-cache request.query"
  );
  requireObject(input.window, "shared-cache request.window");
  return structuredClone(input);
}

// This constructor belongs to the native BOS host runtime. It is deliberately
// outside every packaged skill tree. Only the host can supply the binding
// provider and filesystem root; public products receive the returned object.
export function createHostOwnedSharedCacheConsumer({bindingProvider, cacheRoot}) {
  if (typeof bindingProvider !== "function") {
    throw new TypeError("bindingProvider must be a native BOS host function");
  }
  if (typeof cacheRoot !== "string" || cacheRoot.length === 0) {
    throw new TypeError("cacheRoot must be a native BOS host path");
  }

  const bind = async (publicInput, operation) => {
    const input = validatePublicRequest(publicInput, operation);
    const binding = requireObject(
      await bindingProvider(input.source),
      "native BOS cache binding"
    );
    requireExactKeys(binding, ["authority", "source"], [], "native BOS cache binding");
    const {
      operation: semanticOperation,
      resource_kind,
      selector,
      descriptor_token
    } = input.query;
    return {
      authority: binding.authority,
      source: binding.source,
      query: {
        resource_kind,
        selector: {
          semantic_operation: semanticOperation,
          descriptor_token,
          request: selector
        }
      },
      window: input.window,
      refresh_through: input.refresh_through,
      ...(input.freshness_policy === undefined
        ? {}
        : {freshness_policy: input.freshness_policy}),
      ...(input.lease_token === undefined ? {} : {lease_token: input.lease_token}),
      ...(input.next_cursor === undefined ? {} : {next_cursor: input.next_cursor}),
      ...(input.covered_intervals === undefined
        ? {}
        : {covered_intervals: input.covered_intervals}),
      ...(input.documents === undefined ? {} : {documents: input.documents})
    };
  };
  const options = {cacheRoot};
  return Object.freeze({
    async begin(input) { return beginDocumentSync(await bind(input, "begin"), options); },
    async commit(input) { return commitDocumentSync(await bind(input, "commit"), options); },
    async abort(input) { return abortDocumentSync(await bind(input, "abort"), options); },
    async read(input) { return readDocumentCache(await bind(input, "read"), options); },
    async inspect(input) { return inspectDocumentCache(await bind(input, "inspect"), options); },
    async invalidateExact(input) {
      return invalidateDocumentCache(await bind(input, "invalidateExact"), options);
    },
    async invalidateDataset(input) {
      return invalidateDocumentCacheDataset(await bind(input, "invalidateDataset"), options);
    },
    async invalidateSource(input) {
      return invalidateDocumentCacheSource(await bind(input, "invalidateSource"), options);
    },
    async invalidateCurrentAuthority(input) {
      return invalidateDocumentCacheAuthority(
        await bind(input, "invalidateCurrentAuthority"),
        options
      );
    }
  });
}
