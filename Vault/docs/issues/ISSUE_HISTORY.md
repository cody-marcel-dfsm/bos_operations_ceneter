# BOS Operations Center issue history

This tracker is the Oracle's durable issue and regression history. Read it
before implementation guidance and review. Resolved issue details remain in
`Vault/docs/issues/conclusions/` and are indexed with the rest of the Vault.

## Issue #0001: Installed BOS skills appeared while Codex exposed no login or callable tools

- Status: RESOLVED in 0.4.70
- Priority: CRITICAL
- Date identified: 2026-09-01
- Area: Codex package binding, authentication display, and tool discovery
- Files: `products/bos/product.json`, `scripts/lib/package-model.mjs`,
  `scripts/install-package.mjs`, `scripts/verify-codex-runtime.mjs`,
  `tests/codex-login-surface-contract.test.mjs`,
  `tests/codex-runtime-verification.test.mjs`
- Conclusion: `Vault/docs/issues/conclusions/ISSUE_0001_CONCLUSION.md`

### User goal and definition of done

An installed BOS plugin must expose a native host authentication path whenever
authentication is required, load one BOS MCP connection, discover its callable
tools after authorization, and explain failures at the exact failing layer.

### Observed evidence

Codex 0.4.65 displayed installed BOS skills and plugin settings while omitting a
login action. A task then reported that BOS tools were absent. The installed
package state, registered connection state, OAuth grant state, and callable-tool
manifest had been treated as one readiness signal.

### Root cause

The 0.4.65 package switched to an optional registered-app binding. Release
0.4.66 restored `required: true`, yet the referenced `asdk_app_*` identity was
an account-scoped Platform submission draft rather than a portable package
runtime connection. The first ID was deleted; its replacement still could not
resolve as a customer connection. Skills remained readable because skill loading
and MCP connection loading are independent.

### Required correction

Use the root package's credential-free `.mcp.json` to bind the immutable BOS
HTTPS resource. Keep subservices transport-free. Validate install, skill load,
connection load, OAuth, callable discovery, and execution independently. Keep
OpenAI submission drafts in their publication lifecycle.

### Attempts

- 0.4.65: optional registered app; native login display absent.
- 0.4.66: `required: true`; display contract improved while the account-scoped
  app identity remained unresolvable for customers.
- 0.4.70: package-owned MCP resource restored and registered-app IDs removed
  from the portable runtime contract.

### Validation and Oracle review

Repository acceptance requires deterministic package generation, focused Codex
install/login/runtime tests, `npm run release:check`, `npm run contract:check`,
and Oracle review of the actual diff. Live acceptance additionally proves OAuth,
declared tool discovery, `bos_get_context`, and one bounded authenticated read.

### Prevention guidance

Treat receiving an MCP response and displaying an authentication action as
separate host behaviors. Treat package binding, registered-app resolution,
OAuth grant state, callable discovery, and execution as independent gates. Test
fresh-account portability instead of validating only an embedded identity's
shape.
