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

## Invariants

- The authenticated user's current role governs interactive execution. A
  plugin `run_as_role` value never elevates an OAuth user's authority.
- Request values select scope and require server validation.
- Customer configuration supplies context and never supplies authority.
- Provider credentials remain scoped to their installed app and plugin.
- Reconnect or reauthorization replaces the scoped grant and preserves
  application configuration.
- Background jobs carry the same validated scope as interactive operations.
- The agent owns MCP transport and session recovery. On a closed stream or
  session, it reconnects the configured endpoint, rediscovers tools,
  revalidates context, and resumes the interrupted request with bounded retry.
  It never delegates reconnection or request resubmission to the user.
- Expose BOS as a remote HTTPS Streamable HTTP MCP server. Claude account-level
  Web connectors, OAuth-capable GitHub Copilot, and Gemini declare the immutable
  resource URL. Claude marketplace plugins contain skills and account-connector
  metadata only; they never package `.mcp.json` or `mcpServers`, because Claude
  classifies plugin-owned MCP servers as session connections. ChatGPT/Codex
  packages declare a required registered app binding that owns the resource and
  carry no direct MCP server declaration. Every runtime host
  uses its OAuth 2.1 MCP
  authorization flow. The host discovers BOS
  authorization metadata, launches consent, stores and refreshes the grant,
  and attaches the resulting resource-scoped access token. The package never
  asks for or stores a BOS API key. Multiple named product connections may
  hold distinct grants. Every secured call fails closed when authorization is
  absent, invalid, expired, revoked, or scoped to another resource.
- Register the package's immutable
  `/mcp/apps/{application-name}/{skill-group-name}` endpoint and verify the
  server-returned context. Never discover, prompt for, repair, or materialize
  the route from an `installed_app_id`, and never retain an unnamed endpoint as
  an installed product's runtime connection. For Claude, provision the resource
  as an account or organization Web connector and keep it out of the plugin MCP
  manifest. For ChatGPT/Codex, never package `.mcp.json` or `mcpServers`; bind
  the registered app through `.app.json`.
  For every client, never add `bearer_token_env_var`, literal authorization
  headers, or a plugin key field. The server derives actor, tenant, organization, installation,
  role, plugin, and capability scope from the validated OAuth grant; client
  prompts and tool arguments never supply those authority dimensions.
- Advertise only the tools allowed for the resolved endpoint, tenant,
  installation, plugin, and execution role. Advertise administrative tools
  only when the selected role carries their explicit administrative
  capability.
- Keep provider authorization scoped to its organization, installation, and
  plugin. Missing provider readiness never changes another named connection's
  tools, authentication, build gate, or release state.
- When a domain call returns `authorization_required`, automatically complete
  the provider-specific recovery flow, verify it, and resume the original
  operation at most once.
- For OAuth providers, open the server-returned authorization URL, let the
  customer sign in directly with the provider, and poll the BOS transaction.
- For API-key providers, open the short-lived BOS-hosted HTTPS
  credential-collection URL returned by the service. BOS owns validation and
  encrypted credential persistence. Keep the key out of chat and client files.
