# Federated query execution, freshness, and explain planning

## Status and ownership

- **Status:** proposed BOS platform contract
- **Owner:** BOS Operations Center platform skills and packaged client runtime
- **Server owner:** each BOS application that exposes federated query and
  mutation tools
- **First consumer:** My CRM over the Lead Director `crm` MCP group

## Purpose

Define a reusable client execution model for queries and mutations that span
multiple BOS-connected sources. The contract covers source discovery, cached
source catalogs, configurable dataset freshness, per-source parallel work,
progressive source results, final aggregation, explain plans, usage reporting,
and recovery from partial cross-source mutations.

This is an operating-system capability. CRM skills supply CRM semantics such as
entities, filters, field authority, source selection, and merge policy. The BOS
platform execution skills run the resulting source graph consistently for CRM,
education, reporting, marketing, and future federated products.

## Core invariants

1. Each source operation receives only the selected opaque BOS context, one
   server-discovered source handle, the minimum normalized query, and its
   bounded output contract.
2. A source mutation commits with exactly the transactional and atomicity
   guarantees of that source's verified provider or application operation.
3. A cross-source mutation is a set of independent source commits. It is never
   represented as a distributed atomic transaction.
4. Cross-source completion is durable, idempotent, observable per source, and
   recoverable toward eventual consistency.
5. Cached data is authority-scoped. Every cache read first proves current BOS
   context and source-account authorization.
6. A dataset whose last complete synchronization exceeds its configured
   maximum age is stale. The normal query path refreshes it and excludes the
   stale dataset from the answer.
7. Every source result reports whether its dataset came from a cache, a live
   inquiry, or a live refresh combined with cached coverage, plus the last
   complete update time.
8. Source execution events contain observable operations and sanitized
   outcomes. They never contain private model reasoning, credentials, raw
   authority identifiers, customer records, or hidden instructions.
9. Token usage is reported only at the scope and precision the host can
   measure. Estimated and unavailable values are labeled explicitly.
10. Host feature differences may change parallelism and progressive rendering.
    They never change query meaning, source scope, final result schema, or
    mutation guarantees.

## Source catalog

The application MCP group exposes a source catalog containing:

- stable opaque source handle and display name;
- source type and provider family;
- supported entity and dataset types;
- supported read, create, update, delete, pipeline, activity, link, merge, and
  synchronization operations;
- query filters, pagination, versions, cursors, and snapshot behavior;
- current connection and authorization state;
- declared transactional and atomicity guarantees by operation;
- whether the source can act as an authoritative input or synchronization
  target; and
- catalog revision, observed time, and invalidation metadata.

The client may cache this sanitized catalog. It refreshes the catalog after MCP
connection, tool-manifest, plugin, capability, provider-binding, or server
revision changes and after the configured catalog maximum age expires. A normal
query reuses a current catalog and avoids an unconditional discovery call.

The catalog grants no authority. Every source call remains subject to live
server authorization.

The effective cache-reuse decision combines the client-configured maximum age
with server invalidation evidence. A context, authorization, provider binding,
catalog, or source revision change forces refresh even when the client age
window has not expired.

## Query plan

The domain skill compiles the user's request into a sanitized plan:

```json
{
  "plan_version": "bos-query-plan/v1",
  "mode": "execute",
  "product": "my-crm",
  "mcp_group": "crm",
  "skills": ["my-crm-record-operations", "bos-federated-query"],
  "dataset": "contacts",
  "query": {
    "filters": {"email": "normalized user value"},
    "window": null
  },
  "sources": [
    {
      "source_handle": "opaque server-discovered handle",
      "cache_policy": {"max_age_seconds": 300},
      "execution": "parallel"
    }
  ],
  "aggregation": {
    "mode": "merged_view",
    "preserve_per_source": true
  }
}
```

The persisted or diagnostic form replaces user values with field names,
types, counts, bounds, or hashes. Raw customer query values remain in the
task-local execution context only.

The plan records:

- domain and platform skills used;
- named product connection and MCP group;
- selected context label without raw authority identifiers;
- dataset/entity type and normalized filter shape;
- selected sources and why each qualifies;
- cache policy and current freshness decision per source;
- source call schemas and sanitized parameter shapes;
- parallel groups and dependencies;
- aggregation, identity, conflict, and provenance policy;
- mutation boundaries, approvals, idempotency, and recovery when applicable;
- expected output sections; and
- estimated latency and visible-token budget when estimates are available.

## Explain modes

An explicit request in the form `explain <request>` or `explain plan for
<request>` compiles and returns the query plan without executing source data
calls or mutations.

The explain result includes:

1. interpreted intent;
2. skills and MCP group that would be used;
3. selected or eligible sources;
4. sanitized tool calls and parameter shapes;
5. cache hit, stale, or refresh decisions based on metadata only;
6. parallel fan-out and aggregation steps;
7. transaction, partial-failure, and recovery semantics;
8. expected result shape; and
9. estimated usage and latency with estimation scope.

`explain analyze <request>` executes the plan and adds measured timing, cache,
source, recovery, and available token-usage evidence. It follows the same
authorization and mutation-confirmation rules as normal execution.

Explain output describes observable operations and policy decisions. It does
not expose private chain-of-thought or hidden model instructions.

## Cache freshness contract

Extend the shared document-cache request with a client-resolved policy:

```json
{
  "freshness_policy": {
    "max_age_seconds": 300,
    "allow_stale_on_error": false
  }
}
```

`max_age_seconds` is selected from the installed product's client-owned policy
for the source and dataset, with a task-specific user override when provided.
It changes data-reuse behavior and grants no server authority.

Before using a covered dataset, compare the current time with its last complete
`sync_completed_at`:

- `fresh_cache`: age is within policy; use the cached dataset without a source
  content query;
- `refresh_required`: age exceeds policy; ignore the stale dataset, refresh
  through a fixed upper bound, commit atomically, and use the new dataset;
- `live`: cache is disabled for this query or source;
- `mixed`: current cached coverage plus a successfully committed live delta;
- `refresh_failed`: refresh did not complete; exclude that source from the
  answer and report a source-specific partial result.

The default is `allow_stale_on_error: false`. A later explicit product policy
may permit stale-on-error behavior, and its output must label that exception
prominently.

Every rendered source section includes:

- origin: cache, live, or mixed;
- last complete update in ISO 8601 for machine use;
- the same time rendered in the user's effective local timezone with timezone
  abbreviation;
- a human-readable age such as `3 minutes ago`;
- freshness status and configured maximum age; and
- source coverage or incompleteness.

Example: `GoHighLevel — cache · updated Aug 25, 2026 at 2:14 PM MDT (3 minutes
ago) · maximum age 5 minutes`.

## Parallel per-source execution

The platform skill creates one bounded execution unit per selected source. A
capable host runs independent units concurrently through sub-agents or parallel
tool calls. Each unit receives:

- the selected opaque `context_id`;
- one opaque source handle;
- the normalized source-specific query;
- cache policy and fixed refresh bound;
- the expected normalized result schema;
- a source-specific token and time budget; and
- no unrelated conversation history or results from another source.

The aggregator receives normalized source results, sanitized execution events,
and usage evidence. It performs the requested per-source, federated, or merged
presentation and retains field-level provenance.

A host without agent or parallel-tool support executes the same source graph
sequentially. The final result contract and failure semantics remain identical.

## Progressive execution ledger

The client maintains a user-visible execution ledger with events such as:

- `plan_created`;
- `catalog_cache_used` or `catalog_refreshed`;
- `source_started`;
- `source_cache_hit`, `source_cache_stale`, or `source_refresh_started`;
- `source_result_available`;
- `source_failed` or `source_recovery_started`;
- `aggregation_started`;
- `mutation_committed`, `mutation_failed`, or `mutation_uncertain`; and
- `query_finalized`.

When the host supports progressive task output, publish each source result and
ledger event as it completes. The result may populate the host's progress,
activity, or thought-log presentation surface, while remaining an execution
log containing observable evidence and excluding private reasoning. When
progressive output is unavailable, buffer the same ledger and return it with
the final answer.

The current Lead Director MCP transport streams subscription invalidations but
returns `tools/call` as one complete JSON response. Client-side source fan-out
is therefore the initial progressive path. Server-streamed per-call progress is
a separate transport enhancement.

## Final query result

The aggregator always produces a final result after every source reaches a
terminal query state:

- completed sources and normalized result counts;
- failed, unavailable, stale, or recovery-required sources;
- per-source result sections;
- optional merged view with field-level provenance and conflicts;
- source freshness and origin labels;
- total elapsed time and per-source timing;
- cache hit, refresh, and transferred-record counts;
- available token usage by source and in total; and
- the sanitized execution ledger or a compact linkable receipt.

An unavailable source produces a partial result. Missing data never appears as
an empty dataset.

A normalized source result has this minimum shape:

```json
{
  "source_handle": "opaque server-discovered handle",
  "source_label": "GoHighLevel",
  "status": "completed",
  "origin": "cache",
  "freshness": {
    "status": "fresh",
    "last_updated_at": "2026-08-25T20:14:00Z",
    "local_label": "Aug 25, 2026 at 2:14 PM MDT",
    "age_label": "3 minutes ago",
    "max_age_seconds": 300
  },
  "coverage": {"complete": true},
  "records": [],
  "error": null,
  "usage": {"scope": "unavailable"}
}
```

## Usage reporting

Track usage in three scopes:

1. `host_measured`: exact model usage returned by a host or agent API;
2. `client_visible_estimate`: an estimate over plugin-visible prompts, tool
   payloads, source-agent summaries, and final output; and
3. `unavailable`: the host exposes no reliable measurement or estimator.

Report input, output, and total tokens per source execution unit and for the
aggregator when available. Display the measurement scope. Never present a
client-visible estimate as complete host billing usage because system prompts,
hidden context, cache discounts, and provider accounting may be unavailable.

## Mutation and consistency contract

### Single source

A source operation returns its declared guarantee, commit identity or version,
read-back verification, and final state. The client describes that commit only
at the provider's verified guarantee level, such as:

- transactional atomic commit;
- atomic single-record write;
- version-checked write; or
- provider best effort.

### Multiple sources

The server stores one durable federated operation with one child operation per
source. Each child records:

- source handle and target record reference;
- intended operation and expected version;
- idempotency key;
- state: pending, committed, failed, uncertain, recovery scheduled, or
  reconciled;
- attempt count and sanitized error category;
- provider correlation or commit receipt when available; and
- last reconciliation time.

The apply operation may commit some sources before another fails. The result
reports every committed, failed, unavailable, and uncertain source. The client
never claims rollback of committed sources unless a verified compensating
operation completed.

Recovery rechecks uncertain results, retries retry-safe failures with the same
idempotency identities, refreshes affected cache entries, and continues until
the operation reaches complete, stable partial, or user-action-required state.
The server owns the durable recovery state and scheduled retries. The client
may request a retry or reconciliation, observes the durable status, and reports
each recovery attempt and final consistency state.

## Platform skills

Add two reusable skills under `source/platform/`:

### `bos-federated-query`

Own query-plan compilation support, source fan-out, context minimization,
progressive execution ledger, result aggregation, freshness labels, usage
reporting, and explain/explain-analyze behavior.

### `bos-cache-maintenance`

Own source-catalog refresh, query-cache inspection, stale-query refresh,
explicit invalidation, authority revocation cleanup, unreferenced-object
garbage collection, and cache health reporting. On every domain invocation it
runs a bounded preflight for only the catalog and datasets relevant to that
request. It never refreshes the entire cache indiscriminately.

Domain products include these skills when they perform federated or expensive
multi-source reads. Domain skills supply semantics and source policies; the
platform skills supply execution mechanics.

## Required additions to the current platform

1. Add maximum-age freshness policy and stale states to the shared cache helper.
2. Add cache maintenance operations and tests.
3. Add a revisioned, cacheable MCP source-catalog contract.
4. Add a portable query-plan and explain-result schema.
5. Add source-scoped query tools that return terminal per-source results.
6. Change federated search aggregation to retain other source results when one
   source fails.
7. Add durable per-source federated mutation states and recovery orchestration.
8. Add client execution-ledger and usage envelopes.
9. Validate bounded parallel execution and sequential fallback.
10. Add progressive host rendering where supported; retain final-ledger parity
    everywhere.

## Validation gates

1. Stale datasets are refreshed and excluded when refresh fails under the
   default policy.
2. Every source result displays origin, local update time, age, and coverage.
3. Parallel and sequential execution produce equivalent final results.
4. One failed source preserves successful source results and yields a partial
   final answer.
5. Explain performs no source data call; explain analyze records actuals.
6. Execution logs contain no private reasoning, credentials, raw authority
   identifiers, or customer records.
7. Usage values declare measured, estimated, or unavailable scope.
8. Single-source results never claim stronger atomicity than the provider
   contract.
9. Cross-source results never claim atomic commit or unverified rollback.
10. Recovery is idempotent and converges to complete, stable partial, or
    user-action-required state with every source accounted for.
