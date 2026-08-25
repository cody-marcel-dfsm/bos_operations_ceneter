---
name: my-crm
description: Operate customer, lead, opportunity, pipeline, and activity data across authorized BOS-connected CRM sources. Use for CRM requests that may target one source, query several sources, build a merged view, or synchronize selected fields from an authoritative source.
---

# My CRM

Use the named `crm` BOS MCP connection. Follow `bos-mcp-client` for OAuth,
opaque context selection, discovery, recovery, and continuation. Use
`bos-federated-query` and `bos-cache-maintenance` for source execution and
freshness.

## Route the request

1. Identify the CRM entity and intent: records, pipeline, activities, or
   federation/reconciliation.
2. Select one execution mode:
   - `per_source` for distinct source results or one explicit source;
   - `federated` for a combined search retaining provenance;
   - `merged_view` for a correlated presentation with conflicts; or
   - `synchronize_from` for a governed plan using one explicit field authority.
3. Call `crm_list_sources` or use the current cached source catalog. Select only
   sources whose discovered operation coverage satisfies the request.
4. Delegate CRM semantics to the focused skill and source mechanics to
   `bos-federated-query`.

## Use the public CRM operations

- Discover with `crm_list_sources`.
- Search with `crm_search_records`; use `source_handles` to constrain one
  execution unit and `source_queries` when providers need different normalized
  filters.
- Read one exact record with `crm_get_record`.
- Create or update one source with `crm_create_record` or `crm_update_record`.
- Plan and apply multi-source changes with `crm_plan_sync` and
  `crm_apply_sync`.
- Observe recovery with `crm_get_operation_status` and advance uncertain work
  with `crm_reconcile_operation`.

Read [tool workflows](references/tool-workflows.md) before a federated query or
mutation.

Treat `explain <request>` as a plan-only request. Return selected skills,
sources, sanitized parameter shapes, cache decisions, parallel groups,
aggregation, mutation boundaries, and expected output. Execute no source data
call or mutation. `explain analyze` executes and attaches observed evidence.

For a normal multi-source query, create one execution-ledger `source_started`
event per selected handle, then issue one bounded `crm_search_records` call per
handle. Run those calls in parallel sub-agents when the host supports them.
Append `source_completed` or `source_failed` as each result returns so the
visible activity surface receives progressive per-source data. A sequential
host follows the same event and result contract.

Present source identity, cache/live status, local freshness, partial failures,
and scoped token usage in the final result. Missing source data remains an
explicit partial result.
