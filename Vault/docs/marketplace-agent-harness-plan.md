# BOS marketplace agent harness

## Objective

Validate every marketplace package against one BOS connection:

```text
https://dfsm.ai/mcp/apps/bos/platform
```

The BOS package owns the registered app, connector, MCP declaration, OAuth
grant, transport recovery, and tool discovery. Education Center, CRM, Marketing
Director, and other subservice packages contribute skills and contain no
connection binding.

## Required harnesses

For Claude, ChatGPT/Codex, Copilot, Gemini CLI, and Antigravity:

1. Install BOS and at least two subservice packages.
2. Verify that only BOS presents Connect, Sign in, Authenticate, or an MCP
   server entry.
3. Complete BOS OAuth once.
4. Call `bos_get_context` through the BOS resource.
5. Verify that `tools/list` contains only tools authorized by canonical
   organization, application, installation, subservice, plugin, role,
   capability, provider, and tool state.
6. Execute one authorized operation from each installed subservice.
7. Change a role, plugin, or provider state and verify that refreshed discovery
   reflects the server-side change without another BOS login.
8. Verify fail-closed behavior for missing context, unauthorized tools,
   cross-tenant selectors, and revoked grants.

## Package assertions

- `products/bos/product.json` is the only manifest with runtime coordinates or
  a registered ChatGPT/Codex app ID.
- Only generated BOS packages contain `.app.json`, `CONNECTORS.md`,
  `.github/mcp.json`, `mcp_config.json`, or `mcpServers`.
- Every generated subservice package records `connection_owner: "bos"` and
  `authentication: "bos_managed"`.
- No package accepts BOS tokens, authority IDs, endpoints, or connection names
  as customer configuration.

## Acceptance

The harness passes when one BOS authentication supports every authorized
installed subservice and no subservice exposes an additional BOS connection.
