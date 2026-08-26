import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateQueryResult,
  buildSourceCacheDescriptor,
  buildQueryPlan,
  executionEvent,
  explainQueryPlan,
  normalizeSourceResult
} from "../source/platform/bos-federated-query/scripts/federated-query.mjs";

const input = {
  product: "my-crm",
  mcp_group: "crm",
  manifest_fingerprint: "sha256:active-crm-tools-v1",
  available_tools: ["crm_search_leads", "crm_search_calimatic_students"],
  skills: ["my-crm-record-operations", "bos-federated-query"],
  dataset: "customer_records",
  query: { email: "ada@example.com" },
  mode: "merged_view",
  sources: [
    {
      source_handle: "opaque-source-one",
      source_label: "Lead Director",
      tool: "crm_search_leads",
      max_age_seconds: 300
    },
    {
      source_handle: "opaque-source-two",
      source_label: "Calimatic",
      tool: "crm_search_calimatic_students",
      max_age_seconds: 60
    }
  ]
};

test("query plans are deterministic and explain output sanitizes values", () => {
  const first = buildQueryPlan(input);
  const second = buildQueryPlan(input);
  assert.deepEqual(first, second);
  assert.equal(first.aggregation.mode, "merged_view");
  assert.equal(first.manifest_fingerprint, "sha256:active-crm-tools-v1");
  assert.equal(first.sources[0].tool, "crm_search_leads");
  assert.equal(first.sources.length, 2);

  const explained = explainQueryPlan(first);
  assert.equal(explained.executes_source_calls, false);
  assert.deepEqual(explained.query_shape, { email: "string" });
  assert.equal(JSON.stringify(explained).includes("ada@example.com"), false);
  assert.equal(
    JSON.stringify(explained).includes("opaque-source-one"),
    false
  );
});

test("source results include local freshness and scoped usage", () => {
  const value = normalizeSourceResult({
    source_handle: "opaque-source-one",
    source_label: "Lead Director",
    tool: "crm_search_leads",
    status: "completed",
    origin: "cache",
    last_updated_at: "2026-08-25T20:14:00.000Z",
    max_age_seconds: 300,
    records: [{ record_ref: "bos:person:one" }],
    usage: {
      scope: "host_measured",
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15
    }
  }, {
    now: "2026-08-25T20:17:00.000Z",
    timeZone: "America/Denver"
  });
  assert.equal(value.freshness.status, "fresh");
  assert.equal(value.freshness.age_seconds, 180);
  assert.equal(value.freshness.age_label, "3 minutes ago");
  assert.equal(value.usage.scope, "host_measured");
  assert.equal(value.usage.total_tokens, 15);
});

test("source cache keys are deterministic and stale cache is withheld", () => {
  const plan = buildQueryPlan({
    ...input,
    sources: [
      input.sources[0],
      { ...input.sources[1], query: { student_name: "Ada" } }
    ]
  });
  const descriptor = buildSourceCacheDescriptor(
    plan,
    "opaque-source-two"
  );
  assert.equal(descriptor.cache_key.startsWith("bos_query_"), true);
  assert.equal(descriptor.query_digest.length, 64);
  assert.deepEqual(plan.sources[1].query, { student_name: "Ada" });

  const stale = normalizeSourceResult({
    source_handle: "opaque-source-two",
    source_label: "Calimatic",
    tool: "crm_search_calimatic_students",
    origin: "cache",
    last_updated_at: "2026-08-25T20:00:00.000Z",
    max_age_seconds: 60,
    records: [{ record_ref: "bos:person:stale" }]
  }, { now: "2026-08-25T20:05:00.000Z" });
  assert.equal(stale.status, "refresh_required");
  assert.deepEqual(stale.records, []);
});

test("aggregation preserves completed sources and reports partial completion", () => {
  const plan = buildQueryPlan(input);
  const ledger = [executionEvent({
    sequence: 1,
    event_type: "plan_created",
    occurred_at: "2026-08-25T20:14:00.000Z",
    details: { source_count: 2 }
  })];
  const result = aggregateQueryResult({
    plan,
    source_results: [
      {
        source_handle: "opaque-source-one",
        source_label: "Lead Director",
        tool: "crm_search_leads",
        status: "completed",
        records: [{
          record_ref: "bos:person:one",
          identity: { normalized_email: "ada@example.com" }
        }]
      },
      {
        source_handle: "opaque-source-two",
        source_label: "Calimatic",
        tool: "crm_search_calimatic_students",
        status: "failed",
        records: [],
        error: { code: "source_unavailable" }
      }
    ],
    execution_ledger: ledger,
    usage: { scope: "unavailable" }
  });
  assert.equal(result.complete, false);
  assert.equal(result.record_count, 1);
  assert.equal(result.failed_source_count, 1);
  assert.equal(result.execution_ledger[0].event_type, "plan_created");
});

test("aggregation totals complete source usage with an explicit scope", () => {
  const result = aggregateQueryResult({
    plan: buildQueryPlan(input),
    source_results: [
      {
        source_handle: "opaque-source-one",
        source_label: "Lead Director",
        tool: "crm_search_leads",
        status: "completed",
        records: [],
        usage: {
          scope: "host_measured",
          input_tokens: 10,
          output_tokens: 2,
          total_tokens: 12
        }
      },
      {
        source_handle: "opaque-source-two",
        source_label: "Calimatic",
        tool: "crm_search_calimatic_students",
        status: "completed",
        records: [],
        usage: {
          scope: "host_measured",
          input_tokens: 20,
          output_tokens: 3,
          total_tokens: 23
        }
      }
    ]
  });
  assert.deepEqual(result.usage, {
    scope: "host_measured",
    input_tokens: 30,
    output_tokens: 5,
    total_tokens: 35
  });
});

test("merged views correlate exact email across sources and preserve ambiguity", () => {
  const result = aggregateQueryResult({
    plan: buildQueryPlan(input),
    source_results: [
      {
        source_handle: "opaque-source-one",
        source_label: "Lead Director",
        tool: "crm_search_leads",
        status: "completed",
        records: [{
          record_ref: "lead-1",
          identity: {
            normalized_email: "Ada@Example.com",
            normalized_phone: "+13035550100"
          }
        }]
      },
      {
        source_handle: "opaque-source-two",
        source_label: "Calimatic",
        tool: "crm_search_calimatic_students",
        status: "completed",
        records: [
          {
            record_ref: "student-1",
            identity: {
              normalized_email: "ada@example.com",
              normalized_phone: "+13035550100"
            }
          },
          {
            record_ref: "student-duplicate",
            identity: { normalized_email: "duplicate@example.com" }
          },
          {
            record_ref: "student-duplicate-2",
            identity: { normalized_email: "duplicate@example.com" }
          },
          {
            record_ref: "phone-only",
            identity: { normalized_phone: "+13035550100" }
          }
        ]
      }
    ]
  });

  const correlated = result.merged_view.groups.find(
    (group) => group.identity?.normalized_email === "ada@example.com"
  );
  assert.equal(correlated.status, "correlated");
  assert.equal(correlated.members.length, 2);
  const ambiguous = result.merged_view.groups.find(
    (group) => group.identity?.normalized_email === "duplicate@example.com"
  );
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.reason, "duplicate_candidate_within_source");
  assert(result.merged_view.groups.some(
    (group) => group.reason === "missing_normalized_email"
  ));
});

test("plans and usage fail closed on malformed policy", () => {
  assert.throws(
    () => buildQueryPlan({ ...input, mode: "atomic_cross_source" }),
    /mode is invalid/
  );
  assert.throws(
    () => buildQueryPlan({ ...input, manifest_fingerprint: "" }),
    /manifest_fingerprint must be a non-empty string/
  );
  assert.throws(
    () => buildQueryPlan({
      ...input,
      sources: [{ ...input.sources[0], tool: "" }]
    }),
    /sources\[0\]\.tool must be a non-empty string/
  );
  assert.throws(
    () => buildQueryPlan({
      ...input,
      sources: [{
        ...input.sources[0],
        tool: "crm_search_records"
      }]
    }),
    /sources\[0\]\.tool is absent from available_tools/
  );
  assert.throws(
    () => buildQueryPlan({ ...input, available_tools: [] }),
    /available_tools must be a non-empty array/
  );
  assert.throws(
    () => aggregateQueryResult({
      plan: buildQueryPlan(input),
      source_results: [],
      usage: { scope: "exact-ish" }
    }),
    /usage.scope is invalid/
  );
});
