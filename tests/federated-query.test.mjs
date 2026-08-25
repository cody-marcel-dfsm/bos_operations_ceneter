import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateQueryResult,
  buildQueryPlan,
  executionEvent,
  explainQueryPlan,
  normalizeSourceResult
} from "../source/platform/bos-federated-query/scripts/federated-query.mjs";

const input = {
  product: "my-crm",
  mcp_group: "crm",
  skills: ["my-crm-record-operations", "bos-federated-query"],
  dataset: "contacts",
  query: { email: "ada@example.com" },
  mode: "merged_view",
  sources: [
    {
      source_handle: "opaque-source-one",
      source_label: "Lead Director",
      max_age_seconds: 300
    },
    {
      source_handle: "opaque-source-two",
      source_label: "GoHighLevel",
      max_age_seconds: 60
    }
  ]
};

test("query plans are deterministic and explain output sanitizes values", () => {
  const first = buildQueryPlan(input);
  const second = buildQueryPlan(input);
  assert.deepEqual(first, second);
  assert.equal(first.aggregation.mode, "merged_view");
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
      { status: "completed", records: [{ record_ref: "bos:person:one" }] },
      { status: "failed", records: [], error: { code: "source_unavailable" } }
    ],
    execution_ledger: ledger,
    usage: { scope: "unavailable" }
  });
  assert.equal(result.complete, false);
  assert.equal(result.record_count, 1);
  assert.equal(result.failed_source_count, 1);
  assert.equal(result.execution_ledger[0].event_type, "plan_created");
});

test("plans and usage fail closed on malformed policy", () => {
  assert.throws(
    () => buildQueryPlan({ ...input, mode: "atomic_cross_source" }),
    /mode is invalid/
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
