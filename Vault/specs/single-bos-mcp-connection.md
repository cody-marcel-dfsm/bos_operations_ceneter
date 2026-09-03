# Single BOS MCP connection

## Contract

The root BOS product owns one MCP resource:
`https://dfsm.ai/mcp/apps/bos/platform`.

Codex derives its connection from the generated root plugin package:
`.codex-plugin/plugin.json` references `./.mcp.json`, and `.mcp.json`
contains one credential-free remote HTTP server named `platform`. The package
contains no `.app.json` or registered connector identifier.

Claude uses its account-level Web connector. Copilot and Gemini use their
generated native MCP declarations. Every subservice package contains no MCP or
app binding and uses the root BOS connection.

## Authentication

The host requests the packaged BOS resource and follows its OAuth discovery
challenge. The canonical authorization endpoint is
`https://dfsm.ai/api/v1/mcp/oauth/authorize`. BOS remains responsible for
identity, tenant, organization, application, installation, role, capability,
provider, and tool authorization.

Packages contain no BOS credentials, tokens, authorization headers, or private
account-management logic.
