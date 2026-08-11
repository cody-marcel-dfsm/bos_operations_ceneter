import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  abortDocumentSync,
  beginDocumentSync,
  canonicalJson,
  commitDocumentSync,
  digest,
  readDocumentCache,
  resolveDocumentCacheRoot
} from "../source/platform/bos-mcp-client/scripts/document-cache.mjs";

const baseRequest = {
  authority: {
    organization_id: "org-example",
    installation_id: "installation-example",
    delegated_role_id: "role-example",
    application: "lead-director",
    skill_group: "icode-operations"
  },
  source: { provider: "google-drive", account: "account-example" },
  query: {
    resource_kind: "document",
    selector: { folder: "operations", mime_types: ["application/pdf"] }
  },
  window: {
    from: "2026-08-01T00:00:00.000Z",
    through: "2026-08-10T00:00:00.000Z"
  },
  refresh_through: "2026-08-11T00:00:00.000Z"
};

async function temporaryCache(context) {
  const path = await mkdtemp(join(tmpdir(), "bos-document-cache-test-"));
  context.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function filesUnder(path) {
  const output = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) await walk(child);
      else output.push(child);
    }
  }
  await walk(path);
  return output;
}

test("all product copies resolve one OS-user document cache root", () => {
  assert.equal(
    resolveDocumentCacheRoot({ platform: "darwin", userHome: "/sample-home", environment: {} }),
    "/sample-home/Library/Caches/ai.dfsm.bos/documents/v1"
  );
  assert.equal(
    resolveDocumentCacheRoot({ platform: "linux", userHome: "/home/example", environment: {} }),
    "/home/example/.cache/ai.dfsm.bos/documents/v1"
  );
  assert.equal(
    resolveDocumentCacheRoot({
      platform: "win32",
      userHome: "C:\\Users\\example",
      environment: { LOCALAPPDATA: "C:\\Users\\example\\AppData\\Local" }
    }),
    "C:\\Users\\example\\AppData\\Local/DFSM/BOS/Cache/documents/v1"
  );
  assert.throws(
    () => resolveDocumentCacheRoot({
      platform: "linux",
      userHome: "/home/example",
      environment: { BOS_DOCUMENT_CACHE_DIR: "relative/cache" }
    }),
    /absolute path/
  );
});

test("canonical fingerprints ignore object property order", () => {
  const left = { source: { provider: "drive", account: "a" }, selector: { b: 2, a: 1 } };
  const right = { selector: { a: 1, b: 2 }, source: { account: "a", provider: "drive" } };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(digest(left), digest(right));
});

test("record windows may extend beyond the source refresh watermark", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const request = {
    ...baseRequest,
    window: {
      from: "2026-08-10T00:00:00.000Z",
      through: "2026-08-17T00:00:00.000Z"
    },
    refresh_through: "2026-08-11T00:00:00.000Z"
  };
  const plan = await beginDocumentSync(request, { cacheRoot });
  assert.equal(plan.state, "cold");
  assert.deepEqual(plan.coverage_gaps, [request.window]);
  await abortDocumentSync({ ...request, lease_token: plan.lease_token }, { cacheRoot });
});

test("completed refreshes expose only the later catch-up gap", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const cold = await beginDocumentSync(baseRequest, {
    cacheRoot,
    now: "2026-08-11T00:00:01.000Z"
  });
  assert.equal(cold.state, "cold");
  assert.deepEqual(cold.coverage_gaps, [baseRequest.window]);
  assert.deepEqual(cold.change_gap, {
    after: null,
    through: baseRequest.refresh_through
  });

  const committed = await commitDocumentSync({
    ...baseRequest,
    lease_token: cold.lease_token,
    next_cursor: "cursor-1",
    documents: [{
      resource_id: "document-1",
      version: "v1",
      modified_at: "2026-08-09T10:00:00.000Z",
      payload: { title: "Operations record", value: 1 }
    }]
  }, { cacheRoot, now: "2026-08-11T00:00:02.000Z" });
  assert.equal(committed.state, "committed");
  assert.equal(committed.sync_completed_at, "2026-08-11T00:00:02.000Z");

  const current = await readDocumentCache(baseRequest, { cacheRoot });
  assert.equal(current.state, "current");
  assert.equal(current.cursor, "cursor-1");
  assert.equal(current.documents.length, 1);

  const laterRequest = {
    ...baseRequest,
    refresh_through: "2026-08-11T02:00:00.000Z"
  };
  const catchUp = await beginDocumentSync(laterRequest, {
    cacheRoot,
    now: "2026-08-11T02:00:01.000Z"
  });
  assert.equal(catchUp.state, "catch_up");
  assert.deepEqual(catchUp.coverage_gaps, []);
  assert.deepEqual(catchUp.change_gap, {
    after: "2026-08-11T00:00:00.000Z",
    through: "2026-08-11T02:00:00.000Z"
  });
  assert.equal(catchUp.cursor, "cursor-1");
});

test("aborted and concurrent refreshes preserve the committed watermark", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const first = await beginDocumentSync(baseRequest, { cacheRoot });
  await commitDocumentSync({
    ...baseRequest,
    lease_token: first.lease_token,
    documents: []
  }, { cacheRoot, now: "2026-08-11T00:00:02.000Z" });

  const laterRequest = {
    ...baseRequest,
    refresh_through: "2026-08-11T03:00:00.000Z"
  };
  const owner = await beginDocumentSync(laterRequest, {
    cacheRoot,
    now: "2026-08-11T03:00:01.000Z"
  });
  const waiter = await beginDocumentSync(laterRequest, {
    cacheRoot,
    now: "2026-08-11T03:00:02.000Z"
  });
  assert.equal(owner.state, "catch_up");
  assert.equal(waiter.state, "busy");
  assert.equal(waiter.query_key, owner.query_key);

  await abortDocumentSync({
    ...laterRequest,
    lease_token: owner.lease_token
  }, { cacheRoot });
  const afterAbort = await readDocumentCache(laterRequest, { cacheRoot });
  assert.equal(afterAbort.state, "catch_up");
  assert.equal(afterAbort.sync_completed_at, "2026-08-11T00:00:02.000Z");
  assert.equal(afterAbort.change_gap.after, baseRequest.refresh_through);
});

test("overlapping queries share immutable objects while authority indexes stay separate", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const document = {
    resource_id: "shared-document",
    version: "v7",
    modified_at: "2026-08-10T12:00:00.000Z",
    payload: { title: "Shared source document", rows: [1, 2, 3] }
  };
  const first = await beginDocumentSync(baseRequest, { cacheRoot });
  await commitDocumentSync({
    ...baseRequest,
    lease_token: first.lease_token,
    documents: [document]
  }, { cacheRoot });

  const overlapping = {
    ...baseRequest,
    query: {
      ...baseRequest.query,
      selector: { folder: "operations", owner: "team" }
    }
  };
  const second = await beginDocumentSync(overlapping, { cacheRoot });
  await commitDocumentSync({
    ...overlapping,
    lease_token: second.lease_token,
    documents: [document]
  }, { cacheRoot });

  const objectFiles = (await filesUnder(join(cacheRoot, "objects")))
    .filter((path) => path.endsWith(".json"));
  assert.equal(objectFiles.length, 1);

  const otherAuthority = {
    ...baseRequest,
    authority: { ...baseRequest.authority, delegated_role_id: "role-other" }
  };
  const isolated = await readDocumentCache(otherAuthority, { cacheRoot });
  assert.equal(isolated.state, "cold");
  assert.deepEqual(isolated.documents, []);
  assert.notEqual(isolated.authority_key, first.authority_key);
});
