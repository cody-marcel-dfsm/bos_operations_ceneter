---
name: bos-mcp-client
description: Operate the shared BOS MCP connection, including server-evaluated subservice scope, live tool discovery, transport recovery, and provider authorization recovery.
---

# BOS MCP Client

Use this skill for every client-side BOS operation. The root BOS plugin owns one
remote MCP resource and one host-managed OAuth connection for the user-facing
client context. A Claude account or organization Web connector declares that
resource and exposes the persistent host-managed **Connect** action;
ChatGPT/Codex loads the root package's `.mcp.json` and performs OAuth discovery
from that resource. Other supported clients use the single BOS adapter
declared by their generated package.

Education Center, CRM, Marketing Director, and other subservice plugins add
skills and server capabilities without adding another BOS connection. Their
skills call through the existing BOS connection. BOS derives and evaluates
organization, application, installation, subservice, plugin, role, capability,
provider, and tool scope from the validated grant and canonical server state on
every private operation. Never route platform BOS work through a subservice
package.

## Target per-app discovery migration

When the BOS MCP advertises an authenticated installed-app directory and
per-app MCP contacts, invoke `bos-app-discovery` for domain requests. BOS remains
the identity and app-discovery root. GPT selects the app, queries its returned
MCP contact, reads its graph and service contracts, invokes the discovered
deterministic HTTPS API, and composes the answer.

Treat the current BOS domain-tool surface as migration compatibility state.
Never use a compatibility alias as the target implementation when the selected
app contact and required host capabilities are available. Keep app endpoints,
graph identities, service names, and API operation names out of static client
configuration and resolve them from current authenticated discovery.

Developer and operator work is outside this skill when the request explicitly
targets BOS source code, deployment infrastructure, Cloud Run, GCP Secret
Manager, an approved administrative provisioning path, or another
developer-controlled service surface. From BOS Operations Center, never enter
or mutate the owning server repository: do not create a sibling worktree, edit
backend code, commit or push a server branch, create or merge its pull request,
or deploy its infrastructure. Return a paste-ready prompt for a server-side
agent that states the sanitized evidence, required protocol invariant,
deployment scope, and post-deployment verification. For changes affecting the
BOS MCP authentication or discovery contract, the handoff makes the
client-owned Operations Center acceptance suite mandatory: `npm run
contract:check`, `npm run contract:oauth-discovery-live -- --resource-url
"$BOS_MCP_RESOURCE_URL" --format json`, `npm run
contract:oauth-tool-auth-live -- --resource-url "$BOS_MCP_RESOURCE_URL" --tool
bos_get_context --format json`, and `npm run contract:oauth-live --
--authorize-url "$BOS_OAUTH_AUTHORIZE_URL" --format json`. The server-side
agent performs the work through the owning repository workflow and the
developer's existing infrastructure identity. A credential being created for a
BOS MCP client does not make its server-side provisioning a client runtime
operation. Return exactly one continuous Markdown prompt as the entire server
handoff response. Keep the protocol contract, client-owned commands, and
acceptance criteria in that single copyable prompt.

## Server handoff scope

Write the prompt around the user's requested server outcome. Treat attached
client specifications and prior conversations as evidence; extract the relevant
server requirements instead of forwarding their instructions wholesale.
Include only the affected server behavior, API or data contract, necessary graph
wiring, existing-data migration, deployment scope, and observable acceptance
criteria that the request requires. Retain client evidence only when it explains
a server defect or a required response the server must provide.

Omit unrelated client installation, package layout, UI rendering, local cache,
and agent recovery procedures. Preserve existing authentication, authorization,
and provider recovery behavior unless the user requests a change or observed
evidence establishes a necessary dependency; identify that dependency explicitly.
A graph or profile-data change alone does not imply an authentication change.

Choose validation for the touched server surface. Include the OAuth acceptance
suite above only when its stated condition applies, and label those commands as
running from BOS Operations Center against the deployed candidate. Keep client
execution with its owner; request the server endpoint and deployment evidence
needed for that verification. For other server work, use the owning repository's
focused tests and relevant post-deployment checks. Before returning the prompt,
remove each detail that does not help the server agent implement or verify the
requested outcome.

## Connection ownership

The agent owns the BOS MCP client lifecycle for the duration of the user's
request.

Read [references/runtime-continuation-contract.md](references/runtime-continuation-contract.md)
before recovering authorization, refreshing a tool manifest, or continuing a
stateful mutation workflow.

- Discover and use the root BOS plugin's configured MCP connection.
- If BOS is absent from the callable tool manifest, inspect the active client's
  BOS plugin and runtime binding immediately. Repair or reinstall BOS and
  restore its declared authorization connection. For Codex, verify the root
  BOS plugin declares `mcpServers: "./.mcp.json"`, the MCP file contains exactly
  one remote HTTP `platform` entry at the product-owned BOS resource, and no
  `.app.json` exists. For Claude,
  verify the BOS package's
  account-connector metadata and the matching Web connector under
  **Customize → Connectors**, then use its persistent **Connect** action. When a
  private installation lacks that connector, add it with the exact name and URL
  from the generated BOS `CONNECTORS.md`; never reconstruct or modify the
  package-owned resource. Preserve installed subservice plugins while repairing
  only the BOS connection. Never create an Education Center, CRM, Marketing
  Director, or other subservice connection as recovery.
  Never discover, prompt for, repair,
  or materialize a URL from `installed_app_id` or customer settings.
  Do not stop at diagnosing client registration.
- If the transport, stream, or MCP session closes, reconnect or reinitialize
  that same configured connection, rediscover its live tools, call
  `bos_get_context` again, and retry the interrupted read-only operation once.
- If the BOS OAuth token endpoint returns `invalid_client`, classify it as a
  stale host-owned public-client registration and return to **Register BOS**.
  Preserve the sanitized continuation envelope, keep the same sealed BOS
  resource, have the host discard the stale client registration, repeat dynamic
  client registration from the resource's current authorization metadata, and
  restart authorization once. After authorization succeeds, rediscover live
  tools, call `bos_get_context`, and resume the interrupted request. Use the
  host's supported connection reset or **Connect/Sign in** surface when it does
  not expose programmatic registration replacement. Keep the root BOS endpoint
  and installed subservice plugins unchanged throughout recovery.
- If Codex reports `reauthenticationRequired`, `requires OAuth
  reauthentication`, or an equivalent MCP-startup authentication failure,
  classify it as **Sign in** and preserve the active request. Use the requested
  BOS capability to select the matching tool descriptor. Each authenticated BOS
  tool declares `securitySchemes: [{ type: "oauth2", scopes: [...] }]` before
  consent so the host knows that the selected capability requires BOS OAuth.
  Descriptor visibility and selection expose no customer data and authorize no
  business execution. Invoke the selected tool once; when the signed-out result
  contains `isError: true` and `_meta["mcp/www_authenticate"]`, the host renders
  the native **Connect**, **Sign in**, or **Authenticate** action in the active
  chat. That challenge must include `resource_metadata`, `error`, and
  `error_description`. After consent, refresh live discovery of dynamic
  domain-specific MCP services and tooling, call `bos_get_context`, and resume
  the original request. Tool presence identifies a currently exposed operation
  and its schema; it never proves that the
  selected context or provider is authorized for that operation.
  When the OAuth tool descriptor is absent or its signed-out invocation omits
  the challenge, report a tool-auth-contract defect and keep the request
  pending. When the descriptor and challenge exist but the host omits the
  native action, report a client authentication-activation defect. Do not
  invoke a CLI login or
  launch browser authentication on the user's behalf. Do not ask the user to
  reconnect BOS or resubmit the request. Do not use generic app-permission tools,
  unrelated app-dependency tools, the plugin console's business-data workflow,
  an anonymous bootstrap business tool, or a subservice connection to repair
  MCP OAuth. Never use `request_plugin_install`, a plugin recommendation, or an
  external install page as MCP OAuth recovery. After the
  user selects the native action and login
  succeeds, refresh the MCP session and callable tool manifest, call
  `bos_get_context`, verify one
  bounded authenticated read, and resume the original request automatically.
- If the token endpoint returns `invalid_grant`, including `Refresh token
  replay detected`, classify the existing BOS grant as unusable and remain at
  **Sign in**. Preserve the active request, stop the refresh retry loop, and use
  the same native root BOS authentication action for fresh consent. Never
  classify this as missing skills, generic app permissions, or a new
  subservice connection. After consent, refresh tools and context, run the
  bounded authenticated read, and resume the preserved request.
- Refresh the callable tool manifest after OAuth reconnection, plugin/package or
  server-schema updates, an explicit server refresh, transport/session replacement, or a
  permission, role, plugin-enablement, capability, provider, installation, or
  domain-service change. BOS provides dynamic domain-specific MCP services and
  tooling for the authenticated scope. Refresh live tool discovery after
  those changes, discard stale schemas, and validate the next call only against
  the refreshed manifest.
- Preserve the user's original request across recovery and continue it
  automatically. Never ask the user to reconnect BOS, resend the request, or
  start a new task.
- Preserve the sanitized continuation envelope across every refresh, including
  pending draft identities, approval state, operation identities, and
  idempotency keys. Never place tokens, credentials, raw authority IDs, raw
  provider payloads, or customer records in that envelope.
- For a mutation whose completion is unknown after a disconnect, reconcile by
  its operation or idempotency identifier before deciding whether to resume.
  Never replay an uncertain mutation blindly.
- Ask for user action only when the host presents BOS Connect/Sign in or a
  secure provider sign-in or credential-entry surface that inherently requires
  the user's direct interaction. Never ask the user to paste a BOS key.
- When the host requires a fresh session to load repaired tools, create or
  continue a same-task session through the client's task controls when
  available, carry the continuation envelope into it, rediscover tools, verify
  context, and resume automatically. State the host boundary only when the
  client offers no programmatic continuation mechanism.
- If bounded recovery fails, report the attempted recovery, sanitized error
  category, completed partial work, and the precise client or service repair
  required. Keep the current request active whenever the client supports
  recovery within the same task.

## Runtime workflow

Apply provider recovery as one request interceptor around every BOS domain
`tools/call`. Domain skills describe the operation; they never own, opt into,
or bypass authentication recovery. Preserve the pending call before execution
and inspect its sanitized result before producing a final answer.

1. Use the immutable BOS connection recorded by the root package and declared
   by the client's native host adapter. Treat the resource as sealed package
   configuration, never as tenant authority or a user-selectable setting.
2. Do not send `org_id`, `app_code`, `installed_app_id`,
   `delegated_role_id`, or a client-selected subservice authority. BOS derives
   execution scope from the authenticated principal, installed services,
   plugin enablement, role, capability, provider readiness, and requested tool.
   Call `bos_get_context`, select exactly one authorized organization using the
   organization-aware workflow below, then use that organization's
   server-marked default role context and pass only its opaque `context_id` to
   domain tools. An explicit organization or role in the user's request applies
   to that request and does not rewrite the saved defaults.
3. Fail closed when context is absent or ambiguous.
4. Use the triggered subservice skill to choose the requested workflow and
   semantic operation from the current live-discovered dynamic domain service
   and tool surface. Keep connection selection
   fixed on BOS. Treat the descriptor only as an operation/schema declaration;
   call the operation with the selected opaque context and let BOS authorize
   the organization, installation, role, plugin, capability, tool, and provider
   at `tools/call` time.
5. Authenticate the BOS Claude account-level Web connector through its
   persistent **Connect** control, and the ChatGPT/Codex BOS connection
    through the root package-owned MCP binding. Both use one host-managed
   OAuth grant. Other clients use only the generated product
   adapter declared for BOS. Keep access tokens, refresh tokens,
   authorization codes, bearer values, and grant metadata out of chat, tool
   arguments, package files, and logs. Never create or fall back to a
   subservice-specific BOS authorization. If BOS rejects a desktop OAuth grant after
   reconnecting once, invoke the host's Connect/Sign in flow and resume once
   after it succeeds.
6. When a domain call returns `authorization_required`, preserve its original
   operation ID and activate the returned secure authorization path immediately
   in the active request. Use the host's native URL-mode elicitation when it is
   available; otherwise present the returned resource link as the next action.
   The host obtains the customer's consent before opening the browser.
   - OAuth: open the returned provider URL, let the customer sign in directly
     with the provider, and poll `bos_get_authorization_status` with the exact
     recovery token.
   - API key: open the returned short-lived BOS HTTPS credential-collection
     URL. For Calimatic, this BOS page asks for the Calimatic portal URL and API
     key. The customer submits them directly to BOS; the model and MCP client
     never receive either value. Poll the sanitized transaction status. The
     expected API-key recovery surface is a provider credential collector. A
     successful `bos_get_context` or authenticated provider-connection call
     proves that the BOS grant is already valid for this request. If the
     recovery page renders, redirects to, or offers root BOS **Sign in**, never
     click root BOS **Sign in**, launch BOS authentication, or treat a separate
     BOS web cookie as required. Poll `bos_get_authorization_status` once with the
     existing recovery token to allow a delayed transaction advance. If the
     provider form still does not appear, preserve the original operation and
     recovery transaction, classify
     `provider_recovery_identity_boundary`, and report the server-owned
     recovery defect with sanitized evidence.
7. Poll and verify recovered authorization, then call `bos_resume_operation`
   once without asking the user to resubmit the request. Stop
   if authorization or that single retry fails.

For an explicit request to connect or authenticate a provider, call
`bos_get_context` and invoke the exact server-returned recovery `next_action`
for that provider. Do not substitute setup instructions, a dashboard route, or
a request for the user to report completion. The same interceptor owns Gmail
OAuth, Calimatic API-key collection, and every future provider authorization
kind returned by BOS.

Provider readiness and authorization are local to the server-resolved
organization, installation, and plugin. A missing provider credential blocks
only the affected provider operation and may change only that domain service's
dynamic tool surface. It never creates another BOS login or changes the BOS
connection state.
A provider recovery browser page cannot override the authenticated MCP result
or regress the client to root BOS sign-in.

Domain skills interpret their workflows and execute through the configured BOS
MCP. BOS derives actor, tenant, organization, application, installation,
subservice, role, plugin, capability, and provider scope from the validated
OAuth grant, requested tool, and canonical server records.

## Organization-aware execution

`bos_get_context` may return several organizations and may mark one default
role inside each organization. Treat the result as selection metadata. Never
render the complete context inventory or query domain data across every
organization unless the user explicitly asks for that cross-organization
scope.

Use the packaged `scripts/client-preferences.mjs` helper for the shared,
OS-user BOS setting `default_organization_label`. The helper stores only the
display label, validates it against organization labels in the current
authenticated context, and never stores an organization ID, context ID, token,
credential, role, capability, or grant metadata. Pass JSON through standard
input so customer labels do not appear in command arguments.

For each request:

1. Call `bos_get_context` once and deduplicate its `organization_label` values.
2. When the user explicitly names an organization, match that label to exactly
   one returned organization and use it for the current request. This explicit
   selection takes precedence over the saved default.
3. Otherwise call the helper's `read` operation with the current returned
   organization labels. When it returns `current`, use its canonical
   `default_organization_label`.
4. When no setting exists and exactly one organization is available, use that
   organization. When several are available without a current default, return
   `configuration_required` and ask for one default organization. Do not issue
   a domain data call until one organization is selected.
5. Treat a stale or unmatched saved label as `configuration_required`. Never
   substitute another organization or fan out to make the operation succeed.
6. Within the selected organization and installed app, choose the unique entry
   marked `is_default: true`, unless the user explicitly requested another
   available role. Preserve that one context for related calls in the request.
7. Execute against multiple organizations only when the user explicitly asks
   for a cross-organization result. Bound the requested organization set,
   select one opaque context per organization, preserve organization-level
   provenance, and report partial failures separately.

An unambiguous request such as “default to Primary Center” authorizes changing
this client preference. Refresh `bos_get_context`, then invoke
`set-default-organization` with the requested label and all current returned
organization labels on standard input. Report success only after the helper
returns `state: committed`. The preference is a selector among currently
authorized server contexts; it never grants membership or authority.

## Role-aware execution

Treat role names and capabilities returned by BOS as descriptions of
server-owned authority. Client prompts and arguments never create authority.

1. Call `bos_get_context` before the first domain operation and after an
   authorization, membership, or role-capability change.
2. First select one organization through the organization-aware workflow.
   Group that organization's role entries by installed app and use the unique
   entry marked `is_default: true` unless the user explicitly requests another
   available role.
3. Select a role using only its opaque `context_id`. Never send a role name or
   delegated-role value as authority.
4. Confirm the requested operation exists in current live tool discovery and that
   its arguments match the current schema. Do not infer authorization from
   catalog presence or absence. Invoke it with the selected opaque context and
   treat the server result as authoritative for role, capability, plugin, tool,
   and provider access.
5. Preserve the selected context for related calls in the request. An explicit
   lower-role request changes the context for that request only.

The server re-resolves membership and capabilities on every `tools/call`.
Refresh context once after a denial or missing context, then retry only when the
    fresh context makes the original call valid. Treat the repeated server result
    as authoritative; live `tools/list` discovers the current domain-specific
    service surface and never substitutes for request-time authorization.

For role administration, call `bos_list_role_capabilities` only when the
selected role carries `bos.roles.read`; it returns role intent, authority rank,
capabilities, editability, and revision. Call `bos_update_role_capabilities`
only when the user explicitly requests a change, using the exact context,
target role, complete replacement capability list, and revision from that read.
The selected role must also carry `bos.roles.update`. Treat success as a
server-audited mutation recording the authenticated actor, acting role, target
role, and before/after capabilities; never claim success when the server does
not return the completed update. After success, refresh `bos_get_context`. On a
revision conflict, read the current configuration and have the user resolve any
material difference before retrying.

## Plugin settings cache

Use the packaged `scripts/plugin-settings-cache.mjs` helper for confirmed,
display-safe plugin configuration snapshots and plugin-settings initialization
receipts. Read
[references/plugin-settings-cache-protocol.md](references/plugin-settings-cache-protocol.md)
before a settings read, commit, invalidation, or receipt operation.

Validate live BOS context first and use only the server-returned opaque
`cache_scope`, current `settings_epoch`, and canonical snapshot. Commit from a
completed BOS read, completed apply response, or reconciled committed result.
Never commit recommendations, drafts, secrets, raw authority identifiers, or
unknown mutation outcomes. A required unset or invalid partial field resumes
the packaged plugin-settings initializer; domain skills never create a separate
discovery path.

## Shared local document cache

Use the packaged `scripts/document-cache.mjs` helper for every reusable
document or document-like read, including files, messages, full threads,
events, enrollments, leads, and provider evidence. The helper resolves one
OS-user cache root shared by all BOS-family products and clients. Keep its
authority indexes separate while allowing identical immutable document
versions to share the content-addressed object store. Read
[references/document-cache-protocol.md](references/document-cache-protocol.md)
before invoking the helper.

After `bos_get_context` validates the live request authority, include its
server-derived organization, installation, delegated role, application, and
this product's skill-group name in the cache authority. Include the exact
authenticated account identity for a separately connected read-only source.
Use digested cache keys in diagnostics.

For each logical source query:

1. Choose a stable source, resource kind, account, and selector. Keep the time
   window outside the selector so overlapping date windows share coverage.
2. Capture one fixed refresh upper bound and call the helper's `begin` operation
   through JSON on standard input. Pass document bodies through standard input
   only; keep them out of command arguments, temporary repository files, and
   diagnostics.
3. When the plan is `current`, generate from the cache without a source content
   query. When a configured maximum age produces `refresh_required`, perform a
   conditional or incremental refresh and exclude the stale source after a
   failed refresh under the default policy. When the plan returns gaps, request exactly those intervals plus
   changes after its cursor through the fixed upper bound. Use provider cursors,
   `modified_after`, conditional versions or ETags, or a bounded versioned
   snapshot. For a cold plan, one bounded snapshot initializes both coverage
   and the change watermark. Call `read` after `begin` when the provider needs
   cached resource versions for conditional requests. Follow every page and
   preserve deletion tombstones.
4. When the plan is `busy`, wait for the bounded lease, then call `begin` again
   and use the completed shared result. This makes concurrent identical work
   single-flight across plugins and client processes.
5. Call `commit` once with the complete normalized change set, tombstones, next
   cursor, and coverage. The helper atomically updates objects, coverage,
   watermark, and `sync_completed_at`. Call `abort` after a failed or partial
   retrieval so the previous committed watermark remains authoritative.
6. Call `read` and generate the requested outcome from the covered cache state.

Use `inspect` for cache health metadata without document bodies and
`invalidate` for one exact authority/source/query identity. Report origin,
`sync_completed_at`, local update time, human-readable age, and configured
maximum age with every freshness-governed result.

Treat query coverage as `[from, through)` and change catch-up as
`(after, through]`. Normalize only the minimum-necessary reusable fields into
cached payloads. Exclude raw message bodies, attachment bytes, unrelated notes,
credentials, and secrets unless the user's request explicitly requires that
source artifact and its provider policy permits local caching.

For a named file or thread, use its stable provider resource identity and cached
version for conditional validation. Fetch the body only when the provider
reports a new version. The initial request treats the full bounded interval or
current named resource as its gap. Snapshot-only sources refresh the complete
bounded snapshot only after conditional source-version validation reports a
change. Record that limitation until their tools expose an incremental cursor
or per-resource conditional read.

The cache supplies read evidence. Execute mutations through the canonical BOS
or provider path, then let a subsequent incremental catch-up reconcile the
local read state. Apply the full cache contract in
`Vault/specs/shared-local-document-cache.md` when working in this repository.
