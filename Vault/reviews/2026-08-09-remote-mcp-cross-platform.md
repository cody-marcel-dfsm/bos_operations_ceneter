# Remote MCP and cross-platform package review

- **Date:** 2026-08-09
- **Objective:** Replace the client-side BOS broker with native remote MCP
  configuration and produce an OS-neutral release package.
- **Controlling sources:** `Vault/docs/architecture.md`,
  `Vault/docs/CONSTITUTION.md`, `docs/DESIGN.md`

## Evidence reviewed

- The canonical runtime uses HTTPS remote MCP and references `BOS_API_KEY`
  without embedding its value: `source/runtime/bos/.mcp.json:1`.
- Product profiles receive unique endpoint paths and server identities during
  generation: `scripts/lib/package-model.mjs:211`.
- Authentication, tenant scope, product-tool suppression, and provider
  credential ownership remain server responsibilities:
  `source/platform/authentication-context-integrity/SKILL.md:27`.
- The customer ZIP contains all generated clients and no executable transport:
  `scripts/create_customer_zip.py:49`.
- Tests reject local commands, stdio definitions, loopback listeners, broker
  files, and packaged binaries: `tests/package-model.test.mjs:76`.

## Validation

- `npm run release:check`: passed, 30 tests.
- `git diff --check`: passed.
- Two consecutive complete builds produced ZIP SHA-256
  `cac59f1720707be449cd0a1f98fba85f2d4fc076d282dd4d39f4886f258f0b92`.
- This historical review predates the application/resource-group route
  correction. Current generated configurations follow the named-route specs.
- Release validation runs on Linux and the ZIP contains Codex, Claude, and
  Copilot distributions for host-native installation on macOS, Windows, and
  Linux.

## Findings

No material architecture, tenant-isolation, authentication-context,
credential-safety, product-composition, or release-readiness findings remain.

APPROVED
