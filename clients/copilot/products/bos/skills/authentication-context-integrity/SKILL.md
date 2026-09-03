---
name: authentication-context-integrity
description: Preserve BOS authentication and execution context across login, app selection, organization selection, role selection, installed-app resolution, MCP calls, plugin configuration, provider authorization, sessions, and background work. Use for application-neutral auth, selector, OAuth, credential, or tenant-scope design and review.
---

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
5. For interactive OAuth requests, derive the effective execution role from
   the authenticated user's current installed-app membership. Use a
   server-issued role context for an explicit lower-role request. Keep
   plugin-owned execution roles only for background or service-owned work.
6. Resolve credentials by organization, installation, plugin, and credential
   name.
7. Fail closed when canonical scope or grant provenance is incomplete.
8. Add negative tests for actor-supplied authority, cross-tenant access,
   fallback credentials, and ambiguous context.
9. When several authorized organizations are returned, resolve one organization
   before selecting its role. An explicit organization in the current request
   overrides the validated local default for that request. Cross-organization
   execution requires explicit user scope.

## Invariants

- The authenticated user's current role governs interactive execution. A
  plugin `run_as_role` value never elevates an OAuth user's authority.
- Request values select scope and require server validation.
- Customer configuration supplies context and never supplies authority.
- A client default-organization preference stores only a display label and may
  select only one exact organization already returned by the authenticated BOS
  context. It never stores an organization ID or grants membership. Missing,
  stale, or ambiguous preference state stops before a domain data call.
- Provider credentials remain scoped to their installed app and plugin.
- Reconnect or reauthorization replaces the scoped grant and preserves
  application configuration.
- The user authenticates to BOS once per user-facing client context. The root
  BOS plugin owns that host-managed connection. Education Center, CRM,
  Marketing Director, and other subservice plugins never create or request an
  additional BOS login.
- Every subservice request uses the authenticated BOS connection. The server
  derives and evaluates organization, application, installation, subservice,
  plugin, role, capability, provider, and tool scope for that request.
- Never interpret per-organization `is_default` role markers as a global
  organization default. Select one organization first, then its unique default
  role. Never query every accessible organization unless the user explicitly
  requests cross-organization scope.
- Platform BOS operations use the BOS connection directly. They never transit
  an Education Center, CRM, Marketing Director, or other subservice connection.
- Background jobs carry the same validated scope as interactive operations.
- The agent owns MCP transport and session recovery. On a closed stream or
  session, it reconnects the configured endpoint, rediscovers tools,
  revalidates context, and resumes the interrupted request with bounded retry.
  It never delegates reconnection or request resubmission to the user.
- Expose BOS as a remote HTTPS Streamable HTTP MCP server. Claude account or
  organization Web connectors, OAuth-capable GitHub Copilot, and Gemini declare
  the immutable resource URL. Claude marketplace plugins contain skills and
  account-connector metadata with no `.mcp.json` or `mcpServers`; this preserves
  the persistent account-level **Connect** control. ChatGPT/Codex packages
  declare one package-owned root BOS resource in `.mcp.json` and contain no
  `.app.json`. Every runtime host
  uses its OAuth 2.1 MCP
  authorization flow. The host discovers BOS
  authorization metadata, launches consent, stores and refreshes the grant,
  and attaches the resulting resource-scoped access token. The package never
  asks for or stores a BOS API key. Subservice packages reference the existing
  BOS connection and carry no separate BOS authentication binding. Every
  secured call fails closed when authorization is
  absent, invalid, expired, revoked, or scoped to another resource.
- Register the root BOS package's immutable MCP endpoint and verify the
  server-returned context. Never discover, prompt for, repair, or materialize
  the route from an `installed_app_id`, customer setting, or subservice
  package. For Claude, declare the BOS resource
  in an account or organization Web connector and complete authorization from
  **Customize → Connectors**. For ChatGPT/Codex, package exactly one `.mcp.json`
  declaration for the root BOS resource and no `.app.json`.
  Subservice plugins ship skills and metadata without another BOS MCP binding.
  For every client, never add `bearer_token_env_var`, literal authorization
  headers, or a plugin key field. The server derives actor, tenant, organization, installation,
  role, plugin, and capability scope from the validated OAuth grant; client
  prompts and tool arguments never supply those authority dimensions.
- Advertise only the tools allowed for the resolved endpoint, tenant,
  installation, plugin, and execution role. Advertise administrative tools
  only when the selected role carries their explicit administrative
  capability.
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
- Calimatic uses that API-key path. Its first blocked request or explicit
  connect request activates the BOS-hosted page for portal URL and API-key
  entry, polls the installation-scoped transaction, and resumes the pending
  operation once. Never direct the customer to a general settings dashboard.
