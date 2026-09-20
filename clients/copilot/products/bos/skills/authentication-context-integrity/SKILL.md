---
name: authentication-context-integrity
description: Preserve BOS authentication and execution context across login, app selection, organization selection, role selection, installed-app resolution, MCP calls, plugin configuration, provider authorization, sessions, and background work. Use for application-neutral auth, selector, OAuth, credential, tenant-scope design and review, and automatic authentication handoffs from dependent plugins.
---




## Scoped authorization preflight

First apply the versioned identity-context workflow in `bos-mcp-client`.
For live `bos-identity-mcp/v2`, resolve explicit request scope or the saved
customer default against fresh authorized contexts, discover tools for the
selected handle, and execute with that same handle. This branch governs
context selection throughout this skill, including older scoped-grant wording.
A missing operation never permits changing organization or role to find it.
The following single-context rules apply only to legacy scoped-grant discovery.

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

- Limit updates and deletes to one exact conceptual business record in the
  entire logical task. Multiple fields on that record are allowed. That record
  may resolve to one through five explicit source-record targets in one
  discovered service request. Count distinct conceptual records and cascading
  effects, including synchronization, replacement, archive, soft delete, and
  removal. Unknown scope, more than five source targets, or more than one
  conceptual record blocks execution before the first write. Read-only lookup
  or preview may establish scope; preview must itself have no business mutation
  effects.
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
- An exact one-conceptual-record update retains the workflow's existing
  authorization rules. Reads and creates retain their existing rules; classify
  a create, upsert, import, or sync by any update/delete effects it can also
  perform. Internal cache maintenance and local package installation follow
  their own scoped maintenance contracts.
- After an uncertain mutation, invoke only the exact service-returned bodyless
  state action and service-declared timing. Never replay the mutation or
  construct a status route, selector, retry schedule, or reconciliation
  request. Confirmation never proves that another mutation is safe. Report
  verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

For live `bos-identity-mcp/v2`, first apply [identity-context compatibility](../bos-mcp-client/references/identity-context.md).
Its fresh authorized-context selection and saved-default rules govern this
workflow; single-context grant wording below applies to legacy discovery.
# BOS Authentication Context Integrity

## Canonical context

Treat authenticated actor, tenant, organization, application, installation,
actor role, plugin, plugin execution role, provider credential, and customer
configuration as distinct validated dimensions.

## Workflow

1. Inspect the current entry, session, selector, and credential path.
2. Separate observed behavior from the intended platform contract.
3. Trace every context field from authenticated input to side effect.
4. Resolve installed-app and plugin scope from canonical records.
5. Derive plugin execution role from installed-app plugin metadata.
6. Resolve credentials by organization, installation, plugin, and credential
   name.
7. Fail closed when canonical scope or grant provenance is incomplete.
8. Add negative tests for actor-supplied authority, cross-tenant access,
   fallback credentials, and ambiguous context.

## Invariants

- User role authorizes the actor; plugin `run_as_role` governs execution.
- The scoped OAuth grant fixes organization, application, installation, and
  role authority; business request values never select authority.
- Customer configuration supplies context and never supplies authority.
- Provider credentials remain scoped to their installed app and plugin.
- Reconnect or reauthorization replaces the scoped grant and preserves
  application configuration.
- BOS owns the host-managed platform connection and native authentication.
  Dependent products declare BOS as a dependency and supply application skills.
  Every discovery and execution request revalidates the exact grant-bound
  organization, application, installation, role, capability, and provider scope.
  Platform transport ownership grants no cross-application authority.
- Use live-discovered operations and exact schemas on the BOS connection.
  The client supplies no organization, installation, application, role, or
  context selector. A different authority context requires BOS-owned server
  authorization; existing grants remain unchanged.
- Background jobs carry the same validated scope as interactive operations.
- The agent owns MCP transport and session recovery. On a closed stream or
  session, it reconnects the configured endpoint, rediscovers tools,
  and revalidates context. It then follows only an exact host- or
  service-returned continuation action and its declared timing. When none is
  available, it preserves the interrupted request and reports the exact failed
  operation without resubmitting it. It never delegates reconnection to the
  user.
- Expose BOS as a remote HTTPS Streamable HTTP MCP server. Claude account or
  organization Web connectors, OAuth-capable GitHub Copilot, and Gemini declare
  the immutable resource URL. Claude marketplace plugins contain skills and
  account-connector metadata with no `.mcp.json` or `mcpServers`; this preserves
  the persistent account-level **Connect** control. ChatGPT/Codex packages
  declare the BOS platform resource in `.mcp.json` and contain no
  `.app.json`. Every runtime host
  uses its OAuth 2.1 MCP
  authorization flow. The host discovers BOS
  authorization metadata, launches consent, stores and refreshes the grant,
  and attaches the resulting resource-scoped access token. The package never
  asks for or stores a BOS API key. Dependent product packages declare their
  BOS requirement without another MCP authentication binding. Every
  secured call fails closed when authorization is
  absent, invalid, expired, revoked, or scoped to another resource.
- Register the BOS package's immutable platform MCP endpoint and verify the
  server-returned context. Never discover, prompt for, repair, or materialize
  the route from an `installed_app_id`, customer setting, or subservice
  package. For Claude, declare the BOS resource
  in an account or organization Web connector and complete authorization from
  **Customize → Connectors**. For ChatGPT/Codex, package exactly one `.mcp.json`
  declaration for the product resource and no `.app.json`.
  For every client, never add `bearer_token_env_var`, literal authorization
  headers, or a plugin key field. The server derives actor, tenant, organization, installation,
  role, plugin, and capability scope from the validated OAuth grant; client
  prompts and tool arguments never supply those authority dimensions.
- Before consent, the protected MCP resource returns only its HTTP 401
  `WWW-Authenticate` resource-metadata challenge. After a valid BOS token proves
  access, dynamically resolve the authenticated scope's domain-specific MCP
  services and current tooling. Re-evaluate tenant, role, plugin, capability,
  tool, and provider authority when the selected `tools/call` executes,
  including for administrative operations.
- Keep provider authorization scoped to its organization, installation, and
  plugin. Missing provider readiness affects only server-evaluated operations
  that require that provider; it never creates another BOS authentication
  boundary or removes unrelated subservice capabilities.
- When a domain call returns `authorization_required`, automatically complete
  the provider-specific recovery flow in the active request, verify it, and
  resume the original operation at most once. Never send the user to settings
  to discover or manually register a provider connection.
- For OAuth providers, open the server-returned authorization URL, let the
  customer sign in directly with the provider, and poll the BOS transaction.
- For API-key providers, open the short-lived BOS-hosted HTTPS
  credential-collection URL returned by the service. BOS owns validation and
  encrypted credential persistence. Keep the key out of chat and client files.
- A successful authenticated BOS context or provider-connection call proves the
  BOS grant is valid for its recovery transaction. The API-key recovery page
  must render the provider credential collector without requiring a separate
  product MCP browser session. If it renders or redirects to product MCP sign-in, never
  click, follow, launch, or restart product authentication. Poll the existing
  transaction once, preserve it, and classify the result as
  `provider_recovery_identity_boundary` when the provider form remains absent.
- Calimatic uses that API-key path. Its first blocked request or explicit
  connect request activates the BOS-hosted page for portal URL and API-key
  entry, polls the installation-scoped transaction, and resumes the pending
  operation once. Never direct the customer to a general settings dashboard.

## External dependent-product authentication handoff

Use the stable `bos.authentication-handoff/v1` contract in
[external dependent-product authentication handoff](../bos-mcp-client/references/external-product-authentication-handoff.md)
when a separately installed product that requires BOS encounters an
authentication or MCP-session condition.

The dependent product recognizes the condition and delegates automatically to
the installed BOS plugin. BOS owns the shared host-managed connection.
BOS receives only the exact protected resource, a structured authentication or
MCP-session condition, and optional host-native correlation. It
  coordinates authentication bootstrap or recovery for the dependent
  BOS connection, then returns a typed readiness result. It never receives the
caller's product identity, domain operation, continuation, retry, reconciliation,
cache, or presentation state, and it never receives or transfers a token.

After the readiness result, the caller owns connection and discovery refresh,
approval, cache, semantic continuation, and presentation. BOS Service owns API
idempotency, bounded execution retry, and uncertain-outcome reconciliation; the
caller follows only exact service-returned actions and supplies no execution
state. A native consent surface may still require the user's direct interaction;
BOS coordinates that host surface and reports its readiness state without
accepting the caller's pending operation.
