# Codex registered BOS app and native login surface

## Status

Accepted on 2026-09-01. Supersedes
`2026-08-29-codex-package-owned-mcp.md` for ChatGPT/Codex packaging.

## Decision

The root BOS Codex plugin declares `apps: "./.app.json"`. The app file contains
exactly one durable BOS app identity. The Codex package contains no
direct `.mcp.json` binding. Subservice plugins contain neither app nor MCP
bindings and continue through the root BOS connection.

The registered app declaration owns the plugin-page **Login**, **Connect**, or
**Authenticate** display surface. Its presence is independent of receiving an
MCP response. The BOS resource's unauthenticated HTTP 401 protected-resource
challenge separately owns runtime OAuth discovery and activation.

## Evidence and reason

A direct `.mcp.json` package produced a server-settings row while removing the
plugin-page authentication control. A valid protected-resource challenge could
not restore a control whose registered app declaration was absent. The durable
BOS app identity restores the client-native login surface while preserving one
root BOS connection.

## Consequences

- Product metadata and generated Codex output preserve the durable app identity.
- Package validation rejects direct-MCP-only Codex output.
- Runtime verification requires the registered app binding and callable tool
  catalog as independent readiness evidence.
- Regression tests distinguish plugin-page display binding from server OAuth
  discovery and challenge behavior.
