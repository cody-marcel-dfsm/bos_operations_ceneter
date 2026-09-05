---
name: bos-app-discovery
description: Route a request through authenticated BOS installed-app discovery, inspect selected per-app MCP contracts, invoke discovered deterministic HTTPS APIs, and compose source-attributed evidence. Use when app scope, service ownership, graph shape, or API operations must be discovered at runtime.
---

# BOS App Discovery

First execute the first-action tool lookup in `bos-mcp-client`. Resolve deferred
`bos_get_context` through the advertised callable inventory (including Codex
`functions.exec` / `ALL_TOOLS` when available) before resource listing or UI
diagnostics. A resource list alone cannot establish missing BOS tools.

GPT owns request routing, planning, service selection, API invocation, and
cross-app evidence composition. BOS MCP supplies authenticated organization and
the installed-app directory. Each selected app MCP supplies its own graph, plugins,
services, goals, and machine-readable API contracts.

Read [the discovery contract](references/discovery-contract.md) before the first
app-directory or per-app MCP query in a request.

## Current-host read execution

Use the current authenticated BOS capabilities for the requested operation.
After selecting the organization and role through `bos_get_context`, resolve a
live-discovered read operation whose descriptor covers the requested data.
Invoke its exact schema with the selected opaque context and continue from the
returned evidence. For an advertised app MCP or API, use its contract when the
host can execute it with the required authentication. Select the supported
operation from current evidence; do not impose a preferred future transport or
require a second connection for an already callable authorized BOS operation.

All supported operations belong to one current operating contract. Discover
names and arguments from the live catalog; never invent endpoints or selectors.
Directory or transport limitations remain scoped to that operation. An
access denial never permits switching routes to evade it. Missing or ambiguous
context, revoked grants, and explicit access denials stop the affected operation.
Every operation retains request-time server authorization.

For journey/detail requests, continue from the record read into graph, goal,
and path discovery through live-described read operations. A current-state-only
record result does not complete this sequence. Use `my-crm-customer-journey` to
resolve the explicit or application-owned goal and obtain the exact node path.
Only after supported discovery and relevant reads are exhausted or a specific
failure prevents them, render the labeled partial journey with verified state,
known goals, and requested details. Identify the failed or unavailable operation
and unattempted dependent reads. This is an incomplete path result, with no
invented transitions, reachability, actions, or completion.
This rule authorizes no mutations, browser fallback, token extraction, or
hardcoded endpoint. A missing per-app host facility alone must not suppress an
independent successful authorized read or its partial graph presentation.

## Execute BOS resource discovery

After `bos_get_context` selects the organization, perform resource discovery
through the existing authenticated BOS connection in the same request. Context
alone does not inspect the app directory. Do not gate BOS resource discovery on dynamic MCP attachment
or authenticated API invocation capabilities needed at later steps.

1. Use the host's MCP resource listing facility for the configured BOS server.
   In Codex, use `list_mcp_resources` with that server's configured name, then
   `read_mcp_resource` with the exact server and URI returned by the listing.
   These host facilities are separate from the BOS callable-tool catalog;
   an absent directory tool does not establish absent resource discovery.
2. Follow resource-list pagination when needed to locate the advertised
   discovery manifest or installed-app directory. Read that resource. If the
   manifest advertises `directoryUri`, follow the exact returned URI through
   a supported resource read; when the host requires a listed URI, locate it
   in the resource inventory first. Never construct a directory or app URI.
3. Use resource templates only when discovery requires them and the host
   exposes that facility. A `resources/templates/list` response of
   `Method not found` means that optional method is unsupported; continue
   with listed resources and supported reads. It does not invalidate a
   successful resource list or read.
4. Resolve the directory's advertised scope and version, retain only contacts
   for the selected organization, validate the selected contact, and continue
   the app discovery workflow immediately. Treat directory metadata as
   discovery evidence; it never authorizes cross-organization business reads.

When discovery is advertised as a tool, use its live descriptor and schema.
An empty tool search must still proceed to the available resource facilities.
Keep resource reads on the existing BOS connection; no new connection or login
is required to inspect its advertised resources.

## App discovery workflow

1. Use `bos-mcp-client` to authenticate and select exactly one organization
   through the explicit request, validated default organization, or sole
   authorized organization. Preserve only the opaque server-issued context.
2. Execute BOS resource discovery above, or the live advertised directory tool,
   and read the authenticated installed-app directory. Validate every returned
   app contact before using it. BOS identifies available apps; GPT shortlists
   apps from their returned descriptions and the user's intent.
3. Query each selected app MCP through the exact contact returned for this
   request. Discover its semantic equivalents of `app.describe`,
   `graph.describe`, `services.list`, `plugins.list`, `service.describe`, and
   `api.contract.get`. These are semantic capabilities; use the versioned names
   and schemas returned by the app rather than assuming literal tool names.
4. Select the minimum app-owned services needed for the request. Read the
   machine-readable contract for every unfamiliar operation and classify it as
   read, propose, or mutate before invocation.
5. Call the discovered deterministic HTTPS API through a host-native
   authenticated HTTP capability. Use the returned HTTPS origin or opaque base
   reference, operation identifier, audience requirement, and opaque context.
   Supply only schema-declared arguments. Keep bearer material in the host's
   credential boundary and out of prompts, generated headers, chat, files, and
   logs.
6. For cross-app requests, query app MCPs and APIs independently. Reconcile the
   results in GPT and preserve each fact's application, service, observation
   time, freshness, contract version, and correlation evidence. Label GPT
   inference separately.
7. Refresh BOS and app discovery after organization, installation, graph
   digest/version, role, plugin, authorization, context-expiry, or app-contract
   changes. Re-resolve the operation from the refreshed contract before retrying.

## Lead/contact details and journey-position requests

For any lead or contact detail request, including a single field or profile,
and for a customer's journey position or progress, use the installed
`my-crm-customer-journey` workflow after selecting
the owning app. Discover graph, journey, and read-only path evidence before
rendering. Lead with a native graph marking the current node and any requested
goal; keep record details below it. A single-record request still requires
the journey visual. Retain typed failures when graph evidence is unavailable.

## Validation and failure behavior

Accept an app contact only when it came from the current authenticated BOS
context and contains a display identity, HTTPS MCP resource, opaque context,
contract version, discovery epoch, capability families, and required scopes.
Reject cross-context reuse and any descriptor containing raw organization,
membership, role, installation, credential, or persistence identifiers.

Before an API call, validate HTTPS transport, operation availability, request
and response schemas, side-effect class, context and audience binding,
provenance guarantees, version, and typed failures. Discovery describes
capability and never grants execution authority; the app API revalidates current
canonical scope.

Return the most specific typed state available, including
`configuration_required`, `app_not_installed`, `app_discovery_stale`,
`app_contact_invalid`, `host_capability_unavailable`, `app_mcp_unavailable`,
`api_contract_invalid`, `context_mismatch`, `authorization_denied`,
`provider_recovery_required`, or `partial_result`. Preserve completed independent
reads when another app fails.

Diagnose failure at the step actually reached. Record the failed operation,
observed result, supported recovery attempted, and which later steps remain
unattempted. A successful context call alone or a missing domain tool name
cannot justify `host_capability_unavailable` for app discovery. A malformed
contact is `app_contact_invalid`; preserve a server-returned denial or error
instead of relabeling it as a host limitation.

After reading and validating the directory, query the returned app contact
through the host's available supported facility and continue contract discovery
and API reads. If the required facility is absent, establish that from the
current host capability inventory; if it exists, attempt the operation and
apply supported bounded recovery before diagnosing failure. Return
`host_capability_unavailable` only for that evidenced missing host operation,
identify the completed discovery steps, and preserve the pending request.
Never describe a later unattempted API as a failed server capability or demand
a server change from a host limitation. Use no browser,
web interface, DOM inspection, cached selector, or hardcoded app endpoint.
Apply Current-host read execution to authorized reads; a per-app
failure does not erase their independently verified evidence.

BOS web and mobile remain generic render shells for server-provided UI and
actions. Keep app selection, graph interpretation, endpoint selection, and
cross-app composition in GPT.
