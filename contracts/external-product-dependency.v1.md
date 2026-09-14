# BOS external product dependency contract v1

An independently published BOS product owns its skills and one authenticated,
host-managed connection to an application- and capability-scoped MCP discovery
resource. It declares `bos` as a required product dependency. Connection
ownership creates no product-named BOS route, resource, registration, or service.
BOS manages authentication and recovery for the dependent product. The client host
stores and refreshes the resource-scoped OAuth grant, and the BOS service enforces
authorization on every operation.
Every grant binds exactly one organization, application, installation, and role;
the client never selects or expands those authority dimensions.

The dependent product contains no login, token exchange, token refresh, credential
storage, or authentication-recovery implementation. It recognizes authentication
conditions and automatically delegates the exact protected resource and structured
condition to BOS. Its pending operation remains private to that product.

## Package metadata

Place `.bos-product.json` at the client package root and validate it against
`external-product-dependency.v1.schema.json`. The product's `connection_owner`
equals its own product name. `authentication_handoff.authentication_manager`
equals `bos`; the handoff metadata contains no product identity or continuation
policy. `authorization_scope_policy` equals
`ONE_ORGANIZATION_APPLICATION_INSTALLATION_ROLE_PER_GRANT`.

The package also contains its client-native declaration for its own host connection:

- Codex: `.mcp.json`
- Claude: `CONNECTORS.md`
- Copilot: `.github/mcp.json`
- Gemini: `mcp_config.json`

The application MCP connection remains distinct from the BOS platform MCP
connection. Several independently published products may connect to the same
public application resource; connection ownership does not make that resource
exclusive. BOS authentication management does not combine tool catalogs,
audiences, or connections.

The resource URL is a credential-free HTTPS URL with no query string or fragment.
It cannot reuse `https://dfsm.ai/mcp/apps/bos/platform`. Codex packages set both
`startup_timeout_sec` and `tool_timeout_sec` to at least 180 seconds in `.mcp.json`
and declare the same minimum budgets in `.bos-product.json`. Product connection
artifacts contain no `headers.Authorization`, `bearer_token_env_var`, token,
client-secret, or credential environment-variable configuration. OAuth remains
host-managed under BOS orchestration.

## Validation

From BOS Operations Center, validate a separately located package with:

```bash
node scripts/verify-product-mcp-contract.mjs \
  --external-product-root /absolute/path/to/product-package \
  --format json
```

The package source may live in any repository. Validation reads only the package
root, the public v1 contract, and the package's client-native MCP declaration.

## Compatibility

Contract v1 accepts additional metadata fields. New authentication or MCP-session
conditions delegate to BOS automatically. A change to
required ownership or security semantics creates a new contract major.
Existing v1 host bindings remain stable while their application resources remain
valid. Compatible API additions flow through refreshed discovery.
