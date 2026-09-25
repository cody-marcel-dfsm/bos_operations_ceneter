import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
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
} from "../source/host-runtime/bos-shared-cache/document-cache.mjs";

const root = resolve(import.meta.dirname, "..");
const contractRoot = join(root, "contracts", "bos-client-dependency.v1");

const readJson = async (name) => JSON.parse(await readFile(join(contractRoot, name), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const cacheRequest = {
  authority: {
    organization_id: "org-contract",
    installation_id: "installation-contract",
    actor_user_id: "user-contract",
    delegated_role_id: "role-contract",
    application: "lead-director",
    skill_group: "my-crm"
  },
  source: { provider: "calendar", account: "account-contract" },
  query: { resource_kind: "event", selector: { attendee: "user@example.com" } },
  window: {
    from: "2026-09-23T00:00:00.000Z",
    through: "2026-09-24T00:00:00.000Z"
  },
  refresh_through: "2026-09-24T00:00:00.000Z"
};

async function temporaryCache(context) {
  const path = await mkdtemp(join(tmpdir(), "bos-contract-cache-"));
  context.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("immutable BOS client dependency manifest binds contract and executable bytes", async () => {
  const manifest = await readJson("manifest.json");
  assert.equal(manifest.contract, "bos-client-dependency-release/v1");
  assert.equal(manifest.authentication_impact, "preserves-single-bos-connection");
  assert.deepEqual(manifest.executable_files.map(({ id }) => id).sort(), [
    "external_dependency_adapter",
    "external_dependency_discovered_operation_schema",
    "external_dependency_schema_runtime",
    "shared_cache_consumer"
  ]);
  for (const file of manifest.files) {
    assert.equal(sha256(await readFile(join(contractRoot, file.path))), file.sha256, file.path);
  }
  const packageRoots = [
    "clients/codex/plugins/bos",
    "clients/claude/plugins/bos",
    "clients/copilot/products/bos",
    "clients/gemini/extensions/bos"
  ];
  for (const executable of manifest.executable_files) {
    const sourcePath = executable.path
      .replace(/^skills\/bos-external-dependency-adapter/u,
        "source/platform/bos-external-dependency-adapter")
      .replace(/^skills\/bos-mcp-client/u, "source/platform/bos-mcp-client");
    assert.equal(sha256(await readFile(join(root, sourcePath))), executable.sha256, sourcePath);
    for (const packageRoot of packageRoots) {
      assert.equal(
        sha256(await readFile(join(root, packageRoot, executable.path))),
        executable.sha256,
        `${packageRoot}/${executable.path}`
      );
    }
  }
  assert.equal(sha256([
    ...manifest.files.map(({ path, sha256: digest }) =>
      `contract\u0000${path}\u0000${digest}`),
    ...manifest.executable_files.map(({ path, sha256: digest }) =>
      `executable\u0000${path}\u0000${digest}`)
  ].join("\n")), manifest.bundle_sha256);
});

test("published examples satisfy the request and response schemas", async () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  for (const [schemaName, exampleName] of [
    ["discovered-operation.request.schema.json", "discovered-operation.request.example.json"],
    ["discovered-operation.response.schema.json", "discovered-operation.response.example.json"],
    ["shared-cache.request.schema.json", "shared-cache.request.example.json"],
    ["shared-cache.results.schema.json", "shared-cache.results.example.json"]
  ]) {
    const validate = ajv.compile(await readJson(schemaName));
    const value = await readJson(exampleName);
    assert.equal(validate(value), true, `${exampleName}: ${JSON.stringify(validate.errors)}`);
  }
});

test("published cache result schema validates every executable method and state", async (context) => {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  const validate = ajv.compile(await readJson("shared-cache.results.schema.json"));
  const assertResult = (method, result) => {
    assert.equal(
      validate({ [method]: result }),
      true,
      `${method}/${result.state}: ${JSON.stringify(validate.errors)}`
    );
  };
  const cacheRoot = await temporaryCache(context);

  const cold = await beginDocumentSync(cacheRequest, {
    cacheRoot,
    now: "2026-09-24T00:00:01.000Z"
  });
  assertResult("begin", cold);
  const busy = await beginDocumentSync(cacheRequest, {
    cacheRoot,
    now: "2026-09-24T00:00:02.000Z"
  });
  assertResult("begin", busy);
  const committed = await commitDocumentSync({
    ...cacheRequest,
    lease_token: cold.lease_token,
    documents: [{
      resource_id: "event-1",
      version: "v1",
      modified_at: "2026-09-23T18:00:00.000Z",
      payload: { title: "Enrollment review" }
    }]
  }, { cacheRoot, now: "2026-09-24T00:00:03.000Z" });
  assertResult("commit", committed);
  assertResult("read", await readDocumentCache(cacheRequest, {
    cacheRoot,
    now: "2026-09-24T00:00:04.000Z"
  }));
  assertResult("inspect", await inspectDocumentCache(cacheRequest, {
    cacheRoot,
    now: "2026-09-24T00:00:04.000Z"
  }));
  assertResult("begin", await beginDocumentSync(cacheRequest, {
    cacheRoot,
    now: "2026-09-24T00:00:04.000Z"
  }));

  const catchUpRequest = {
    ...cacheRequest,
    refresh_through: "2026-09-24T01:00:00.000Z"
  };
  const catchUp = await beginDocumentSync(catchUpRequest, {
    cacheRoot,
    now: "2026-09-24T01:00:01.000Z"
  });
  assertResult("begin", catchUp);
  const aborted = await abortDocumentSync({
    ...catchUpRequest,
    lease_token: catchUp.lease_token
  }, { cacheRoot });
  assertResult("abort", aborted);

  const staleRequest = {
    ...cacheRequest,
    freshness_policy: { max_age_seconds: 1, allow_stale_on_error: false }
  };
  const stale = await beginDocumentSync(staleRequest, {
    cacheRoot,
    now: "2026-09-24T00:00:05.000Z"
  });
  assertResult("begin", stale);
  await abortDocumentSync({ ...staleRequest, lease_token: stale.lease_token }, { cacheRoot });

  assertResult("invalidate_exact", await invalidateDocumentCache(cacheRequest, { cacheRoot }));
  assertResult("invalidate_dataset", await invalidateDocumentCacheDataset(cacheRequest, { cacheRoot }));
  assertResult("invalidate_source", await invalidateDocumentCacheSource(cacheRequest, { cacheRoot }));
  assertResult(
    "invalidate_current_authority",
    await invalidateDocumentCacheAuthority(cacheRequest, { cacheRoot })
  );

  assert.equal(validate({}), false);
  assert.equal(validate({ begin: cold, commit: committed }), false);
});

test("published cache commit documents exactly match live and tombstone runtime inputs", async () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  const validate = ajv.compile(await readJson("shared-cache.request.schema.json"));
  const request = await readJson("shared-cache.request.example.json");
  const live = {
    ...request,
    lease_token: "lease-live",
    documents: [{
      resource_id: "record-live",
      version: "v1",
      modified_at: "2026-09-24T18:00:00.000Z",
      payload: { display_name: "Live record" }
    }]
  };
  const tombstone = {
    ...request,
    lease_token: "lease-delete",
    documents: [{
      resource_id: "record-deleted",
      version: "v2",
      modified_at: "2026-09-24T18:05:00.000Z",
      deleted: true
    }]
  };
  assert.equal(validate(live), true, JSON.stringify(validate.errors));
  assert.equal(validate(tombstone), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    ...tombstone,
    documents: [{ ...tombstone.documents[0], payload: { hidden: true } }]
  }), false);
  assert.equal(validate({
    ...live,
    documents: [{
      resource_id: "missing-payload",
      version: "v1",
      modified_at: "2026-09-24T18:00:00.000Z"
    }]
  }), false);
  for (const deleted of ["true", 1, null]) {
    assert.equal(validate({
      ...live,
      documents: [{ ...live.documents[0], deleted }]
    }), false);
  }
});

test("runtime rejects non-boolean tombstone markers exactly as the schema does", async (context) => {
  for (const deleted of ["true", 1, null]) {
    const cacheRoot = await temporaryCache(context);
    const cold = await beginDocumentSync(cacheRequest, { cacheRoot });
    await assert.rejects(
      commitDocumentSync({
        ...cacheRequest,
        lease_token: cold.lease_token,
        documents: [{
          resource_id: "event-invalid",
          version: "v1",
          modified_at: "2026-09-24T18:00:00.000Z",
          deleted,
          payload: { title: "Must fail" }
        }]
      }, { cacheRoot }),
      /deleted must be a boolean/
    );
    await abortDocumentSync({ ...cacheRequest, lease_token: cold.lease_token }, { cacheRoot });
  }
});

test("public schemas exclude raw authority and provider inputs", async () => {
  const cacheSchema = JSON.stringify(await readJson("shared-cache.request.schema.json"));
  for (const forbidden of [
    "organization_id", "installation_id", "role_id", "provider_account",
    "access_token", "refresh_token", "context_handle"
  ]) {
    assert.equal(cacheSchema.includes(forbidden), false, forbidden);
  }
  const operationSchema = JSON.stringify(await readJson("discovered-operation.request.schema.json"));
  assert.equal(operationSchema.includes("context_handle"), false);
  assert.match(operationSchema, /X-BOS-Context-Handle/);
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  const validateOperation = ajv.compile(await readJson("discovered-operation.request.schema.json"));
  const operation = await readJson("discovered-operation.request.example.json");
  assert.equal(validateOperation({
    ...operation,
    contact: { ...operation.contact, context_handle: "bos_ctx_v2_private" }
  }), false);
  assert.equal(validateOperation({contact: operation.contact}), false);
  assert.equal(validateOperation({
    contact: {
      ...operation.contact,
      execution: {
        method: null,
        uri: null,
        context_header: null,
        transport: "journey_runtime"
      }
    },
    payload: operation.payload
  }), false);
  assert.equal(validateOperation({
    contact: {
      ...operation.contact,
      execution: {...operation.contact.execution, method: "GET"}
    },
    payload: operation.payload
  }), false);
  assert.equal(validateOperation({
    contact: {
      ...operation.contact,
      execution: {...operation.contact.execution, method: "GET"}
    }
  }), true, JSON.stringify(validateOperation.errors));
});
