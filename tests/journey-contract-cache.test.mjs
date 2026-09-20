import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  invalidateJourneyContractCache,
  readJourneyContractCache,
  writeJourneyContractCache
} from "../source/platform/bos-mcp-client/scripts/journey-contract-cache.mjs";

const authority = {
  organization: "server-org",
  application: "lead-director",
  installation: "server-installation",
  role: "director",
  user: "server-user",
  authority_partition: "opaque-authority-partition",
  connection_generation: "connection-1"
};

async function temporaryCache(context) {
  const path = await mkdtemp(join(tmpdir(), "bos-journey-cache-test-"));
  context.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("journey contract cache requires exact authority, descriptor, URI, and connection", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const request = {
    authority,
    kind: "bosl_schema",
    resource_uri: "bos://apps/lead-director/bosl/schema",
    descriptor_etag: "etag-1"
  };
  await writeJourneyContractCache({
    ...request,
    payload: { type: "object", title: "BOSL" }
  }, { cacheRoot, now: "2026-09-19T12:00:00Z" });

  const hit = await readJourneyContractCache(request, { cacheRoot });
  assert.equal(hit.state, "hit");
  assert.equal(hit.origin, "cache");
  assert.deepEqual(hit.payload, { type: "object", title: "BOSL" });
  assert.equal(Object.hasOwn(hit, "authority"), false);
  assert.equal(Object.hasOwn(hit, "authority_partition"), false);

  const stale = await readJourneyContractCache({
    ...request,
    freshness_policy: { max_age_seconds: 60 }
  }, { cacheRoot, now: "2026-09-19T12:01:01Z" });
  assert.equal(stale.state, "stale");
  assert.equal(Object.hasOwn(stale, "payload"), false);

  for (const changed of [
    { authority: { ...authority, user: "another-user" } },
    { authority: { ...authority, role: "another-role" } },
    { authority: { ...authority, installation: "another-installation" } },
    { authority: { ...authority, application: "another-app" } },
    { authority: { ...authority, authority_partition: "another-partition" } },
    { authority: { ...authority, connection_generation: "connection-2" } },
    { descriptor_etag: "etag-2" }
  ]) {
    const miss = await readJourneyContractCache({ ...request, ...changed }, { cacheRoot });
    assert.equal(miss.state, "miss");
  }

  const rootMode = await stat(cacheRoot);
  assert.equal(rootMode.mode & 0o077, 0);
});

test("app.describe is always fresh and cannot be cached", async (context) => {
  const cacheRoot = await temporaryCache(context);
  await assert.rejects(
    writeJourneyContractCache({
      authority,
      kind: "app.describe",
      resource_uri: "bos://apps/lead-director/describe",
      descriptor_etag: "etag-1",
      payload: {}
    }, { cacheRoot }),
    /app\.describe.*fresh/
  );
});

test("cache identity rejects ambiguous whitespace in authority and resource coordinates", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const request = {
    authority,
    kind: "bosl_schema",
    resource_uri: "bos://apps/lead-director/bosl/schema",
    descriptor_etag: "etag-1",
    payload: {}
  };
  await assert.rejects(
    writeJourneyContractCache({
      ...request,
      authority: { ...authority, role: " director" }
    }, { cacheRoot }),
    /authority\.role.*surrounding whitespace/
  );
  await assert.rejects(
    writeJourneyContractCache({
      ...request,
      resource_uri: " bos://apps/lead-director/bosl/schema"
    }, { cacheRoot }),
    /resource_uri.*surrounding whitespace/
  );
});

test("simultaneous authority partitions coexist and maintenance stays scoped", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const resource = {
    kind: "service_description",
    resource_uri: "bos://apps/lead-director/plugins/message-service",
    descriptor_etag: "etag-service",
    service_reference: {
      platform: "bos",
      application: "lead-director",
      plugin: "message-service"
    }
  };
  const secondAuthority = {
    ...authority,
    authority_partition: "opaque-authority-partition-2"
  };
  await writeJourneyContractCache({
    authority,
    ...resource,
    payload: { name: "First scope" }
  }, { cacheRoot });
  await writeJourneyContractCache({
    authority: secondAuthority,
    ...resource,
    payload: { name: "Second scope" }
  }, { cacheRoot });

  await invalidateJourneyContractCache({
    authority,
    scope: "service",
    service_reference: {
      platform: "bos",
      application: "lead-director",
      plugin: "message-service"
    }
  }, { cacheRoot });

  assert.equal((await readJourneyContractCache({ authority, ...resource }, { cacheRoot })).state, "miss");
  assert.equal(
    (await readJourneyContractCache({ authority: secondAuthority, ...resource }, { cacheRoot })).payload.name,
    "Second scope"
  );
});

test("service cache identity requires the exact structured reference", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const request = {
    authority,
    kind: "service_description",
    resource_uri: "bos://apps/lead-director/plugins/shared",
    descriptor_etag: "etag-service",
    service_reference: {
      platform: "bos",
      application: "lead-director",
      plugin: "message-service"
    }
  };
  await writeJourneyContractCache({ ...request, payload: { name: "Message" } }, {
    cacheRoot
  });

  assert.equal((await readJourneyContractCache({
    ...request,
    service_reference: { ...request.service_reference, plugin: "another-service" }
  }, { cacheRoot })).state, "miss");
  await assert.rejects(
    readJourneyContractCache({ ...request, service_reference: undefined }, { cacheRoot }),
    /service_reference/
  );
  await assert.rejects(
    readJourneyContractCache({
      ...request,
      authority: { ...authority, access_token: "must-not-be-accepted" }
    }, { cacheRoot }),
    /authority.*undeclared/
  );
});

test("journey contract cache rejects future entry timestamps", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const request = {
    authority,
    kind: "bosl_schema",
    resource_uri: "bos://apps/lead-director/bosl/schema",
    descriptor_etag: "etag-clock",
    freshness_policy: { max_age_seconds: 60 }
  };
  await writeJourneyContractCache({
    ...request,
    payload: { type: "object" }
  }, {
    cacheRoot,
    now: "2026-09-19T13:00:00Z"
  });
  await assert.rejects(
    readJourneyContractCache(request, {
      cacheRoot,
      now: "2026-09-19T12:00:00Z"
    }),
    /stored_at is invalid/
  );
});

test("journey contract cache detects local descriptor corruption", async (context) => {
  const cacheRoot = await temporaryCache(context);
  const request = {
    authority,
    kind: "bosl_reference",
    resource_uri: "bos://apps/lead-director/bosl/reference",
    descriptor_etag: "etag-integrity"
  };
  await writeJourneyContractCache({
    ...request,
    payload: { title: "Authenticated reference" }
  }, { cacheRoot });
  const partitionsRoot = join(cacheRoot, "journey-contracts", "v1", "partitions");
  const [partition] = await readdir(partitionsRoot);
  const entriesRoot = join(partitionsRoot, partition, "entries");
  const [entryName] = await readdir(entriesRoot);
  const entryPath = join(entriesRoot, entryName);
  const entry = JSON.parse(await readFile(entryPath, "utf8"));
  entry.payload.title = "Tampered reference";
  await writeFile(entryPath, JSON.stringify(entry), "utf8");

  await assert.rejects(
    readJourneyContractCache(request, { cacheRoot }),
    /payload integrity/
  );
});
