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
2. Select one client execution mode:
   - `per_source` for distinct source results or one explicit source;
   - `federated` for a combined search retaining provenance;
   - `merged_view` for a correlated presentation with conflicts; or
   - `synchronize_from` for an explicitly confirmed sequence using one field
     authority.
3. Load the current MCP tool manifest. Derive the source/capability map from
   the discovered tool names and schemas plus this package's client routing
   configuration. Reuse the map only while its manifest fingerprint and
   configured maximum age remain current.
4. Select only operations actually present in the live manifest. Absence means
   unavailable in the selected context; it never triggers server registration,
   capability creation, a database write, or a fallback to another connection.
5. Delegate CRM semantics to the focused skill and source mechanics to
   `bos-federated-query`.

## Use discovered BOS operations

- Treat `tools/list` and `bos_get_context` as the authoritative discovery
  surfaces. Tool schemas define the parameters the client may send.
- Use existing CRM aliases when discovered. The initial Lead Director route
  provides `crm_search_leads`, `crm_get_lead`, `crm_create_lead`, and the
  server-advertised availability of `crm_update_lead`.
- Map additional discovered provider operations to CRM source semantics in the
  client. Preserve the exact source tool name and result provenance.
- Never call a generic CRM operation merely because this skill names a desired
  semantic. Call only a tool returned by the active MCP connection.

Read [tool workflows](references/tool-workflows.md) before a federated query or
mutation.

Treat `explain <request>` as a client plan-only request. Compile it from the
live/cached manifest and skill configuration. Return selected skills, sources,
exact discovered tool names, sanitized parameter shapes, cache decisions,
parallel groups, aggregation, mutation boundaries, and expected output.
Execute no source data call or mutation. `explain analyze` executes the same
plan and attaches observed evidence.

For a normal multi-source query, create one execution-ledger `source_started`
event per selected source, then issue one bounded call to that source's
discovered read tool. Run those calls in parallel sub-agents when the host
supports them.
Append `source_completed` or `source_failed` as each result returns so the
visible activity surface receives progressive per-source data. A sequential
host follows the same event and result contract.

Present source identity, cache/live status, local freshness, partial failures,
and scoped token usage in the final result. Missing source data remains an
explicit partial result.
