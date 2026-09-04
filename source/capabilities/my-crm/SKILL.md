---
name: my-crm
description: Operate customer, lead, opportunity, pipeline, and activity data across authorized BOS-connected CRM sources. Use for CRM requests that may target one source, query several sources, build a merged view, or synchronize selected fields from an authoritative source.
---

# My CRM

Use the authenticated BOS MCP connection. Follow `bos-mcp-client` for OAuth,
opaque context selection, discovery, recovery, and continuation. Use
`bos-federated-query` and `bos-cache-maintenance` for source execution and
freshness.

For a customer-journey or installed-graph request, use `bos-app-discovery` and
`my-crm-customer-journey`. Discover Lead Director from the authenticated BOS app
directory, query its returned app MCP contact, and call its discovered HTTPS
APIs. Do not route that vertical slice through a BOS domain alias. Existing CRM
aliases remain compatibility inventory for workflows not yet migrated to an
app-owned discovery contract.

## Route the request

1. Identify the CRM entity and intent: records, pipeline, customer journey,
   activities, or federation/reconciliation.
2. Select one client execution mode:
   - `per_source` for distinct source results or one explicit source;
   - `federated` for a combined search retaining provenance;
   - `merged_view` for a correlated presentation with conflicts; or
   - `synchronize_from` for an explicitly confirmed sequence using one field
     authority.
3. For the customer-journey vertical slice, load the BOS app directory and the
   selected app's current MCP and API contracts. For compatibility workflows,
   load the current BOS MCP tool manifest. Derive the source/capability map from
   discovered contracts plus this package's client routing configuration. Reuse
   the map only while its manifest fingerprint and configured maximum age
   remain current.
4. For the journey slice, select only operations advertised by the current app
   service and API contracts. For compatibility workflows, select only
   operations actually present in the live dynamic BOS tool surface. Presence
   defines operation shape, not context or provider authorization. Absence is a
   service-resolution or schema-publication mismatch; it never triggers server
   registration, capability creation, or a database write.
5. Delegate CRM semantics to the focused skill and source mechanics to
   `bos-federated-query`.

Use `my-crm-customer-journey` when the user asks where a lead or customer is in
the sales journey, how they reached the current state, what comes next, which
states lead to a desired goal, or for a journey graph.

## Use discovered operations

- For migrated app-owned workflows, treat BOS discovery, the selected app MCP,
  and its machine-readable API contract as separate authority and routing
  layers. GPT owns service selection and result composition.
- Treat `tools/list` as live discovery of dynamic domain-specific MCP services
  and tooling, and `bos_get_context` as the organization/context surface. Tool schemas define the parameters the
  client may send; only `tools/call` decides whether that context and provider
  may execute the operation.
- For compatibility workflows, use existing CRM aliases when discovered. The
  initial Lead Director compatibility route
  provides `crm_search_leads`, `crm_get_lead`, `crm_create_lead`, and the
  server-advertised availability of `crm_update_lead`.
- Map additional discovered provider operations to CRM source semantics in the
  client. Preserve the exact source tool name and result provenance, and handle
  any server-returned authorization recovery at call time.
- Never call a generic CRM operation merely because this skill names a desired
  semantic. Call only an app API operation returned by current app discovery or,
  for a compatibility workflow, a tool returned by the active BOS MCP
  connection.

Read [tool workflows](references/tool-workflows.md) before a federated query or
mutation. Load [client policy](references/client-policy.json) for identity,
freshness, confirmation, and recovery defaults.

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
