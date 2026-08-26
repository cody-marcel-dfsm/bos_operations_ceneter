---
name: bos-federated-query
description: Plan, explain, execute, and aggregate authorized queries across multiple BOS-connected sources with per-source provenance, freshness, partial failures, progressive execution evidence, and scoped usage reporting. Use when a product query may span more than one data source or needs an explain plan.
---

# BOS Federated Query

Use the product's named BOS MCP connection and follow `bos-mcp-client` for
context validation, discovery refresh, and provider recovery. Domain skills
define entities, filters, identity policy, field authority, and presentation.
This skill owns the portable source-execution mechanics.

Read [references/execution-contract.md](references/execution-contract.md) before
the first federated execution or explain request in a task.

## Workflow

1. Validate one opaque BOS context and load the current MCP tool manifest.
   Derive the client source map from discovered tools plus the product routing
   configuration. Reuse it while its fingerprint and configured maximum age
   are current.
2. Compile the request into a plan containing the domain skill, dataset,
   normalized filter shape, selected discovered source tools, cache policy,
   execution dependencies, aggregation mode, and expected result schema.
   Require the caller's callable-tool set and reject every selected tool absent
   from that set.
3. For `explain`, return the sanitized plan and stop before source data calls or
   mutations. For `explain analyze`, execute and attach observed evidence.
4. Run the bounded cache-maintenance preflight for each selected source and
   dataset. Exclude stale data after a failed refresh under the default policy.
5. Create one isolated execution unit per independent source. Use host agents or
   parallel tool calls when available; pass only the selected context, source
   handle, normalized query, cache policy, output schema, and source budget.
   Use the same graph sequentially when parallel execution is unavailable.
6. Append sanitized source lifecycle events to the execution ledger as they
   occur. Publish progressive results when the host supports them.
7. Aggregate only terminal normalized source results. Preserve successful
   sources when another fails, retain field-level provenance in merged views,
   and represent unavailable data as a partial result.
8. Return freshness, timing, coverage, failures, recovery status, and usage with
   an explicit measurement scope.

Use the packaged `scripts/federated-query.mjs` helper when deterministic plan,
source-result, execution-event, or aggregate envelopes are useful.

## Mutation boundary

Single-source mutations inherit the source's declared guarantee. Multi-source
mutations use an explicitly confirmed task-local plan of existing source tools.
Preserve every source receipt and error. Reconcile with one verification read
through existing read, status, version, and idempotency operations when
discovered. Perform at most one replay and only when those contracts prove
safety. Report every committed, failed, uncertain, and reconciled source. This
skill creates no server state, schema, or background work.

The execution ledger contains observable operations and sanitized outcomes. It
excludes private model reasoning, credentials, raw authority identifiers, and
customer record bodies.
