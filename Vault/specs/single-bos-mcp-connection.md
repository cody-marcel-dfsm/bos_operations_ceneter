# Single BOS MCP connection

## Contract

The root BOS product owns one MCP resource:
`https://dfsm.ai/mcp/apps/bos/platform`.

Codex derives its connection from the generated root plugin package:
`.codex-plugin/plugin.json` references `./.mcp.json`, and `.mcp.json`
contains one credential-free remote HTTP server named `platform`. Its
`oauth_resource` equals the canonical endpoint and `required` is true so tasks
share one BOS credential boundary and cannot silently omit the pending root
server. Its 45-second startup timeout exceeds the server's 30-second discovery
deadline and Codex's 10-second default.
The package contains no `.app.json` or registered connector identifier.

Claude uses its account-level Web connector. Copilot and Gemini use their
generated native MCP declarations. Every subservice package contains no MCP or
app binding and uses the root BOS connection.

## Authentication

The host requests the packaged BOS resource and follows its OAuth discovery
challenge. The canonical authorization endpoint is
`https://dfsm.ai/api/v1/mcp/oauth/authorize`. BOS remains responsible for
identity, tenant, organization, application, installation, role, capability,
provider, and tool authorization.

Package startup requirements do not decide whether login is necessary. BOS
accepts an existing resource-scoped credential or returns its OAuth challenge;
the host reuses the former and renders native authentication for the latter.

Packages contain no BOS credentials, tokens, authorization headers, or private
account-management logic.

## Discovery and execution

For authenticated discovery, BOS validates the bearer token and dynamically
resolves the domain-specific MCP services and tooling available to the current
authenticated scope. A tool descriptor proves only that the operation is
currently exposed and defines the arguments the client may send.

The client selects the semantic operation from that live tool surface, resolves one
server-returned opaque organization context through `bos_get_context`, and
invokes `tools/call`. BOS then evaluates organization, installation, role,
plugin, capability, tool, and provider authorization for that operation. An
`authorization_required` response starts only the returned provider recovery
flow; an operation denial remains distinct from BOS login and from catalog
discovery.
