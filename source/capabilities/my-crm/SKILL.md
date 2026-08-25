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

Treat `explain <request>` as a plan-only request. Return selected skills,
sources, sanitized parameter shapes, cache decisions, parallel groups,
aggregation, mutation boundaries, and expected output. Execute no source data
call or mutation. `explain analyze` executes and attaches observed evidence.

Present source identity, cache/live status, local freshness, partial failures,
and scoped token usage in the final result. Missing source data remains an
explicit partial result.
