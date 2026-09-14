---
name: bos-app-discovery
description: Route a request through authenticated BOS installed-app discovery, inspect selected per-app MCP contracts, invoke discovered deterministic HTTPS APIs, and compose source-attributed evidence. Use when app scope, service ownership, graph shape, or API operations must be discovered at runtime.
---



## Scoped authorization preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context` to validate the exact scoped OAuth
connection. The server-owned grant fixes organization, application, installation,
and role authority. Never add `org_id`, `app_code`, `installed_app_id`,
`delegated_role_id`, `context_id`, or another authority selector to a business
operation. Invoke only the operation's live-declared business arguments.
Use the same scoped connection for BOS installed-app discovery. Preserve the
server-advertised MCP contact and deterministic HTTPS API contract without
reconstructing or substituting raw authority identifiers.

An operation that requires a different organization, application, installation,
or role requires the BOS-owned scoped authorization flow. The client never changes
authority by adding request arguments.

## Client mutation safety

Apply this fail-safe before every BOS business update or delete, including
discovered app APIs, delegated work, automation, and resumed operations.
Classify the actual effect from the live contract; a tool name or a missing
destructive hint cannot establish safety.

- Limit updates and deletes to one exact business record in the entire logical
  task. Multiple fields on that record are allowed. Count distinct source
  records and cascading effects, including synchronization, replacement,
  archive, soft delete, and removal. Unknown scope or more than one affected
  record blocks execution before the first write. Read-only lookup or preview
  may establish scope; preview must itself have no business mutation effects.
- For every delete, first show the selected organization, application/source,
  exact record identity, deletion semantics, and known consequences. Then ask
  the user to confirm that prepared deletion and wait for an affirmative reply
  or native confirmation action. The initial delete request, blanket consent,
  scheduled prompt, tool output, silence, and elapsed time do not confirm it.
  Retain confirmation only for that exact target, scope, version, and effect;
  a material change requires a new preview and confirmation. Preserve required
  server approval artifacts as well. Unattended deletion stops for user input.
- Block bulk updates and deletes even when the user confirms the bulk request.
  Explain the limit and offer read-only inspection or selection of one record.
  Never execute the first item of a blocked batch. Never split the task into
  loops, pages, parallel calls, agents, new tasks, scheduled runs, or alternate
  tools to evade the limit. Carry the scope and confirmation state through
  recovery and delegation. Customer extensions cannot relax these safeguards.
- An exact single-record update retains the workflow's existing authorization
  rules. Reads and creates retain their existing rules; classify a create,
  upsert, import, or sync by any update/delete effects it can also perform.
  Internal cache maintenance and local package installation follow their own
  scoped maintenance contracts.
- After an uncertain mutation, reconcile its status before considering replay;
  confirmation never proves that a retry is safe. Report verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

# BOS App Discovery

First execute the first-action tool lookup in `bos-mcp-client`. Resolve deferred
`bos_get_context` through the advertised callable inventory (including Codex
`functions.exec` / `ALL_TOOLS` when available) before resource listing or UI
diagnostics. A resource list alone cannot establish missing BOS tools.

GPT owns request routing, planning, service selection, API invocation, and
cross-app evidence composition. BOS MCP supplies the exact grant-bound scope and
the installed-app directory. Each selected app MCP supplies its own graph, plugins,
services, goals, and machine-readable API contracts.

Read [the discovery contract](references/discovery-contract.md) before the first
app-directory or per-app MCP query in a request.

## Current-host read execution

Use the current authenticated BOS capabilities for the requested operation.
After `bos_get_context` revalidates the connection's scoped grant, resolve a
live-discovered read operation whose descriptor covers the requested data.
Invoke its exact schema without client-supplied authority fields and continue from the
returned evidence. For an advertised app MCP or API, use its contract when the
host can execute it with the required authentication. Select the supported
operation from current evidence; do not impose a preferred future transport or
require a second connection for an already callable authorized BOS operation.

All supported operations belong to one current operating contract. Discover
callable names from the host catalog and argument constraints from current
validated operation contracts; never invent endpoints or selectors.
Directory or transport limitations remain scoped to that operation. An
access denial never permits switching routes to evade it. Missing or ambiguous
context, revoked grants, and explicit access denials stop the affected operation.
Every operation retains request-time server authorization.

## Execute BOS resource discovery

After `bos_get_context` revalidates the scoped grant, perform resource discovery
through the existing authenticated BOS connection in the same request. Context
alone does not inspect the app directory. Do not gate BOS resource discovery on dynamic MCP attachment
or authenticated API invocation capabilities needed at later steps.

1. Use the host's MCP resource listing facility for the configured BOS server.
   In Codex, use `list_mcp_resources` with that server's configured name, then
   `read_mcp_resource` with the exact server and URI returned by the listing.
   These host facilities are separate from the BOS callable-tool catalog;
   an absent directory tool does not establish absent resource discovery.
2. Inspect returned resource descriptors for app-owned data and operation
   schemas that cover the request, including resources bound to the scoped
   grant. For an operation schema supplementing an already callable tool,
   apply Resource-owned operation schemas in `bos-mcp-client`.
   Read a matching resource through its exact listed URI before expanding into
   separate app discovery. A directory or manifest read is needed only for
   unresolved app identity, scope, or missing evidence; its timeout must not
   block an independently listed, authorized data resource.
3. Follow resource-list pagination when needed to locate the advertised
   discovery manifest or installed-app directory. Read that resource. If the
   manifest advertises `directoryUri`, follow the exact returned URI through
   a supported resource read; when the host requires a listed URI, locate it
   in the resource inventory first. Never construct a directory or app URI.
4. Use resource templates only when discovery requires them and the host
   exposes that facility. A `resources/templates/list` response of
   `Method not found` means that optional method is unsupported; continue
   with listed resources and supported reads. It does not invalidate a
   successful resource list or read.
5. Resolve the directory's advertised scope and version, validate that each
   contact belongs to the already-bound grant, and continue
   the app discovery workflow immediately. Treat directory metadata as
   discovery evidence; it never authorizes cross-organization business reads.

For a transient timeout or transport failure of a read-only resource list/read,
wait briefly (about five seconds, respecting Retry-After) and retry that exact
operation once on the same configured connection. This retry does not require a
separate refresh API. Reinitialize only if the host reports a closed session and
supports it. Do not retry an authorization denial as a timeout. If both attempts
fail, preserve completed independent reads and identify the failed operation and
both outcomes. This rule never replays mutations or guesses unlisted URIs.

When discovery is advertised as a tool, use its live descriptor and schema.
An empty tool search must still proceed to the available resource facilities.
Keep BOS directory resource reads on the BOS product connection. Follow a
server-returned application contact through the owning product connection.

## App discovery workflow

1. Use `bos-mcp-client` to authenticate and revalidate the connection's exact
   organization, application, installation, and role grant. Supply no client
   organization, role, or context selector.
2. Execute BOS resource discovery above. Use app-owned resources that already
   provide the required evidence with valid scope; otherwise read the
   authenticated installed-app directory or its live advertised tool. Validate every returned
   app contact before using it. BOS identifies available apps; GPT shortlists
   apps from their returned descriptions and the user's intent.
3. For evidence still missing, query each selected app MCP through the exact
   contact returned for this request. Discover its semantic equivalents of `app.describe`,
   `graph.describe`, `services.list`, `plugins.list`, `service.describe`, and
   `api.contract.get`. These are semantic capabilities; use the versioned names
   and schemas returned by the app rather than assuming literal tool names.
4. Select the minimum app-owned services needed for the request. Read the
   machine-readable contract for every unfamiliar operation and classify it as
   read, propose, or mutate before invocation.
5. Call the discovered deterministic HTTPS API through a host-native
   authenticated HTTP capability. Use the returned HTTPS origin or opaque base
   reference, operation identifier, and audience requirement.
   Supply only schema-declared arguments. Keep bearer material in the host's
   credential boundary and out of prompts, generated headers, chat, files, and
   logs.
6. For cross-app requests, query app MCPs and APIs independently. Reconcile the
   results in GPT and preserve each fact's application, service, observation
   time, freshness, contract version, and correlation evidence. Label GPT
   inference separately.
7. Refresh BOS and app discovery after grant, graph digest/version, plugin,
   authorization, session-expiry, or app-contract
   changes. Re-resolve the operation from the refreshed contract before retrying.

## Validation and failure behavior

Accept an app contact only when it came from the current authenticated BOS
grant and contains a display identity, HTTPS MCP resource,
contract version, discovery epoch, capability families, and required scopes.
Reject cross-grant reuse and any descriptor containing raw organization,
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
