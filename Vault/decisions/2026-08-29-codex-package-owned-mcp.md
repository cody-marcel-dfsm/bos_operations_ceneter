# Codex package-owned BOS MCP declaration

## Status

Superseded on 2026-09-01 by
`2026-09-01-codex-registered-app-login-surface.md` after live 0.4.70 UI evidence
proved that a direct MCP declaration renders a server row without the native
Login action.

## Decision

The root BOS Codex plugin declares `mcpServers: "./.mcp.json"`. Its MCP file
contains exactly one credential-free HTTPS Streamable HTTP server at
`https://dfsm.ai/mcp/apps/bos/platform`. The plugin contains no `.app.json` and
no `asdk_app_*` identifier. Codex performs OAuth discovery and public-client
registration from the installed package and current BOS server metadata.

Subservice plugins contain no MCP or app binding and continue through the root
BOS connection.

## Evidence and reason

The prior package embedded an account-scoped app ID. Deleting that account
record left every fresh installation pointing at an absent connector, causing
ChatGPT to fail with `Couldn't load connector` before OAuth began. A package-
owned MCP declaration is self-contained for transport discovery. It does not
own the plugin-page authentication display in ChatGPT/Codex. The decision
therefore fixed transport declaration while regressing the required Login
surface.

## Consequences

These consequences describe the superseded implementation and are retained as
failed-attempt history.

- Fresh installation has no dependency on a publisher or customer account app.
- Complete uninstall may delete local registrations and caches without
  invalidating the distributable package.
- Validation requires one canonical BOS `.mcp.json`, rejects `.app.json`, and
  verifies the callable tool catalog after OAuth discovery.
- Claude retains its account-level Web connector model. Copilot and Gemini
  retain their direct package-owned MCP declarations.
