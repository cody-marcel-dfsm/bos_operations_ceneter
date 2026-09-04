---
name: bos-federated-query
description: Plan, explain, execute, and aggregate authorized queries across multiple BOS-connected sources with per-source provenance, freshness, partial failures, progressive execution evidence, and scoped usage reporting. Use when a product query may span more than one data source or needs an explain plan.
---

# BOS Federated Query

Use the single BOS MCP connection and follow `bos-mcp-client` for
context validation, discovery refresh, and provider recovery. Domain skills
define entities, filters, identity policy, field authority, and presentation.
This skill owns portable client planning and result handling. The discovered
application service owns source resolution, integration fan-out, concurrency,
and source-level execution.

Read [references/execution-contract.md](references/execution-contract.md) before
the first federated execution or explain request in a task.

## Workflow

1. Validate one opaque BOS context, discover the selected application through
   BOS, and load the app-owned service and machine-readable API contracts.
   Reuse sanitized discovery metadata only while its digest, discovery epoch,
   context, and configured maximum age are current.
2. Compile the request into a plan containing the domain skill, dataset,
   normalized filter shape, selected semantic service operation, source scope,
   cache policy, one invocation, aggregation mode, and expected result schema.
   Select the operation only from the current service contract.
3. For `explain`, return the sanitized plan and stop before source data calls or
   mutations. For `explain analyze`, execute and attach observed evidence.
4. Run one bounded cache-maintenance preflight for the complete dataset and
   requested source scope. Exclude stale data after a failed refresh under the
   default policy.
5. Invoke the provider-neutral service operation once. Omit the source selector
   for all enabled and authorized sources; explicit scope contains only opaque
   handles returned by the current service discovery.
6. Append sanitized server-returned source lifecycle events to the execution
   ledger as they arrive. Publish progressive results in the host's thought-log
   or activity surface when supported; otherwise render the returned ledger
   after completion. Treat these events as observable execution evidence and
   never as private reasoning.
7. Compose only terminal normalized source results returned by that invocation. Preserve successful
   sources when another fails, retain field-level provenance in merged views,
   and represent unavailable data as a partial result.
8. Return freshness, timing, coverage, failures, recovery status, and usage with
   an explicit measurement scope.

Use the packaged `scripts/federated-query.mjs` helper for deterministic query,
record get/create/update, synchronization plan/apply, response-validation,
source-result, execution-event, and aggregate envelopes.

## Mutation boundary

Single-source mutations inherit the source's declared guarantee. Multi-source
mutations use an explicitly confirmed server plan and one provider-neutral
apply invocation. Synchronization planning and apply use the separately
discovered `crm.sync.plan` and `crm.sync.apply` operations; each phase issues
one app-service call. Preserve every server-returned source receipt and error.
Preserve service-returned reconciliation actions and leave recovery and replay
decisions with the server. Issue no per-target recovery call and never replay
synchronization planning or apply. Report every committed, failed, uncertain,
and reconciled source.
This skill creates no server state, schema, or background work.

The execution ledger contains observable operations and sanitized outcomes. It
excludes private model reasoning, credentials, raw authority identifiers, and
customer record bodies.
