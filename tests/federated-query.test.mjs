import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  aggregateQueryResult,
  assertCrmOperationExecutable,
  buildCrmRecordOperationPlan,
  buildCrmSyncApplyPlan,
  buildCrmSyncPlan,
  buildDatasetCacheDescriptor,
  buildQueryPlan,
  executionEvent,
  explainCrmOperationPlan,
  explainCrmSyncApplyPlan,
  explainQueryPlan,
  normalizeCrmGetResponse,
  normalizeCrmMutationResponse,
  normalizeCrmSourceListResponse,
  normalizeCrmSyncApplyResponse,
  normalizeCrmSyncPlanResponse,
  normalizeSearchResponse,
  normalizeSourceResult
} from "../source/platform/bos-federated-query/scripts/federated-query.mjs";

const input = {
  product: "my-crm",
  app: {
    app_code: "lead-director",
    display_name: "Lead Director",
    context_id: "opaque-app-context",
    authority_epoch: 42,
    contract_version: "2026-09-04",
    discovery_epoch: "epoch-42"
  },
  service: {
    serviceId: "lead-director.crm",
    summary: "Search authorized CRM sources",
    ownerKind: "application",
    entityTypes: ["customer", "lead", "contact", "activity"],
    version: "1.0.0",
    apiBaseUrl: "https://api.example.test/contexts/opaque",
    contractUri: "https://api.example.test/contracts/current.json",
    authScheme: { scheme: "oauth2" },
    requiredScopes: ["mcp:tools"],
    requiredCapabilities: [],
    provenance: { observationGuarantee: "revalidated_per_request" },
    failureContract: [],
    operations: [
      {
        operationId: "lead_director_crm_search",
        capability: "crm.search",
        method: "POST",
        endpoint: "https://api.example.test/contexts/opaque/crm/search",
        requiredScopes: ["mcp:tools"],
        requiredCapabilities: [],
        sideEffect: "read",
        idempotent: true
      },
      {
        operationId: "lead_director_crm_sources_list",
        capability: "crm.sources.list",
        method: "GET",
        endpoint: "https://api.example.test/contexts/opaque/crm/sources",
        requiredScopes: ["mcp:tools"],
        requiredCapabilities: [],
        sideEffect: "read",
        idempotent: true
      },
      {
        operationId: "lead_director_crm_search_explain",
        capability: "crm.search.explain",
        method: "POST",
        endpoint: "https://api.example.test/contexts/opaque/crm/search:explain",
        requiredScopes: ["mcp:tools"],
        requiredCapabilities: [],
        sideEffect: "read",
        idempotent: true
      },
      {
        operationId: "lead_director_crm_records_get",
        capability: "crm.records.get",
        method: "POST",
        endpoint: "https://api.example.test/contexts/opaque/crm/records:get",
        requiredScopes: ["mcp:tools"],
        requiredCapabilities: [],
        sideEffect: "read",
        idempotent: true
      },
      {
        operationId: "lead_director_crm_records_create",
        capability: "crm.records.create",
        method: "POST",
        endpoint: "https://api.example.test/contexts/opaque/crm/records",
        requiredScopes: ["mcp:tools"],
        requiredCapabilities: [],
        sideEffect: "write",
        idempotent: true
      },
      {
        operationId: "lead_director_crm_records_update",
        capability: "crm.records.update",
        method: "PATCH",
        endpoint: "https://api.example.test/contexts/opaque/crm/records",
        requiredScopes: ["mcp:tools"],
        requiredCapabilities: [],
        sideEffect: "write",
        idempotent: true
      },
      {
        operationId: "lead_director_crm_sync_plan",
        capability: "crm.sync.plan",
        method: "POST",
        endpoint: "https://api.example.test/contexts/opaque/crm/sync:plan",
        requiredScopes: ["mcp:tools"],
        requiredCapabilities: [],
        sideEffect: "write",
        idempotent: false
      },
      {
        operationId: "lead_director_crm_sync_apply",
        capability: "crm.sync.apply",
        method: "POST",
        endpoint: "https://api.example.test/contexts/opaque/crm/sync:apply",
        requiredScopes: ["mcp:tools"],
        requiredCapabilities: [],
        sideEffect: "write",
        idempotent: true
      }
    ]
  },
  operationCapability: "crm.search",
  skills: ["my-crm-record-operations", "bos-federated-query"],
  dataset: "customer_records",
  query: { email: "ada@example.com" },
  mode: "merged_view",
  limitPerSource: 50,
  maxAgeSeconds: 300
};

const sourceOne = {
  sourceHandle: `crm_src_${"a".repeat(64)}`,
  displayName: "Source One",
  status: "ready",
  capabilities: ["search", "get", "create", "update"]
};

const sourceTwo = {
  sourceHandle: `crm_src_${"b".repeat(64)}`,
  displayName: "Source Two",
  status: "provider_unavailable",
  capabilities: []
};

const sourceThree = {
  sourceHandle: `crm_src_${"c".repeat(64)}`,
  displayName: "Source Three",
  status: "ready",
  capabilities: ["search", "get", "create", "update"]
};

const mergedRecord = {
  recordRef: `crm_ref_${"d".repeat(64)}`,
  displayName: "Ada Lovelace",
  email: "ada@example.com",
  phone: null,
  lifecycle: "active",
  sources: [
    {
      sourceHandle: sourceOne.sourceHandle,
      recordHandle: "crm_rec_opaque_one",
      recordType: "contact",
      observedAt: "2026-09-04T15:57:00.000Z",
      version: "1"
    }
  ],
  matchConfidence: "exact",
  attributes: {}
};

const searchResponse = {
  schemaVersion: "lead-director-crm-search/v1",
  contextId: "opaque-app-context",
  query: { email: "ada@example.com" },
  complete: false,
  sourceResults: [
    {
      source: sourceOne,
      status: "succeeded",
      records: [mergedRecord],
      observedAt: "2026-09-04T15:57:00.000Z",
      freshness: "live",
      error: null
    },
    {
      source: sourceTwo,
      status: "failed",
      records: [],
      observedAt: "2026-09-04T15:58:00.000Z",
      freshness: "live",
      error: {
        code: "provider_unavailable",
        message: "The authorized source is currently unavailable",
        retriable: true
      }
    }
  ],
  records: [mergedRecord],
  events: [
    { type: "source_completed", sourceHandle: sourceOne.sourceHandle, resultCount: 1 },
    { type: "source_failed", sourceHandle: sourceTwo.sourceHandle, resultCount: 0 },
    { type: "federation_completed", sourceHandle: null, resultCount: 1 }
  ],
  provenance: {
    correlationId: "corr-1",
    authorityEpoch: 42,
    observedAt: "2026-09-04T15:58:00.000Z",
    sourceService: "lead-director.crm"
  }
};

const responseContract = {
  expectedContextId: "opaque-app-context",
  expectedQuery: input.query,
  expectedAuthorityEpoch: 42,
  expectedSourceService: input.service.serviceId,
  expectedDiscoveryEpoch: input.app.discovery_epoch,
  expectedServiceVersion: input.service.version,
  expectedContractUri: input.service.contractUri
};

const primaryRecordSource = mergedRecord.sources[0];
const secondaryRecordSource = {
  sourceHandle: sourceThree.sourceHandle,
  recordHandle: "crm_rec_opaque_three",
  recordType: "contact",
  observedAt: "2026-09-04T15:57:00.000Z",
  version: "7"
};

const getResponse = {
  schemaVersion: "lead-director-crm-get/v1",
  contextId: "opaque-app-context",
  record: mergedRecord,
  provenance: { ...searchResponse.provenance, correlationId: "corr-get" }
};

const sourceListResponse = {
  schemaVersion: "lead-director-crm-sources/v1",
  contextId: "opaque-app-context",
  sources: [sourceOne, sourceTwo, sourceThree],
  provenance: { ...searchResponse.provenance, correlationId: "corr-sources" }
};

const mutationResponse = {
  schemaVersion: "lead-director-crm-mutation/v1",
  contextId: "opaque-app-context",
  operation: "create",
  complete: true,
  atomicity: "underlying_source_guarantee",
  source: sourceOne,
  receipt: {
    recordHandle: "crm_rec_created_opaque",
    version: "1",
    succeeded: true
  },
  error: null,
  provenance: { ...searchResponse.provenance, correlationId: "corr-create" }
};

const syncRequestTargets = [
  {
    targetId: "create-secondary",
    operation: "create",
    source: sourceOne,
    changes: { firstName: "Grace", email: "grace@example.com" },
    idempotencyKey: "sync-create-0001"
  },
  {
    targetId: "update-primary",
    operation: "update",
    source: sourceThree,
    recordSource: secondaryRecordSource,
    expectedVersion: "7",
    changes: { lifecycle: "qualified" },
    idempotencyKey: "sync-update-0001"
  }
];

const syncPlanResponse = {
  schemaVersion: "lead-director-crm-sync-plan/v1",
  contextId: "opaque-app-context",
  applicationId: "sync-application-0001",
  planHandle: "crm_plan_opaque_0001",
  expiresAt: "2026-09-04T16:30:00.000Z",
  atomicity: "non_atomic_per_source",
  targets: [
    {
      targetId: "create-secondary",
      operation: "create",
      source: sourceOne,
      status: "planned",
      error: null
    },
    {
      targetId: "update-primary",
      operation: "update",
      source: sourceThree,
      status: "planned",
      error: null
    }
  ],
  provenance: { ...searchResponse.provenance, correlationId: "corr-sync-plan" }
};

const syncApplyResponse = {
  schemaVersion: "lead-director-crm-sync-apply/v1",
  contextId: "opaque-app-context",
  applicationId: "sync-application-0001",
  complete: false,
  atomicity: "non_atomic_per_source",
  consistency: "reconciliation_required",
  receipts: [
    {
      targetId: "create-secondary",
      operation: "create",
      source: sourceOne,
      status: "committed",
      recordHandle: "crm_rec_created_opaque",
      version: "1",
      observedAt: "2026-09-04T16:01:00.000Z",
      error: null,
      reconciliationAction: "none"
    },
    {
      targetId: "update-primary",
      operation: "update",
      source: sourceThree,
      status: "uncertain",
      recordHandle: secondaryRecordSource.recordHandle,
      version: null,
      observedAt: "2026-09-04T16:01:01.000Z",
      error: {
        code: "read_back_failed",
        message: "The server could not verify the final record version",
        retriable: false
      },
      reconciliationAction: "manual_verification_required"
    }
  ],
  provenance: { ...searchResponse.provenance, correlationId: "corr-sync-apply" }
};

test("query plan consumes the discovered camelCase service contract directly", () => {
  const first = buildQueryPlan(input);
  const second = buildQueryPlan(input);
  assert.deepEqual(first, second);
  assert.equal(first.invocation.count, 1);
  assert.equal(first.invocation.owner, "app_service");
  assert.equal(first.invocation.operationId, "lead_director_crm_search");
  assert.equal(first.invocation.capability, "crm.search");
  assert.equal(first.invocation.sideEffect, "read");
  assert.deepEqual(first.invocation.requiredCapabilities, []);
  assert.equal(first.source_selection.scope, "all_enabled_authorized");
  assert.deepEqual(first.request, {
    query: { email: "ada@example.com" },
    limitPerSource: 50
  });
  assert.equal("sourceHandles" in first.request, false);
  assert.equal("sources" in first, false);
});

test("explicit source scope passes exact current sourceHandles in the one request", () => {
  const plan = buildQueryPlan({
    ...input,
    sourceHandles: [sourceOne.sourceHandle],
    discoveredSources: [sourceOne, sourceTwo]
  });
  assert.deepEqual(plan.source_selection, {
    scope: "selected",
    sourceHandles: [sourceOne.sourceHandle]
  });
  assert.deepEqual(plan.request.sourceHandles, [sourceOne.sourceHandle]);
  const explained = explainQueryPlan(plan);
  assert.equal(explained.source_selection.resolution_owner, "server");
  assert.equal(explained.source_selection.source_handle_digests.length, 1);
  assert.equal(JSON.stringify(explained).includes(sourceOne.sourceHandle), false);

  const explicitResponse = {
    ...searchResponse,
    complete: true,
    sourceResults: [searchResponse.sourceResults[0]],
    events: [
      { type: "source_completed", sourceHandle: sourceOne.sourceHandle, resultCount: 1 },
      { type: "federation_completed", sourceHandle: null, resultCount: 1 }
    ]
  };
  assert.equal(normalizeSearchResponse(explicitResponse, {
    ...responseContract,
    expectedSourceHandles: [sourceOne.sourceHandle]
  }).source_results.length, 1);
  assert.throws(() => normalizeSearchResponse(searchResponse, {
    ...responseContract,
    expectedSourceHandles: [sourceOne.sourceHandle]
  }), /do not match the explicit source selection/);
});

test("explain sanitizes request values and defers undiscovered source details", () => {
  const explained = explainQueryPlan(buildQueryPlan(input));
  assert.equal(explained.executes_data_call, false);
  assert.equal(explained.invocation.count, 1);
  assert.deepEqual(explained.request_shape, {
    limitPerSource: "number",
    query: { email: "string" }
  });
  assert.equal(explained.server_source_plan.status, "deferred_to_server");
  assert.deepEqual(explained.server_source_plan.sources, []);
  assert.equal(JSON.stringify(explained).includes("ada@example.com"), false);
  assert.equal(JSON.stringify(explained).includes("opaque-app-context"), false);
});

test("explain consumes the exact server plan envelope", () => {
  const explained = explainQueryPlan(buildQueryPlan(input), {
    schemaVersion: "lead-director-crm-explain/v1",
    contextId: "opaque-app-context",
    query: { email: "ada@example.com" },
    sourceSelection: "all_authorized",
    sources: [sourceOne, sourceTwo],
    execution: ["query_ready_sources_in_parallel"],
    mergeStrategy: "exact_normalized_email_or_phone",
    mutationSemantics: "single_source_underlying_guarantee",
    provenance: searchResponse.provenance
  });
  assert.equal(explained.server_source_plan.schema_version, "lead-director-crm-explain/v1");
  assert.equal(explained.server_source_plan.source_selection, "all_authorized");
  assert.equal(explained.server_source_plan.merge_strategy, "exact_normalized_email_or_phone");
  assert.deepEqual(
    explained.server_source_plan.sources.map((source) => source.source_label),
    ["Source One", "Source Two"]
  );
  assert.equal(JSON.stringify(explained).includes(sourceOne.sourceHandle), false);

  const explicitPlan = buildQueryPlan({
    ...input,
    sourceHandles: [sourceOne.sourceHandle],
    discoveredSources: [sourceOne, sourceTwo]
  });
  const explicitServerPlan = {
    schemaVersion: "lead-director-crm-explain/v1",
    contextId: "opaque-app-context",
    query: { email: "ada@example.com" },
    sourceSelection: "explicit_handles",
    sources: [sourceOne],
    execution: ["query_ready_sources_in_parallel"],
    mergeStrategy: "exact_normalized_email_or_phone",
    mutationSemantics: "single_source_underlying_guarantee",
    provenance: searchResponse.provenance
  };
  assert.equal(
    explainQueryPlan(explicitPlan, explicitServerPlan).server_source_plan.sources.length,
    1
  );
  assert.throws(() => explainQueryPlan(explicitPlan, {
    ...explicitServerPlan,
    sources: [sourceThree]
  }), /do not match the explicit client source selection/);
  assert.throws(() => explainQueryPlan(buildQueryPlan(input), {
    ...explicitServerPlan,
    sourceSelection: "all_authorized",
    sources: [sourceOne, sourceTwo],
    provenance: { ...searchResponse.provenance, authorityEpoch: 43 }
  }), /does not match the active authority context/);
});

test("exact search response adapts to local freshness and server event ledger", () => {
  const adapted = normalizeSearchResponse(searchResponse, {
    ...responseContract,
    now: "2026-09-04T16:00:00.000Z",
    timeZone: "America/Denver",
    maxAgeSeconds: 300,
    usage: { scope: "host_measured", input_tokens: 20, output_tokens: 5 }
  });
  assert.equal(adapted.complete, false);
  assert.equal(adapted.source_results[0].status, "completed");
  assert.equal(adapted.source_results[0].origin, "live");
  assert.equal(adapted.source_results[0].freshness.age_label, "3 minutes ago");
  assert.equal(adapted.source_results[1].status, "failed");
  assert.deepEqual(
    adapted.execution_ledger.map((event) => event.event_type),
    ["source_completed", "source_failed", "federation_completed"]
  );
  assert(adapted.execution_ledger.every((event) => event.producer === "server"));
  assert.equal(JSON.stringify(adapted.execution_ledger).includes(sourceOne.sourceHandle), false);
  assert.deepEqual(adapted.records, [mergedRecord]);
  assert.equal(adapted.usage.total_tokens, 25);
});

test("client cannot manufacture server source lifecycle events", () => {
  assert.throws(() => executionEvent({
    sequence: 1,
    event_type: "source_completed",
    source_handle: sourceOne.sourceHandle
  }), /not valid for client/);
  assert.throws(() => executionEvent({
    sequence: 1,
    producer: "server",
    event_type: "source_started",
    source_handle: sourceOne.sourceHandle
  }), /not valid for server/);

  assert.throws(() => normalizeSearchResponse({
    ...searchResponse,
    events: searchResponse.events.filter((event) => event.sourceHandle !== sourceTwo.sourceHandle)
  }, responseContract), /exactly one lifecycle event per source result/);
  assert.throws(() => normalizeSearchResponse({
    ...searchResponse,
    events: [
      searchResponse.events[0],
      { ...searchResponse.events[0] },
      searchResponse.events[2]
    ]
  }, responseContract), /exactly one lifecycle event per source result/);
  assert.throws(() => normalizeSearchResponse({
    ...searchResponse,
    events: [
      { ...searchResponse.events[0], type: "source_failed" },
      searchResponse.events[1],
      searchResponse.events[2]
    ]
  }, responseContract), /lifecycle event conflicts with its source result/);
  assert.throws(() => normalizeSearchResponse({
    ...searchResponse,
    events: [
      { ...searchResponse.events[0], resultCount: 0 },
      searchResponse.events[1],
      searchResponse.events[2]
    ]
  }, responseContract), /lifecycle event conflicts with its source result/);
});

test("dataset cache covers the complete server-resolved request scope", () => {
  const allSources = buildDatasetCacheDescriptor(buildQueryPlan(input));
  const selectedSources = buildDatasetCacheDescriptor(buildQueryPlan({
    ...input,
    sourceHandles: [sourceOne.sourceHandle],
    discoveredSources: [sourceOne, sourceTwo]
  }));
  assert.equal(allSources.cache_key.startsWith("bos_query_"), true);
  assert.equal(allSources.query_digest.length, 64);
  assert.equal(allSources.source_scope, "all_enabled_authorized");
  assert.equal(selectedSources.source_scope, "selected");
  assert.notEqual(allSources.cache_key, selectedSources.cache_key);
  const nextDiscoveryEpoch = buildDatasetCacheDescriptor(buildQueryPlan({
    ...input,
    app: { ...input.app, discovery_epoch: "epoch-43" }
  }));
  assert.notEqual(allSources.cache_key, nextDiscoveryEpoch.cache_key);

  const stale = normalizeSourceResult({
    source_handle: sourceOne.sourceHandle,
    source_label: sourceOne.displayName,
    origin: "cache",
    last_updated_at: "2026-09-04T15:50:00.000Z",
    max_age_seconds: 60,
    records: [mergedRecord]
  }, { now: "2026-09-04T16:00:00.000Z" });
  assert.equal(stale.status, "refresh_required");
  assert.deepEqual(stale.records, []);
});

test("final composition preserves server-resolved merged records and partial sources", () => {
  const adapted = normalizeSearchResponse(searchResponse, {
    ...responseContract,
    now: "2026-09-04T16:00:00.000Z",
    maxAgeSeconds: 300
  });
  const result = aggregateQueryResult({
    plan: buildQueryPlan(input),
    source_results: adapted.source_results,
    records: adapted.records,
    execution_ledger: adapted.execution_ledger,
    usage: adapted.usage
  });
  assert.equal(result.invocation_count, 1);
  assert.equal(result.complete, false);
  assert.equal(result.failed_source_count, 1);
  assert.equal(result.record_count, 1);
  assert.deepEqual(result.records, [mergedRecord]);
  assert.deepEqual(result.merged_view, {
    resolution_owner: "server",
    records: [mergedRecord]
  });
});

test("plans and response adapters fail closed on contract drift", () => {
  assert.throws(
    () => buildQueryPlan({ ...input, mode: "atomic_cross_source" }),
    /mode is invalid/
  );
  assert.throws(
    () => buildQueryPlan({ ...input, sourceHandles: [] }),
    /must be omitted or contain 1 through 100 items/
  );
  assert.throws(
    () => buildQueryPlan({ ...input, sourceHandles: ["raw-source-id"] }),
    /current opaque CRM source handle|72 through 72/
  );
  assert.throws(
    () => buildQueryPlan({ ...input, sourceHandles: [sourceOne.sourceHandle] }),
    /require current discoveredSources/
  );
  assert.throws(
    () => buildQueryPlan({
      ...input,
      sourceHandles: Array.from(
        { length: 101 },
        (_, index) => `crm_src_${index.toString(16).padStart(64, "0")}`
      )
    }),
    /1 through 100 items/
  );
  assert.throws(
    () => buildQueryPlan({
      ...input,
      sourceHandles: [sourceOne.sourceHandle, sourceOne.sourceHandle],
      discoveredSources: [sourceOne]
    }),
    /must not contain duplicates/
  );
  assert.throws(
    () => buildQueryPlan({ ...input, operationCapability: "crm.records.delete" }),
    /resolve to exactly one discovered service operation/
  );
  assert.throws(
    () => buildQueryPlan({
      ...input,
      service: {
        ...input.service,
        operations: input.service.operations.map((operation) =>
          operation.capability === "crm.search"
            ? { ...operation, method: "GET" }
            : operation
        )
      }
    }),
    /requires discovered crm.search POST read idempotent true/
  );
  assert.throws(
    () => buildQueryPlan({ ...input, query: { text: `  ${"a ".repeat(1000)}a  ` } }),
    /1 through 2000 characters/
  );
  assert.throws(
    () => buildQueryPlan({ ...input, query: { email: "ada@example.com", phone: "+13035550100" } }),
    /requires exactly one of text, email, or phone/
  );
  assert.throws(
    () => buildQueryPlan({ ...input, query: { company: "Analytical Engines" } }),
    /unsupported field company/
  );
  assert.throws(
    () => buildQueryPlan({
      ...input,
      service: {
        ...input.service,
        operations: [input.service.operations[0], input.service.operations[0]]
      }
    }),
    /resolve to exactly one discovered service operation/
  );
  assert.throws(
    () => explainQueryPlan(buildQueryPlan(input), {
      schemaVersion: "lead-director-crm-explain/v1",
      contextId: "another-context",
      query: { email: "ada@example.com" },
      sourceSelection: "all_authorized",
      sources: [],
      execution: [],
      mergeStrategy: "exact_normalized_email_or_phone",
      mutationSemantics: "single_source_underlying_guarantee",
      provenance: searchResponse.provenance
    }),
    /does not match the selected app context/
  );
  assert.throws(
    () => normalizeSearchResponse({ ...searchResponse, events: [
      { type: "source_started", sourceHandle: sourceOne.sourceHandle, resultCount: 0 }
    ] }, responseContract),
    /not valid for server/
  );
  assert.throws(
    () => normalizeSearchResponse(searchResponse, {
      ...responseContract,
      expectedContextId: "another-context"
    }),
    /does not match the selected app context/
  );
  assert.throws(
    () => normalizeSearchResponse({
      ...searchResponse,
      schemaVersion: "lead-director-crm-search/v2"
    }, responseContract),
    /schemaVersion must be lead-director-crm-search\/v1/
  );
  assert.throws(
    () => normalizeSearchResponse({
      ...searchResponse,
      query: { phone: "+13035550100" }
    }, responseContract),
    /query does not match the requested CRM query/
  );
  assert.throws(
    () => normalizeSearchResponse({
      ...searchResponse,
      sourceResults: [{
        ...searchResponse.sourceResults[0],
        source: { ...sourceOne, status: "unknown" }
      }],
      complete: true,
      events: [
        { type: "source_completed", sourceHandle: sourceOne.sourceHandle, resultCount: 1 },
        { type: "federation_completed", sourceHandle: null, resultCount: 1 }
      ]
    }, responseContract),
    /source.status is invalid/
  );
  assert.throws(
    () => normalizeSearchResponse({
      ...searchResponse,
      sourceResults: [{
        ...searchResponse.sourceResults[0],
        source: { ...sourceOne, capabilities: ["search", "export"] }
      }],
      complete: true,
      events: [
        { type: "source_completed", sourceHandle: sourceOne.sourceHandle, resultCount: 1 },
        { type: "federation_completed", sourceHandle: null, resultCount: 1 }
      ]
    }, responseContract),
    /source.capabilities is invalid/
  );
  assert.throws(
    () => normalizeSearchResponse({
      ...searchResponse,
      provenance: { ...searchResponse.provenance, correlationId: "" }
    }, responseContract),
    /provenance.correlationId must be a non-empty string/
  );
  assert.throws(
    () => normalizeSearchResponse({
      ...searchResponse,
      provenance: { ...searchResponse.provenance, authorityEpoch: 43 }
    }, responseContract),
    /authorityEpoch does not match the active authority context/
  );
  assert.throws(
    () => normalizeSearchResponse({
      ...searchResponse,
      provenance: { ...searchResponse.provenance, sourceService: "another.crm" }
    }, responseContract),
    /sourceService does not match the discovered service/
  );
  assert.throws(
    () => normalizeSearchResponse({ ...searchResponse, rawProviderPayload: {} }, responseContract),
    /contains unknown field rawProviderPayload/
  );
  assert.throws(
    () => normalizeSearchResponse({
      ...searchResponse,
      sourceResults: searchResponse.sourceResults.map((result, index) =>
        index === 0
          ? {
            ...result,
            records: [{ ...mergedRecord, recordRef: "raw-record-id" }]
          }
          : result
      )
    }, responseContract),
    /recordRef must be an opaque CRM reference/
  );
  assert.throws(
    () => normalizeSearchResponse({
      ...searchResponse,
      sourceResults: searchResponse.sourceResults.map((result, index) =>
        index === 0
          ? {
            ...result,
            records: [{
              ...mergedRecord,
              sources: [{ ...primaryRecordSource, sourceHandle: sourceThree.sourceHandle }]
            }]
          }
          : result
      )
    }, responseContract),
    /contains cross-source record provenance/
  );
  assert.throws(
    () => normalizeSearchResponse({
      ...searchResponse,
      records: [{
        ...mergedRecord,
        sources: [{ ...primaryRecordSource, sourceHandle: sourceThree.sourceHandle }]
      }]
    }, responseContract),
    /contains provenance outside sourceResults/
  );
  assert.throws(
    () => aggregateQueryResult({
      plan: { ...buildQueryPlan(input), invocation: { count: 2, owner: "client" } },
      source_results: [],
      records: []
    }),
    /exactly one app-service invocation/
  );
});

test("record get/create/update plans use exact provider-neutral server requests", () => {
  const sourceInventory = normalizeCrmSourceListResponse(sourceListResponse, responseContract);
  const getPlan = buildCrmRecordOperationPlan({
    ...input,
    intent: "get",
    source: sourceInventory.sources[0],
    recordSource: primaryRecordSource
  });
  assert.deepEqual(getPlan.request, { recordHandle: primaryRecordSource.recordHandle });
  assert.equal(getPlan.invocation.capability, "crm.records.get");
  assert.equal(getPlan.invocation.count, 1);
  assert.equal(getPlan.confirmation.required, false);
  assertCrmOperationExecutable(getPlan);

  const createPlan = buildCrmRecordOperationPlan({
    ...input,
    intent: "create",
    source: sourceInventory.sources[0],
    changes: { firstName: "Grace", email: "grace@example.com" },
    idempotencyKey: "create-record-0001"
  });
  assert.deepEqual(createPlan.request, {
    sourceHandle: sourceOne.sourceHandle,
    changes: { firstName: "Grace", email: "grace@example.com" },
    idempotencyKey: "create-record-0001"
  });
  assert.equal(createPlan.invocation.capability, "crm.records.create");
  assert.equal(createPlan.invocation.sideEffect, "write");
  assert.equal(createPlan.execution_ready, false);
  assert.throws(() => assertCrmOperationExecutable(createPlan), /user confirmation is required/);

  const updateInput = {
    ...input,
    intent: "update",
    source: sourceInventory.sources[0],
    recordSource: primaryRecordSource,
    expectedVersion: "1",
    changes: { lifecycle: "qualified" },
    idempotencyKey: "update-record-0001"
  };
  const updatePreview = buildCrmRecordOperationPlan(updateInput);
  const updatePlan = buildCrmRecordOperationPlan({
    ...updateInput,
    confirmationId: updatePreview.confirmation.confirmation_id
  });
  assert.deepEqual(updatePlan.request, {
    recordHandle: primaryRecordSource.recordHandle,
    expectedVersion: "1",
    changes: { lifecycle: "qualified" },
    idempotencyKey: "update-record-0001"
  });
  assert.equal(updatePlan.invocation.capability, "crm.records.update");
  assert.equal(updatePlan.invocation.count, 1);
  assertCrmOperationExecutable(updatePlan);
  assert.throws(() => assertCrmOperationExecutable({
    ...updatePlan,
    request: { ...updatePlan.request, changes: { lifecycle: "customer" } }
  }), /plan integrity check failed/);
  assert.throws(() => assertCrmOperationExecutable({
    ...updatePlan,
    confirmation: { required: false, confirmed: true },
    execution_ready: true
  }), /cannot downgrade its confirmation requirement/);

  const explained = explainCrmOperationPlan(updatePlan);
  const serialized = JSON.stringify(explained);
  assert.deepEqual(explained.changed_fields, ["lifecycle"]);
  assert.equal(explained.invocation.endpoint_digest.length, 16);
  assert.equal("endpoint" in explained.invocation, false);
  assert.equal(serialized.includes(primaryRecordSource.recordHandle), false);
  assert.equal(serialized.includes("qualified"), false);
  assert.equal(serialized.includes("update-record-0001"), false);
});

test("source inventory closes explicit source selection to current discovery", () => {
  const inventory = normalizeCrmSourceListResponse(sourceListResponse, responseContract);
  assert.equal(inventory.schema_version, "lead-director-crm-sources/v1");
  assert.deepEqual(inventory.sources, [sourceOne, sourceTwo, sourceThree]);
  const selected = buildQueryPlan({
    ...input,
    sourceHandles: [sourceOne.sourceHandle],
    discoveredSources: inventory.sources
  });
  assert.deepEqual(selected.request.sourceHandles, [sourceOne.sourceHandle]);
  assert.throws(() => buildQueryPlan({
    ...input,
    sourceHandles: [`crm_src_${"f".repeat(64)}`],
    discoveredSources: inventory.sources
  }), /absent from current source discovery/);
  assert.throws(() => normalizeCrmSourceListResponse({
    ...sourceListResponse,
    sources: [sourceOne, sourceOne]
  }, responseContract), /duplicate source handles/);
  assert.throws(() => normalizeCrmSourceListResponse({
    ...sourceListResponse,
    sources: [{ ...sourceOne, sourceHandle: "raw-source-id" }]
  }, responseContract), /current opaque CRM source handle|72 through 72/);
});

test("source inventory is available through the packaged CLI operation", () => {
  const child = spawnSync(
    process.execPath,
    ["source/platform/bos-federated-query/scripts/federated-query.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      input: JSON.stringify({
        operation: "crm_sources_response",
        response: sourceListResponse,
        options: responseContract
      })
    }
  );
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout);
  assert.equal(output.schema_version, "lead-director-crm-sources/v1");
  assert.deepEqual(output.sources, [sourceOne, sourceTwo, sourceThree]);
});

test("get and mutation adapters consume exact server envelopes", () => {
  const getResult = normalizeCrmGetResponse(getResponse, {
    ...responseContract,
    expectedRecordHandle: primaryRecordSource.recordHandle,
    usage: { scope: "host_measured", input_tokens: 8, output_tokens: 3 }
  });
  assert.equal(getResult.schema_version, "lead-director-crm-get/v1");
  assert.equal(getResult.record.recordRef, mergedRecord.recordRef);
  assert.equal(getResult.provenance.correlation_id, "corr-get");
  assert.equal(getResult.usage.total_tokens, 11);

  const mutationResult = normalizeCrmMutationResponse(mutationResponse, {
    ...responseContract,
    expectedOperation: "create",
    expectedSourceHandle: sourceOne.sourceHandle
  });
  assert.equal(mutationResult.state, "committed");
  assert.equal(mutationResult.atomicity, "underlying_source_guarantee");
  assert.equal(mutationResult.receipt.succeeded, true);
  assert.equal(mutationResult.cache_invalidation_required, true);
});

test("record mutation planning and responses fail closed on unsafe drift", () => {
  assert.throws(() => buildCrmRecordOperationPlan({
    ...input,
    intent: "create",
    source: { ...sourceOne, capabilities: ["search", "get"] },
    changes: { email: "grace@example.com" },
    idempotencyKey: "create-record-0001"
  }), /does not advertise create/);
  assert.throws(() => buildCrmRecordOperationPlan({
    ...input,
    intent: "create",
    source: sourceOne,
    changes: { locationId: "provider-routing" },
    idempotencyKey: "create-record-0001"
  }), /unsupported field locationId/);
  assert.throws(() => buildCrmRecordOperationPlan({
    ...input,
    intent: "update",
    source: sourceOne,
    recordSource: primaryRecordSource,
    expectedVersion: "stale-version",
    changes: { lifecycle: "qualified" },
    idempotencyKey: "update-record-0001"
  }), /must equal the current server-returned record version/);
  assert.throws(() => buildCrmRecordOperationPlan({
    ...input,
    intent: "create",
    source: sourceOne,
    changes: { email: "grace@example.com" },
    idempotencyKey: " create-record-0001"
  }), /must not start or end with whitespace/);
  assert.throws(() => buildCrmRecordOperationPlan({
    ...input,
    intent: "create",
    source: sourceOne,
    changes: { email: "grace@example.com" },
    idempotencyKey: "create-record-0001",
    service: {
      ...input.service,
      operations: input.service.operations.map((operation) =>
        operation.capability === "crm.records.create"
          ? { ...operation, sideEffect: "read" }
          : operation
      )
    }
  }), /must advertise sideEffect write/);
  assert.throws(() => normalizeCrmGetResponse({
    ...getResponse,
    record: { ...mergedRecord, sources: [] }
  }, {
    ...responseContract,
    expectedRecordHandle: primaryRecordSource.recordHandle
  }), /sources must contain 1 through 100 items/);
  assert.throws(() => normalizeCrmGetResponse({
    ...getResponse,
    record: {
      ...mergedRecord,
      sources: [{ ...primaryRecordSource, recordHandle: "raw-record-id" }]
    }
  }, {
    ...responseContract,
    expectedRecordHandle: primaryRecordSource.recordHandle
  }), /current opaque CRM record handle/);
  assert.throws(() => normalizeCrmMutationResponse({
    ...mutationResponse,
    complete: false
  }, {
    ...responseContract,
    expectedOperation: "create",
    expectedSourceHandle: sourceOne.sourceHandle
  }), /completion, receipt, and error are inconsistent/);
  assert.throws(() => normalizeCrmMutationResponse({
    ...mutationResponse,
    receipt: { ...mutationResponse.receipt, recordHandle: "raw-record-id" }
  }, {
    ...responseContract,
    expectedOperation: "create",
    expectedSourceHandle: sourceOne.sourceHandle
  }), /current opaque CRM record handle/);
});

test("cross-source synchronization uses one confirmed server apply", () => {
  const requestPlan = buildCrmSyncPlan({
    ...input,
    applicationId: "sync-application-0001",
    targets: syncRequestTargets
  });
  assert.equal(requestPlan.invocation.capability, "crm.sync.plan");
  assert.equal(requestPlan.invocation.count, 1);
  assert.equal(requestPlan.invocation.sideEffect, "write");
  assert.equal(requestPlan.invocation.idempotent, false);
  assert.deepEqual(requestPlan.request, {
    applicationId: "sync-application-0001",
    targets: [
      {
        targetId: "create-secondary",
        operation: "create",
        changes: { firstName: "Grace", email: "grace@example.com" },
        idempotencyKey: "sync-create-0001",
        sourceHandle: sourceOne.sourceHandle
      },
      {
        targetId: "update-primary",
        operation: "update",
        changes: { lifecycle: "qualified" },
        idempotencyKey: "sync-update-0001",
        recordHandle: secondaryRecordSource.recordHandle,
        expectedVersion: "7"
      }
    ]
  });

  const normalizedServerPlan = normalizeCrmSyncPlanResponse(syncPlanResponse, {
    ...responseContract,
    expectedApplicationId: "sync-application-0001",
    expectedTargets: requestPlan.target_closure
  });
  assert.equal(normalizedServerPlan.atomicity, "non_atomic_per_source");
  assert.equal(normalizedServerPlan.targets.length, 2);

  const unconfirmedApply = buildCrmSyncApplyPlan({
    ...input,
    serverPlan: normalizedServerPlan,
    now: "2026-09-04T16:00:00.000Z"
  });
  assert.equal(unconfirmedApply.invocation.capability, "crm.sync.apply");
  assert.equal(unconfirmedApply.invocation.count, 1);
  assert.equal(unconfirmedApply.invocation.idempotent, true);
  assert.deepEqual(unconfirmedApply.request, {
    applicationId: "sync-application-0001",
    planHandle: "crm_plan_opaque_0001"
  });
  assert.throws(
    () => assertCrmOperationExecutable(unconfirmedApply),
    /user confirmation is required/
  );

  const confirmedApply = buildCrmSyncApplyPlan({
    ...input,
    serverPlan: normalizedServerPlan,
    now: "2026-09-04T16:00:00.000Z",
    confirmationId: unconfirmedApply.confirmation.confirmation_id
  });
  assertCrmOperationExecutable(confirmedApply);
  assert.throws(() => assertCrmOperationExecutable({
    ...confirmedApply,
    request: { ...confirmedApply.request, applicationId: "sync-application-tampered" }
  }), /plan integrity check failed/);
  assert.throws(() => assertCrmOperationExecutable({
    ...confirmedApply,
    target_closure: confirmedApply.target_closure.map((target, index) =>
      index === 0 ? { ...target, operation: "update" } : target
    )
  }), /plan integrity check failed/);
  const explained = explainCrmSyncApplyPlan(confirmedApply);
  const serialized = JSON.stringify(explained);
  assert.equal(explained.target_count, 2);
  assert.equal(serialized.includes("crm_plan_opaque_0001"), false);
  assert.equal(serialized.includes("sync-application-0001"), false);

  const result = normalizeCrmSyncApplyResponse(syncApplyResponse, {
    ...responseContract,
    expectedApplicationId: "sync-application-0001",
    expectedTargets: confirmedApply.target_closure
  });
  assert.equal(result.complete, false);
  assert.equal(result.atomicity, "non_atomic_per_source");
  assert.equal(result.consistency, "reconciliation_required");
  assert.deepEqual(result.receipts.map((receipt) => receipt.status), ["committed", "uncertain"]);
  assert.equal(result.cache_invalidation_required, true);
});

test("synchronization refuses missing contracts, stale plans, and receipt drift", () => {
  assert.throws(() => buildCrmSyncPlan({
    ...input,
    applicationId: "sync-application-0001",
    targets: syncRequestTargets,
    service: {
      ...input.service,
      operations: input.service.operations.filter((operation) => operation.capability !== "crm.sync.plan")
    }
  }), /resolve to exactly one discovered service operation/);
  assert.throws(() => buildCrmSyncPlan({
    ...input,
    applicationId: "sync-application-0001",
    targets: [syncRequestTargets[0], { ...syncRequestTargets[1], targetId: "create-secondary" }]
  }), /unique targetId/);
  assert.throws(() => buildCrmSyncPlan({
    ...input,
    applicationId: "sync-application-0001",
    targets: [
      syncRequestTargets[0],
      { ...syncRequestTargets[1], idempotencyKey: syncRequestTargets[0].idempotencyKey }
    ]
  }), /unique idempotencyKey/);
  assert.throws(() => buildCrmSyncPlan({
    ...input,
    applicationId: "sync-application-0001",
    targets: [
      syncRequestTargets[1],
      { ...syncRequestTargets[1], targetId: "update-primary-copy", idempotencyKey: "sync-update-0002" }
    ]
  }), /unique recordHandle/);
  assert.throws(() => buildCrmSyncPlan({
    ...input,
    applicationId: " sync-application-0001",
    targets: syncRequestTargets
  }), /applicationId must not start or end with whitespace/);
  assert.throws(() => buildCrmSyncPlan({
    ...input,
    applicationId: "sync-application-0001",
    targets: [{ ...syncRequestTargets[0], targetId: "target-with-space " }]
  }), /targetId must not start or end with whitespace/);
  const requestPlan = buildCrmSyncPlan({
    ...input,
    applicationId: "sync-application-0001",
    targets: syncRequestTargets
  });
  const normalizedServerPlan = normalizeCrmSyncPlanResponse(syncPlanResponse, {
    ...responseContract,
    expectedApplicationId: "sync-application-0001",
    expectedTargets: requestPlan.target_closure
  });
  const applyPlan = buildCrmSyncApplyPlan({
    ...input,
    serverPlan: normalizedServerPlan,
    now: "2026-09-04T16:00:00.000Z"
  });
  assert.throws(() => buildCrmSyncApplyPlan({
    ...input,
    serverPlan: normalizedServerPlan,
    now: "2026-09-04T16:31:00.000Z",
    confirmationId: "bos_confirm_stale"
  }), /has expired/);
  assert.throws(() => buildCrmSyncApplyPlan({
    ...input,
    app: { ...input.app, discovery_epoch: "epoch-43" },
    serverPlan: normalizedServerPlan,
    now: "2026-09-04T16:00:00.000Z"
  }), /stale or outside the current discovered service authority/);
  assert.throws(() => buildCrmSyncApplyPlan({
    ...input,
    app: { ...input.app, authority_epoch: 43 },
    serverPlan: normalizedServerPlan,
    now: "2026-09-04T16:00:00.000Z"
  }), /stale or outside the current discovered service authority/);
  assert.throws(() => normalizeCrmSyncApplyResponse({
    ...syncApplyResponse,
    complete: true,
    consistency: "converged"
  }, {
    ...responseContract,
    expectedApplicationId: "sync-application-0001",
    expectedTargets: applyPlan.target_closure
  }), /completion and consistency are invalid/);
  assert.throws(() => normalizeCrmSyncApplyResponse({
    ...syncApplyResponse,
    receipts: syncApplyResponse.receipts.map((receipt, index) =>
      index === 1 ? { ...receipt, reconciliationAction: "none" } : receipt
    )
  }, {
    ...responseContract,
    expectedApplicationId: "sync-application-0001",
    expectedTargets: applyPlan.target_closure
  }), /status and reconciliationAction are inconsistent/);
  assert.throws(() => normalizeCrmSyncPlanResponse({
    ...syncPlanResponse,
    targets: syncPlanResponse.targets.map((target, index) =>
      index === 0 ? { ...target, status: "rejected", error: null } : target
    )
  }, {
    ...responseContract,
    expectedApplicationId: "sync-application-0001",
    expectedTargets: requestPlan.target_closure
  }), /status and error are inconsistent/);
  assert.throws(() => normalizeCrmSyncPlanResponse({
    ...syncPlanResponse,
    targets: syncPlanResponse.targets.map((target, index) =>
      index === 0 ? { ...target, operation: "update" } : target
    )
  }, {
    ...responseContract,
    expectedApplicationId: "sync-application-0001",
    expectedTargets: requestPlan.target_closure
  }), /do not match the requested target closure/);
  assert.throws(() => normalizeCrmSyncPlanResponse({
    ...syncPlanResponse,
    targets: syncPlanResponse.targets.map((target, index) =>
      index === 0 ? { ...target, source: sourceThree } : target
    )
  }, {
    ...responseContract,
    expectedApplicationId: "sync-application-0001",
    expectedTargets: requestPlan.target_closure
  }), /do not match the requested target closure/);
  assert.throws(() => normalizeCrmSyncPlanResponse({
    ...syncPlanResponse,
    planHandle: "raw-plan-id"
  }, {
    ...responseContract,
    expectedApplicationId: "sync-application-0001",
    expectedTargets: requestPlan.target_closure
  }), /current opaque CRM synchronization plan handle|10 through 100000/);
  assert.throws(() => normalizeCrmSyncApplyResponse({
    ...syncApplyResponse,
    receipts: syncApplyResponse.receipts.map((receipt, index) =>
      index === 0 ? { ...receipt, operation: "update" } : receipt
    )
  }, {
    ...responseContract,
    expectedApplicationId: "sync-application-0001",
    expectedTargets: applyPlan.target_closure
  }), /do not match the confirmed target closure/);
  assert.throws(() => normalizeCrmSyncApplyResponse({
    ...syncApplyResponse,
    receipts: syncApplyResponse.receipts.map((receipt, index) =>
      index === 0 ? { ...receipt, source: sourceThree } : receipt
    )
  }, {
    ...responseContract,
    expectedApplicationId: "sync-application-0001",
    expectedTargets: applyPlan.target_closure
  }), /do not match the confirmed target closure/);
});

test("My CRM source contains no provider-specific routing contract", async () => {
  const paths = [
    "products/my-crm/product.json",
    "source/capabilities/my-crm/SKILL.md",
    "source/capabilities/my-crm/references/tool-workflows.md",
    "source/capabilities/my-crm-record-operations/SKILL.md",
    "source/capabilities/my-crm-pipeline-operations/SKILL.md",
    "source/capabilities/my-crm-activity-operations/SKILL.md",
    "source/capabilities/my-crm-federation-operations/SKILL.md",
    "source/platform/bos-federated-query/SKILL.md",
    "source/platform/bos-federated-query/references/execution-contract.md",
    "source/platform/bos-federated-query/scripts/federated-query.mjs"
  ];
  const contents = (await Promise.all(paths.map((path) => readFile(path, "utf8")))).join("\n");
  assert.doesNotMatch(contents, /\b(?:GoHighLevel|Calimatic|Salesforce)\b/i);
  assert.doesNotMatch(contents, /available_tools|source\.tool|execution:\s*["']parallel/i);
  assert.match(contents, /all enabled and authorized sources/i);
  assert.match(contents, /one provider-neutral service operation/i);
  assert.match(contents, /server-returned source lifecycle events/i);
  assert.match(contents, /thought-log[\s\S]*observable execution evidence/i);
});

test("My CRM stays disabled and has no licensing or payment dependency", async () => {
  const product = JSON.parse(await readFile("products/my-crm/product.json", "utf8"));
  assert.equal(product.release_status, "disabled");
  assert.equal("license" in product, false);
  assert.equal("licensing" in product, false);
  assert.equal("subscription" in product, false);
  assert.equal("payment" in product, false);
  assert.doesNotMatch(JSON.stringify(product), /Subscription Director|Stripe/i);
});
