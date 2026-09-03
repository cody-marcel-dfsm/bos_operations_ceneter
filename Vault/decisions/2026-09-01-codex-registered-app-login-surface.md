# Codex registered BOS app experiment

## Status

Superseded on 2026-09-02 by
`2026-08-29-codex-package-owned-mcp.md`.

## Finding

The experiment treated a plugin-detail action as requiring a package
`.app.json` mapping to a `plugin_asdk_app_*` account record. That conclusion
conflated a registered connection with package-owned MCP OAuth.

The unresolved registered record caused Codex to enter OpenAI account
onboarding at `auth.openai.com/about-you`. It did not authenticate the BOS
resource and did not represent the Git marketplace package contract.

## Replacement

The generated root plugin owns `.mcp.json`, and the framework derives BOS
OAuth from `https://dfsm.ai/mcp/apps/bos/platform`. All connector lifecycle,
private account inspection, provisioning, replacement-ID, and deletion logic is
removed from this repository.
