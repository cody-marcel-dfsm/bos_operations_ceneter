---
name: my-crm
description: Operate customer, lead, opportunity, pipeline, and activity data across authorized BOS-connected CRM sources. Use for CRM requests that may target one source, query several sources, build a merged view, or synchronize selected fields from an authoritative source.
---

# My CRM

Use the single authenticated BOS MCP connection. Follow `bos-mcp-client` for
OAuth, opaque context selection, discovery, recovery, and continuation. Follow
`bos-app-discovery` to discover Lead Director and its current app-owned service
and API contracts. Use `bos-federated-query` and `bos-cache-maintenance` for
client planning, result caching, freshness, progress rendering, and final
composition.

Lead Director's discovered CRM service is the provider-neutral boundary. The
service resolves the organization's enabled and authorized sources, invokes
their integrations, and returns source-attributed results. Treat every returned
source through the same contract. Never select an underlying provider tool,
construct a provider routing table, or fan out one client call per source.

For any lead or contact detail request, invoke `my-crm-customer-journey` as
part of the read and present its rich graph view by default, including for a
single requested field. Return that field and relevant profile details below
the graph. Resolve contact graph membership from application evidence and
preserve verified details when graph evidence is partial or unavailable.
The user need not ask for a journey or specify a goal. Follow explicit user
format instructions and keep the request read-only.

Whenever a lead is displayed, use `my-crm-customer-journey`'s detailed display
contract: current-state-to-goal graph with bold green preferred positive route,
profile details and freshness. Apply it to create/update results, duplicate
matches, previews/receipts and each displayed list entry. Obtain missing display
evidence after a confirmed write without replaying it. Preserve pagination,
explicit user formats and historical labeling for deleted records.

## Lead Director access patterns

Use `my-crm-record-operations` for exact lookup, search, filtered lists,
pagination, batch reads, and contract-supported create, update, or delete.
Follow its access-pattern guidance to preserve the user's operation and scope,
reuse valid current-context evidence, and select the live native or
provider-neutral contract. Use `my-crm-customer-journey` for every displayed lead
and its exact current-node-to-goal path. Lists retain selection scope and pagination;
graph discovery never becomes an unrelated mutation prerequisite. Keep writes
subject to their authorization, confirmation, version, and receipt contracts.

## Route the request

1. Identify the CRM entity and intent: records, pipeline, customer journey,
   activities, or federation/reconciliation.
2. Select one presentation or mutation mode:
   - `per_source` for distinct source results or one explicit source;
   - `federated` for a combined search retaining provenance;
   - `merged_view` for a correlated presentation with conflicts; or
   - `synchronize_from` for an explicitly confirmed server-orchestrated change
     using one field authority.
3. Query the BOS app directory for the selected organization. Select Lead
   Director only from the returned app descriptors, then query the exact
   returned app MCP contact.
4. Discover the app-owned service whose advertised semantics cover the CRM
   entity and intent. Load its current machine-readable API contract. Select an
   operation by semantic capability, schema, and side-effect class rather than
   by a package-embedded operation name.
5. When explicit source selection is needed, invoke the discovered
   `crm.sources.list` operation once and validate its exact
   `lead-director-crm-sources/v1` response for the current context, authority,
   and service. If the user omitted a source, omit the source selector. The service then
   searches all sources enabled and authorized for that organization. If the
   user requested a source, resolve it from that validated current source
   inventory and pass only the exact opaque handle returned by the server in
   `sourceHandles`. Apply a schema-valid `limitPerSource`. Stop on an unknown or
   ambiguous display name.
6. Issue one provider-neutral service operation for the logical query. Treat
   server-returned per-source events and results as evidence from that single
   invocation. Never create per-source sub-agents or parallel provider calls.
7. Delegate CRM semantics to the focused skill and client result handling to
   `bos-federated-query`.

Use `my-crm-customer-journey` when the user asks where a lead or customer is in
the sales journey, how they reached the current state, what comes next, which
states lead to a desired goal, or for a journey graph.

## Use discovered operations

- Treat BOS discovery, the selected app MCP, and its machine-readable API
  contract as separate authority and routing layers. GPT owns app and service
  selection plus result composition. Lead Director owns CRM source resolution
  and execution.
- Treat operation discovery as schema information. Every API invocation
  revalidates the opaque context and current application, installation, role,
  plugin, capability, provider, operation, and audience scope.
- Use only an operation returned by the current app service contract. Absence
  is a service-resolution or contract-publication failure. It never triggers
  registration, capability creation, a database write, or a fallback to an
  underlying source integration.
- Treat source labels as display values and opaque source handles as selectors.
  Never infer a handle from a vendor name, URL, credential, record ID, or prior
  organization.

Read [tool workflows](references/tool-workflows.md) before a federated query or
mutation. Load [client policy](references/client-policy.json) for merged-view presentation,
freshness, confirmation, and recovery defaults.

Treat `explain <request>` as a plan-only request. Build the client portion from
the discovered app/service contract and package skills. Obtain source-selection
details only from a discovered server planning operation when one is
advertised; otherwise state that source resolution occurs at invocation. Return
the selected skills, app and service contract versions, semantic operation,
sanitized parameter shapes, cache decision, single-invocation boundary,
server-returned source plan when available, aggregation, mutation boundary, and
expected output. Execute no data query or mutation. `explain analyze` executes
the one planned service call and attaches observed evidence.

For a normal query, issue one bounded call. Append server-returned source
lifecycle and result events to the visible thought-log or activity surface as
they arrive. These events are observable execution evidence rather than private
reasoning. If streaming is unavailable, render the same events from the
completed response. Preserve `source_completed`, `source_failed`, and
`federation_completed` exactly as returned. Never synthesize source completion
or failure events that the service did not return.

Present source identity, cache/live status, local freshness, partial failures,
and scoped token usage in the final result. Missing source data remains an
explicit partial result.
