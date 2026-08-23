# Automatic plugin and provider authentication

## Status

Partially superseded on 2026-08-23 by
`2026-08-23-claude-persistent-account-connectors.md` for Claude product
connections. Provider recovery remains accepted. This decision previously superseded
the Claude packaging portion of
`2026-08-22-claude-account-connector-separation.md` and
`2026-08-16-all-runtime-products-oauth-only.md`.

## Requirement

Installing a runtime product plugin registers its immutable BOS operating-system
connector. The user selects the plugin's native **Connect** action and completes
host-managed BOS OAuth. A request that reaches an unready subsystem receives the
correct secure provider authorization path in that same request; after the user
completes it, the agent verifies readiness and resumes automatically. Users never
enter a BOS URL, API key, token, tenant identifier, or provider secret in chat.

## Evidence

Anthropic's current plugin documentation supports bundled remote MCP servers in
`.mcp.json` or `plugin.json`, starts them when the plugin is enabled, and presents
their tools as plugin-managed capabilities. Anthropic's installed official
Sentry plugin uses the same `mcpServers` plus remote HTTP URL pattern. The prior
BOS package used this native declaration in `0.4.32`; removing it in `0.4.36`
removed the only automatic connector registration mechanism.

Official references:

- `https://code.claude.com/docs/en/plugins-reference`
- `https://code.claude.com/docs/en/mcp#plugin-provided-mcp-servers`
- `https://support.claude.com/en/articles/13837440-use-plugins-in-claude`

## Decision

- The superseding decision owns Claude product-connection packaging and its
  persistent account-level **Connect** control.
- Claude owns BOS OAuth discovery, consent, token storage, refresh, and request
  attachment. The plugin contains no reusable credential.
- Each domain request handles `authorization_required` by presenting the exact
  BOS-returned OAuth or short-lived credential-collection path, polling its
  transaction, verifying readiness, and resuming the original operation once.
- Provider recovery is a single request-path interceptor applied to every
  domain call. Individual skills never replace it with settings/dashboard
  directions. Google-backed dependencies use provider OAuth; Calimatic uses a
  short-lived BOS-hosted portal-URL and API-key form whose values never enter
  the model or MCP client.
- The product connector grant and each subsystem/provider grant remain distinct,
  installation-scoped authorization dimensions.

## Validation requirement

A release fails when a Claude runtime plugin owns a session-scoped MCP
declaration or lacks its account-connector metadata. Tests continue to require
automatic provider authorization recovery and original-request resumption.
