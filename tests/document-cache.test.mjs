import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  abortDocumentSync,
  beginDocumentSync,
  canonicalJson,
  commitDocumentSync,
  digest,
  inspectDocumentCache,
  invalidateDocumentCache,
  invalidateDocumentCacheAuthority,
  invalidateDocumentCacheDataset,
  invalidateDocumentCacheSource,
  readDocumentCache,
  resolveDocumentCacheRoot
} from "../source/host-runtime/bos-shared-cache/document-cache.mjs";

const baseRequest = {
  authority: {
    organization_id: "org-example",
    installation_id: "installation-example",
    actor_user_id: "user-example",
    delegated_role_id: "role-example",
    application: "lead-director",
    skill_group: "education-center"
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

test("configured maximum age requires refresh and exposes freshness evidence", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const request = {
    ...baseRequest,
    freshness_policy: {
      max_age_seconds: 300,
      allow_stale_on_error: false
    }
  };
  const cold = await beginDocumentSync(request, {
    cacheRoot,
    now: "2026-08-11T00:00:00.000Z"
  });
  await commitDocumentSync({
    ...request,
    lease_token: cold.lease_token,
    documents: []
  }, { cacheRoot, now: "2026-08-11T00:00:01.000Z" });

  const fresh = await readDocumentCache(request, {
    cacheRoot,
    now: "2026-08-11T00:05:01.000Z"
  });
  assert.equal(fresh.state, "current");
  assert.equal(fresh.freshness_status, "fresh");
  assert.equal(fresh.age_seconds, 300);
  assert.equal(fresh.max_age_seconds, 300);
  assert.equal(fresh.origin, "cache");

  const stale = await beginDocumentSync(request, {
    cacheRoot,
    now: "2026-08-11T00:05:02.000Z"
  });
  assert.equal(stale.state, "refresh_required");
  assert.equal(stale.freshness_status, "stale");
  assert.equal(stale.age_seconds, 301);
  assert.ok(stale.lease_token);
  await abortDocumentSync(
    { ...request, lease_token: stale.lease_token },
    { cacheRoot }
  );
});

test("cache inspection and invalidation preserve authority-scoped behavior", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const cold = await beginDocumentSync(baseRequest, { cacheRoot });
  await commitDocumentSync({
    ...baseRequest,
    lease_token: cold.lease_token,
    documents: [{
      resource_id: "record-1",
      version: "v1",
      modified_at: "2026-08-10T12:00:00.000Z",
      payload: { display_name: "Example" }
    }]
  }, { cacheRoot, now: "2026-08-11T00:00:01.000Z" });

  const inspected = await inspectDocumentCache(baseRequest, { cacheRoot });
  assert.equal(inspected.document_count, 1);
  assert.equal(Object.hasOwn(inspected, "documents"), false);

  const invalidated = await invalidateDocumentCache(baseRequest, { cacheRoot });
  assert.equal(invalidated.state, "invalidated");
  const after = await readDocumentCache(baseRequest, { cacheRoot });
  assert.equal(after.state, "cold");
  assert.deepEqual(after.documents, []);
});

test("all invalidation scopes serialize with in-flight commits and cannot resurrect data", async (context) => {
  const invalidators = [
    ["exact", invalidateDocumentCache],
    ["dataset", invalidateDocumentCacheDataset],
    ["source", invalidateDocumentCacheSource],
    ["authority", invalidateDocumentCacheAuthority]
  ];

  for (const [scope, invalidate] of invalidators) {
    const cacheRoot = await temporaryCache(context);
    const plan = await beginDocumentSync(baseRequest, { cacheRoot });
    let publishReached;
    const atPublish = new Promise((resolve) => { publishReached = resolve; });
    let releasePublish;
    const publishGate = new Promise((resolve) => { releasePublish = resolve; });
    const commit = commitDocumentSync({
      ...baseRequest,
      lease_token: plan.lease_token,
      documents: [{
        resource_id: `race-${scope}`,
        version: "v1",
        modified_at: "2026-08-10T12:00:00.000Z",
        payload: { scope }
      }]
    }, {
      cacheRoot,
      beforeManifestPublish: async () => {
        publishReached();
        await publishGate;
      }
    });
    await atPublish;

    let invalidationFinished = false;
    const invalidation = invalidate(baseRequest, { cacheRoot }).then((result) => {
      invalidationFinished = true;
      return result;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      invalidationFinished,
      false,
      `${scope} invalidation must wait for the in-flight manifest publication`
    );

    releasePublish();
    assert.equal((await commit).state, "committed");
    assert.equal((await invalidation).state, "invalidated");
    const after = await readDocumentCache(baseRequest, { cacheRoot });
    assert.equal(after.state, "cold", `${scope} invalidation must win after serialization`);
    assert.deepEqual(after.documents, []);
  }
});

test("all invalidation scopes revoke refreshes that began before invalidation", async (context) => {
  const invalidators = [
    ["exact", invalidateDocumentCache],
    ["dataset", invalidateDocumentCacheDataset],
    ["source", invalidateDocumentCacheSource],
    ["authority", invalidateDocumentCacheAuthority]
  ];

  for (const [scope, invalidate] of invalidators) {
    const cacheRoot = await temporaryCache(context);
    let leaseReached;
    const atLease = new Promise((resolve) => { leaseReached = resolve; });
    let releaseBegin;
    const beginGate = new Promise((resolve) => { releaseBegin = resolve; });
    const begin = beginDocumentSync(baseRequest, {
      cacheRoot,
      afterLeaseAcquired: async () => {
        leaseReached();
        await beginGate;
      }
    });
    await atLease;

    let invalidationFinished = false;
    const invalidation = invalidate(baseRequest, { cacheRoot }).then((result) => {
      invalidationFinished = true;
      return result;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      invalidationFinished,
      false,
      `${scope} invalidation must wait for lease publication`
    );

    releaseBegin();
    const plan = await begin;
    assert.ok(plan.lease_token);
    assert.equal((await invalidation).state, "invalidated");
    await assert.rejects(
      commitDocumentSync({
        ...baseRequest,
        lease_token: plan.lease_token,
        documents: [{
          resource_id: `pre-invalidation-${scope}`,
          version: "v1",
          modified_at: "2026-08-10T12:00:00.000Z",
          payload: { scope }
        }]
      }, { cacheRoot }),
      /cache lease is missing/
    );
    const after = await readDocumentCache(baseRequest, { cacheRoot });
    assert.equal(after.state, "cold");
    assert.deepEqual(after.documents, []);
  }
});

test("authority mutation ownership survives lease expiry and stale takeover is single-owner", async (context) => {
  const cacheRoot = await temporaryCache(context);
  let leaseReached;
  const atLease = new Promise((resolve) => { leaseReached = resolve; });
  let releaseBegin;
  const beginGate = new Promise((resolve) => { releaseBegin = resolve; });
  const begin = beginDocumentSync(baseRequest, {
    cacheRoot,
    mutationLockLeaseMs: 30,
    mutationLockHeartbeatMs: 5,
    afterLeaseAcquired: async () => {
      leaseReached();
      await beginGate;
    }
  });
  await atLease;
  await new Promise((resolve) => setTimeout(resolve, 65));

  let invalidationFinished = false;
  const invalidation = invalidateDocumentCache(baseRequest, {
    cacheRoot,
    mutationLockLeaseMs: 30,
    mutationLockHeartbeatMs: 5
  }).then((result) => {
    invalidationFinished = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(invalidationFinished, false, "a live renewed owner must remain exclusive");
  releaseBegin();
  const plan = await begin;
  assert.ok(plan.lease_token);
  assert.equal((await invalidation).state, "invalidated");

  const probe = await beginDocumentSync(baseRequest, { cacheRoot });
  await abortDocumentSync({ ...baseRequest, lease_token: probe.lease_token }, { cacheRoot });
  const lockDirectory = join(cacheRoot, "locks");
  const lockPath = join(lockDirectory, `${probe.authority_key}.mutation.lock.json`);
  await mkdir(lockDirectory, { recursive: true });
  await writeFile(lockPath, `${JSON.stringify({
    token: "abandoned-lock",
    pid: 999_999_999,
    expires_at: "2000-01-01T00:00:00.000Z"
  })}\n`);

  const contenderOptions = {
    cacheRoot,
    mutationLockLeaseMs: 1_000,
    mutationLockHeartbeatMs: 100,
    processAlive: () => false
  };
  const contenders = await Promise.all([
    beginDocumentSync(baseRequest, contenderOptions),
    beginDocumentSync(baseRequest, contenderOptions)
  ]);
  assert.deepEqual(
    contenders.map((result) => result.state).sort(),
    ["busy", "cold"],
    "two stale-lock contenders must still produce one refresh owner"
  );
  const owner = contenders.find((result) => result.lease_token);
  await abortDocumentSync(
    { ...baseRequest, lease_token: owner.lease_token },
    contenderOptions
  );
});

test("broad invalidation removes legacy lease-only refreshes", async (context) => {
  const invalidators = [
    ["dataset", invalidateDocumentCacheDataset],
    ["source", invalidateDocumentCacheSource],
    ["authority", invalidateDocumentCacheAuthority]
  ];
  for (const [scope, invalidate] of invalidators) {
    const cacheRoot = await temporaryCache(context);
    const plan = await beginDocumentSync(baseRequest, { cacheRoot });
    await abortDocumentSync(
      { ...baseRequest, lease_token: plan.lease_token },
      { cacheRoot }
    );
    const leasePath = join(
      cacheRoot,
      "scopes",
      plan.authority_key,
      "queries",
      `${plan.query_key}.lease.json`
    );
    await writeFile(leasePath, `${JSON.stringify({
      schema_version: "bos-document-cache/v1",
      token: `legacy-${scope}`,
      request_key: "legacy-request",
      expires_at: "2099-01-01T00:00:00.000Z"
    })}\n`);
    assert.equal((await invalidate(baseRequest, { cacheRoot })).state, "invalidated");
    await assert.rejects(access(leasePath), { code: "ENOENT" });
  }
});

test("freshness policy rejects invalid values", async (context) => {
  const cacheRoot = await temporaryCache(context);
  await assert.rejects(
    beginDocumentSync({
      ...baseRequest,
      freshness_policy: { max_age_seconds: -1 }
    }, { cacheRoot }),
    /max_age_seconds/
  );
  await assert.rejects(
    beginDocumentSync({
      ...baseRequest,
      freshness_policy: {
        max_age_seconds: 60,
        allow_stale_on_error: "yes"
      }
    }, { cacheRoot }),
    /allow_stale_on_error/
  );
});

test("commit documents reject payload-bearing tombstones and undeclared fields", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const first = await beginDocumentSync(baseRequest, { cacheRoot });
  await assert.rejects(
    commitDocumentSync({
      ...baseRequest,
      lease_token: first.lease_token,
      documents: [{
        resource_id: "deleted-record",
        version: "v2",
        modified_at: "2026-08-10T12:00:00.000Z",
        deleted: true,
        payload: { must_not_survive: true }
      }]
    }, { cacheRoot }),
    /unsupported field payload/
  );
  await abortDocumentSync(
    { ...baseRequest, lease_token: first.lease_token },
    { cacheRoot }
  );

  const second = await beginDocumentSync(baseRequest, { cacheRoot });
  await assert.rejects(
    commitDocumentSync({
      ...baseRequest,
      lease_token: second.lease_token,
      documents: [{
        resource_id: "live-record",
        version: "v1",
        modified_at: "2026-08-10T12:00:00.000Z",
        payload: { display_name: "Live" },
        private_note: "not in the public contract"
      }]
    }, { cacheRoot }),
    /unsupported field private_note/
  );
  await abortDocumentSync(
    { ...baseRequest, lease_token: second.lease_token },
    { cacheRoot }
  );
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
