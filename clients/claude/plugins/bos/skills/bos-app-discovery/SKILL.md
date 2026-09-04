---
name: bos-app-discovery
description: Route a request through authenticated BOS installed-app discovery, inspect selected per-app MCP contracts, invoke discovered deterministic HTTPS APIs, and compose source-attributed evidence. Use when app scope, service ownership, graph shape, or API operations must be discovered at runtime.
---


## Organization scope preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context`. Select exactly one authorized
organization in this order: an organization explicitly named in the current request;
the shared `default_organization_label` after exact normalized validation against
the returned organization labels; or the sole authorized organization. Read and
validate the saved label with
`../bos-mcp-client/scripts/client-preferences.mjs`. For tools whose live schema
requires a context selector, pass only the selected role's opaque `context_id`.
Never add organization or context arguments to an operation whose schema derives
scope from the authenticated server context.
Use this same selection for BOS installed-app discovery. Pass only the opaque app
context and API authority returned under that selection to a discovered app MCP
or deterministic HTTPS API; never reconstruct or substitute raw authority IDs.

When several organizations are available and the default is missing, stale, or
ambiguous, return `configuration_required` and resolve one default before domain
execution. An organization named for the current request overrides the selection
and does not rewrite the saved default. Never fan out across organizations unless
the user explicitly requests that bounded scope. The display-label preference selects among
current server-returned contexts and never grants authority.

# BOS App Discovery

GPT owns request routing, planning, service selection, API invocation, and
cross-app evidence composition. BOS MCP supplies authenticated organization and
the installed-app directory. Each selected app MCP supplies its own graph, plugins,
services, goals, and machine-readable API contracts.

Read [the discovery contract](references/discovery-contract.md) before the first
app-directory or per-app MCP query in a request.

## App discovery workflow

1. Use `bos-mcp-client` to authenticate and select exactly one organization
   through the explicit request, validated default organization, or sole
   authorized organization. Preserve only the opaque server-issued context.
2. Query the BOS MCP operation whose current descriptor advertises authenticated
   installed-app-directory semantics. Validate every returned app contact before
   using it. BOS identifies available apps; GPT shortlists apps from their
   returned descriptions and the user's intent.
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

When the host cannot attach or query the returned app MCP, or cannot make the
contract-bound authenticated HTTPS call, return `host_capability_unavailable`
with the missing capability and preserve the pending request. Use no browser,
web interface, DOM inspection, cached selector, hardcoded app endpoint, BOS-side
domain route, or central gateway alias as a substitute for this target workflow.

BOS web and mobile remain generic render shells for server-provided UI and
actions. Keep app selection, graph interpretation, endpoint selection, and
cross-app composition in GPT.
