# Codex package-owned BOS MCP declaration

## Status

Accepted. Reaffirmed on 2026-09-02 after validating the current OpenAI plugin
package and authentication contracts.

## Decision

The root BOS Codex plugin declares `mcpServers: "./.mcp.json"`. Its generated
MCP file contains exactly one credential-free remote HTTP server at
`https://dfsm.ai/mcp/apps/bos/platform`. The package contains no `.app.json`
and no registered-app identifier.

Codex derives transport and authentication from the installed package and BOS
OAuth discovery. Subservice plugins contain no MCP or app binding.

## Reason

A Git marketplace distributes the plugin package. A bundled `.mcp.json` is
the supported package-owned MCP server configuration. A bundled `.app.json`
maps a plugin to an independently registered MCP connection and therefore
introduces account-registry state outside the package.

The registered-app experiment routed an unresolved private record into OpenAI
account onboarding. Direct package MCP discovery routes authentication to BOS.

## Consequences

- Product source generates every client transport artifact.
- Codex installation has no dependency on an OpenAI account connector record.
- Validation requires the exact BOS `.mcp.json` and rejects `.app.json`.
- The host follows the BOS OAuth challenge and authorization metadata.
