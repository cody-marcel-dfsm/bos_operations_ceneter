# Issue 1 conclusion: missing BOS login action

## Root cause

The Codex package declared an independent registered app through `.app.json`.
That made package installation depend on a private OpenAI account record. The
record failed to resolve, so the host opened OpenAI account onboarding instead
of starting BOS OAuth.

## Resolution

The BOS product remains the sole authored transport authority. Package
generation now emits:

```json
{
  "mcpServers": {
    "platform": {
      "type": "http",
      "url": "https://dfsm.ai/mcp/apps/bos/platform"
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

The earlier 0.4.70 direct-MCP attempt proved package transport only and still
showed no Login action. The current candidate adds the missing deployed
request-time condition: unauthenticated tool discovery exposes
`bos_get_context`, and invoking it while signed out returns the complete BOS
`mcp/www_authenticate` challenge. That gives the framework the BOS OAuth target.
Native rendering remains independently verified by the visual acceptance gate.

## Prevention

Package validation rejects `.app.json`, connector identifiers, private account
API code, and OpenAI or ChatGPT authorization targets. Regression tests require
the generated `.mcp.json` to contain the exact BOS resource.

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
