import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  acceptBosSharedCacheConsumer,
  formatSharedCacheFreshness,
  sharedCacheConsumerVersion
} from "../source/platform/bos-mcp-client/scripts/shared-cache-consumer.mjs";
import {
  createHostOwnedSharedCacheConsumer
} from "../source/host-runtime/bos-shared-cache/shared-cache-host.mjs";

const source = {
  platform: "bos",
  application: "lead-director",
  plugin: "calendar-service"
};

const request = {
  schema_version: sharedCacheConsumerVersion,
  source,
  query: {
    operation: "calendar.events.search",
    resource_kind: "calendar-event",
    selector: { calendar: "primary" },
    descriptor_token: "descriptor-1"
  },
  window: {
    from: "2026-09-24T00:00:00.000Z",
    through: "2026-09-25T00:00:00.000Z"
  },
  refresh_through: "2026-09-24T18:00:00.000Z",
  freshness_policy: {
    max_age_seconds: 300,
    allow_stale_on_error: false
  }
};

const bindings = {
  alpha: {
    authority: {
      organization_id: "org-alpha",
      installation_id: "install-alpha",
      actor_user_id: "user-alpha",
      delegated_role_id: "role-alpha",
      application: "lead-director",
      skill_group: "external-product"
    },
    source: { provider: "google-calendar", account: "alpha@example.com" }
  },
  beta: {
    authority: {
      organization_id: "org-beta",
      installation_id: "install-beta",
      actor_user_id: "user-beta",
      delegated_role_id: "role-beta",
      application: "lead-director",
      skill_group: "external-product"
    },
    source: { provider: "google-calendar", account: "beta@example.com" }
  }
};

async function fixture(context) {
  const cacheRoot = await mkdtemp(join(tmpdir(), "bos-shared-cache-consumer-"));
  context.after(() => rm(cacheRoot, { recursive: true, force: true }));
  let partition = "alpha";
  const seen = [];
  const consumer = acceptBosSharedCacheConsumer(createHostOwnedSharedCacheConsumer({
    cacheRoot,
    bindingProvider: async (publicSource) => {
      seen.push(publicSource);
      return bindings[partition];
    }
  }));
  return { consumer, seen, setPartition(value) { partition = value; } };
}

test("external consumer performs atomic refresh without public authority or provider inputs", async (context) => {
  const { consumer, seen } = await fixture(context);
  const cold = await consumer.begin(request);
  assert.equal(cold.state, "cold");
  assert.deepEqual(seen, [source]);
  assert.equal(JSON.stringify(cold).includes("org-alpha"), false);
  assert.equal(JSON.stringify(cold).includes("google-calendar"), false);

  const committed = await consumer.commit({
    ...request,
    lease_token: cold.lease_token,
    next_cursor: "cursor-1",
    documents: [{
      resource_id: "event-1",
      version: "v1",
      modified_at: "2026-09-24T17:00:00.000Z",
      payload: { title: "Enrollment review" }
    }]
  });
  assert.equal(committed.state, "committed");

  const read = await consumer.read(request);
  assert.equal(read.state, "current");
  assert.equal(read.documents.length, 1);
  assert.deepEqual(read.documents[0].payload, { title: "Enrollment review" });
});

test("failed refresh preserves the prior committed result and freshness evidence", async (context) => {
  const { consumer } = await fixture(context);
  const cold = await consumer.begin(request);
  await consumer.commit({
    ...request,
    lease_token: cold.lease_token,
    documents: [{
      resource_id: "event-1",
      version: "v1",
      modified_at: "2026-09-24T17:00:00.000Z",
      payload: { title: "Original" }
    }]
  });
  const catchUpRequest = {
    ...request,
    refresh_through: "2026-09-24T19:00:00.000Z"
  };
  const refresh = await consumer.begin(catchUpRequest);
  assert.equal(refresh.state, "catch_up");
  await consumer.abort({ ...catchUpRequest, lease_token: refresh.lease_token });
  const read = await consumer.read(request);
  assert.equal(read.documents[0].payload.title, "Original");
  const evidence = formatSharedCacheFreshness(read, {
    locale: "en-US",
    timeZone: "America/Denver",
    now: new Date(read.sync_completed_at)
  });
  assert.deepEqual(evidence, {
    origin: "cached",
    last_updated_local: new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium", timeStyle: "medium", timeZone: "America/Denver"
    }).format(new Date(read.sync_completed_at)),
    age_seconds: 0,
    age_human: "0 seconds",
    max_age_seconds: 300
  });
});

test("current BOS authority partitions cache state and maintenance scopes", async (context) => {
  const { consumer, setPartition } = await fixture(context);
  const cold = await consumer.begin(request);
  await consumer.commit({
    ...request,
    lease_token: cold.lease_token,
    documents: [{
      resource_id: "event-1",
      version: "v1",
      modified_at: "2026-09-24T17:00:00.000Z",
      payload: { title: "Alpha only" }
    }]
  });
  setPartition("beta");
  assert.equal((await consumer.read(request)).documents.length, 0);
  setPartition("alpha");
  assert.equal((await consumer.inspect(request)).document_count, 1);
  assert.equal((await consumer.invalidateExact(request)).state, "invalidated");
  assert.equal((await consumer.read(request)).documents.length, 0);

  const next = await consumer.begin(request);
  await consumer.abort({ ...request, lease_token: next.lease_token });
  assert.equal((await consumer.invalidateDataset(request)).scope, "dataset");
  assert.equal((await consumer.invalidateSource(request)).scope, "source");
  assert.equal(
    (await consumer.invalidateCurrentAuthority(request)).scope,
    "current_authority"
  );
});

test("authenticated users in one otherwise identical BOS context remain isolated", async (context) => {
  const cacheRoot = await mkdtemp(join(tmpdir(), "bos-shared-cache-users-"));
  context.after(() => rm(cacheRoot, { recursive: true, force: true }));
  let actor = "user-alpha";
  const consumer = acceptBosSharedCacheConsumer(createHostOwnedSharedCacheConsumer({
    cacheRoot,
    bindingProvider: async () => ({
      ...bindings.alpha,
      authority: { ...bindings.alpha.authority, actor_user_id: actor }
    })
  }));
  const cold = await consumer.begin(request);
  await consumer.commit({
    ...request,
    lease_token: cold.lease_token,
    documents: [{
      resource_id: "event-1",
      version: "v1",
      modified_at: "2026-09-24T17:00:00.000Z",
      payload: { title: "User alpha only" }
    }]
  });
  actor = "user-beta";
  assert.equal((await consumer.read(request)).documents.length, 0);
});

test("public seam accepts only a complete ready consumer and exposes no constructor inputs", () => {
  assert.throws(() => acceptBosSharedCacheConsumer({}), /consumer\.begin is required/);
  const moduleExports = [acceptBosSharedCacheConsumer, formatSharedCacheFreshness];
  assert(moduleExports.every((entry) => typeof entry === "function"));
  assert.equal(acceptBosSharedCacheConsumer.length, 1);
});

test("host boundary rejects every caller-selected authority and storage input", async (context) => {
  const cacheRoot = await mkdtemp(join(tmpdir(), "bos-shared-cache-private-boundary-"));
  context.after(() => rm(cacheRoot, { recursive: true, force: true }));
  const consumer = acceptBosSharedCacheConsumer(createHostOwnedSharedCacheConsumer({
    cacheRoot,
    bindingProvider: async () => bindings.alpha
  }));
  for (const privateInput of [
    {authority: bindings.alpha.authority},
    {provider_account: "attacker@example.com"},
    {cacheRoot: "/tmp/attacker-cache"},
    {partition: "attacker"}
  ]) {
    await assert.rejects(
      consumer.begin({...request, ...privateInput}),
      /unsupported field/
    );
  }
});

test("every generated BOS client publishes a byte-identical runnable consumer seam", async (context) => {
  const root = new URL("..", import.meta.url);
  const canonicalScript = await readFile(new URL(
    "source/platform/bos-mcp-client/scripts/shared-cache-consumer.mjs",
    root
  ));
  const canonicalContract = await readFile(new URL(
    "source/platform/bos-mcp-client/references/shared-cache-consumer.md",
    root
  ));
  const packageRoots = [
    "clients/codex/plugins/bos/skills/bos-mcp-client",
    "clients/claude/plugins/bos/skills/bos-mcp-client",
    "clients/copilot/products/bos/skills/bos-mcp-client",
    "clients/gemini/extensions/bos/skills/bos-mcp-client"
  ];

  for (const packageRoot of packageRoots) {
    const scriptUrl = new URL(`${packageRoot}/scripts/shared-cache-consumer.mjs`, root);
    assert.deepEqual(await readFile(scriptUrl), canonicalScript, packageRoot);
    assert.deepEqual(
      await readFile(new URL(`${packageRoot}/references/shared-cache-consumer.md`, root)),
      canonicalContract,
      packageRoot
    );

    const packaged = await import(`${scriptUrl.href}?package=${encodeURIComponent(packageRoot)}`);
    assert.deepEqual(Object.keys(packaged).sort(), [
      "acceptBosSharedCacheConsumer",
      "formatSharedCacheFreshness",
      "sharedCacheConsumerVersion"
    ]);
    assert.equal("createBosSharedCacheHost" in packaged, false);
    assert.equal("createBosSharedCacheConsumer" in packaged, false);
  }
});
