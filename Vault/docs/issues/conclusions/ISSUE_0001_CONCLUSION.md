# Issue 1 conclusion: missing BOS login action

## Root cause

Issue #0001 had two successive package defects. The original Codex package
declared an independent registered app through `.app.json`; its unresolved
private OpenAI account record sent the host to OpenAI onboarding. Removing that
record restored package-owned BOS transport, but the generated `.mcp.json`
still described `platform` as an optional server with no explicit OAuth resource
or adequate startup budget. Codex could therefore omit it while authenticated
discovery was pending and lose the server's authenticated tool state. The
supplied plugin-page screenshot was captured while the grant was valid, so it
does not establish a signed-out missing-Connect defect or prove that these
package fields control native plugin-detail rendering.

## Resolution

The BOS product remains the sole authored transport authority. Package
generation now emits:

```json
{
  "mcpServers": {
    "platform": {
      "type": "http",
      "url": "https://dfsm.ai/mcp/apps/bos/platform",
      "oauth_resource": "https://dfsm.ai/mcp/apps/bos/platform",
      "required": true,
      "startup_timeout_sec": 45
    }
  }
}
```

The Codex plugin manifest references that file with
`"mcpServers": "./.mcp.json"`. The package contains no `.app.json`,
registered connector ID, or independent MCP configuration outside the generated
plugin package.

The framework loads this endpoint and derives OAuth from BOS discovery:
`https://dfsm.ai/api/v1/mcp/oauth/authorize`.

The 0.4.78 runtime trace exposed the remaining package defect: Codex repeatedly
classified `platform` as a pending optional MCP server and omitted it from a new
task. Server evidence later proved that credential was loaded and refreshed:
authenticated `tools/list` exceeded the server's 30-second deadline and returned
an HTTP 200 JSON-RPC timeout, which the client misclassified as signed out. A
later request reused the same grant and returned 49 tools in 27.45 seconds.
The generated server entry now declares the canonical URL as `oauth_resource`
and sets `required: true` with a 45-second startup timeout. This preserves one credential boundary across tasks
and prevents silent server omission. The server owner separately owns bringing
authenticated discovery under its deadline and returning an unambiguous error.
BOS still decides whether authentication is needed by accepting the credential
or returning its OAuth challenge.

The server correction in progress makes authenticated discovery static and
bounded: validate the token once, confirm at least one authorized organization,
and return the complete BOS operation/schema catalog. The client treats those
descriptors as schemas only. It resolves an opaque organization context and lets
the selected `tools/call` decide operation authorization and provider recovery.
Permission or provider changes refresh context or operation status rather than
causing per-tool catalog filtering.

The visual authentication question remains separate. A deliberately signed-out
run must receive BOS's OAuth challenge and demonstrate the host's native
**Connect** action. The authenticated 20:16 plugin-page screenshot cannot satisfy
or fail that acceptance gate.

The earlier 0.4.70 direct-MCP attempt proved package transport only and still
showed no Login action. The current candidate adds the missing deployed
request-time condition: unauthenticated tool discovery exposes
`bos_get_context`, and invoking it while signed out returns the complete BOS
`mcp/www_authenticate` challenge. That gives the framework the BOS OAuth target.
Native rendering remains independently verified by the visual acceptance gate.

## Prevention

Package validation rejects `.app.json`, connector identifiers, private account
API code, and OpenAI or ChatGPT authorization targets. Regression tests require
the generated `.mcp.json` to contain the exact BOS resource, the matching
`oauth_resource`, `required: true`, and the product-owned startup timeout.

## Acceptance

- Package, contract, and focused regression checks pass.
- Live protected-resource discovery identifies the BOS issuer and authorization
  endpoint.
- Signed-out tool authentication returns the BOS MCP OAuth challenge.
- The local marketplace reinstall resolves directly to the corrected generated
  package.
- A fresh task must visibly show the BOS authentication action, and the
  version-matched screenshot must receive an Oracle approval receipt. This
  visual acceptance is pending and prevents Issue #0001 from being marked
  complete. The receipt records the observed authorization target and passes
  only when it exactly equals
  `https://dfsm.ai/api/v1/mcp/oauth/authorize`.
