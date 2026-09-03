# Issue 1 RCA: BOS login routed to OpenAI onboarding

## Finding

The root BOS Codex package used `.app.json` and a `plugin_asdk_app_*`
identifier. That artifact references an independently registered OpenAI account
connection. When Codex could not resolve that private record, it entered the
OpenAI account onboarding path. The observed
`https://auth.openai.com/about-you` page was produced by that host fallback;
it was not authored or returned by BOS.

## Correct package contract

The Git marketplace already identifies the plugin source. The root plugin owns
its MCP transport as build output:

- `.codex-plugin/plugin.json` contains `"mcpServers": "./.mcp.json"`.
- `.mcp.json` contains exactly one remote HTTP server named `platform`.
- Its URL is `https://dfsm.ai/mcp/apps/bos/platform`.
- The package contains no `.app.json`, connector ID, account registry
  lifecycle, or private connector API client.

Codex loads the packaged MCP endpoint. A signed-out request receives the BOS
`WWW-Authenticate` challenge, reads the protected-resource and authorization
server metadata, and opens
`https://dfsm.ai/api/v1/mcp/oauth/authorize`. BOS may then redirect to Google
for identity selection. OpenAI account onboarding is outside this flow.

Earlier direct `.mcp.json` releases, including 0.4.70, established only the
package transport and still failed to render Login. The changed condition in
the current candidate is the deployed BOS request-time authentication contract:
unauthenticated initialization and tool discovery expose `bos_get_context`, and
its signed-out invocation returns the complete `mcp/www_authenticate` challenge
that identifies the BOS protected resource and authorization metadata. This
removes the protocol gap that previously left the client without a usable BOS
authentication challenge. It does not prove the native client rendered the
action; that remains a separate screenshot-gated acceptance step.

## Fix

The generator, validator, installer, runtime verifier, login acceptance check,
and single-connection contract now derive the Codex MCP binding from
`products/bos/product.json`. The obsolete registered-app scripts and private
account connector client were removed. Cleanup is limited to validated local
BOS package caches and installed plugin entries.

## Prevention

Tests require the exact package chain
`plugin.json -> .mcp.json -> https://dfsm.ai/mcp/apps/bos/platform`, reject
`.app.json`, reject OpenAI/ChatGPT authorization targets in the package, and
verify that the BOS authorization endpoint remains
`https://dfsm.ai/api/v1/mcp/oauth/authorize`. Final login acceptance also
requires a version-matched native plugin-detail screenshot and a matching
Oracle approval receipt; package and live protocol checks alone cannot close
Issue #0001.

The receipt binds `product_version`, screenshot basename and SHA-256,
`GPT_PLUGIN_DETAIL` surface, visible action label, reviewer, verdict, and
`observed_authorization_target`. The observed target must equal
`https://dfsm.ai/api/v1/mcp/oauth/authorize`; an OpenAI or ChatGPT target fails
even when the screenshot contains a visible action.
