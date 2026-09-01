# BOS Operations Center issue history

This tracker is the Oracle's durable issue and regression history. Read it
before implementation guidance and review. Resolved issue details remain in
`Vault/docs/issues/conclusions/` and are indexed with the rest of the Vault.

## Issue #0001: Installed BOS skills appeared while Codex exposed no login or callable tools

- Status: 0.4.71 RELEASE BLOCKED; GPT UI Login/Connect screenshot missing
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

Codex 0.4.65 and 0.4.70 displayed installed BOS skills and plugin settings while
omitting a login action. A task then reported that BOS tools were absent. The installed
package state, registered connection state, OAuth grant state, and callable-tool
manifest had been treated as one readiness signal.

### Root cause

Commit `e46546c` moved the working Education Center app binding to the root BOS
plugin and used `plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91`; that
conversion displayed the BOS login. Subsequent commits replaced that exact
identity, removed `required: true`, and then removed `.app.json` in favor of a
direct `.mcp.json`. The same direct-MCP regression shipped in 0.4.55 through
0.4.64 and again in 0.4.70. Direct MCP receipt produced the Platform server row,
while the absent registered-app declaration left the independent Login display
contract unsatisfied. Skills remained readable because skill loading,
authentication display, OAuth activation, and callable discovery are
independent.

### Required correction

Restore the exact proven root BOS `.app.json` binding with
`plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91` and `required: true`.
Keep the Codex package free of a shadow `.mcp.json` and keep subservices
transport-free. Validate Login display separately from server OAuth discovery,
callable discovery, and execution.

### Attempts

- 0.4.50: root BOS app binding from `e46546c`; user-observed BOS login worked.
- 0.4.51–0.4.54: the proven identity was replaced by later app IDs.
- 0.4.55–0.4.64: `.app.json` was removed for direct `.mcp.json`; Login absent.
- 0.4.65: replacement app was optional; Login absent.
- 0.4.66–0.4.69: required replacement IDs did not restore the proven binding.
- 0.4.70: direct `.mcp.json` was restored; live screenshot again proved Login
  absent even though the Platform MCP server row rendered.
- 0.4.71 candidate: restores the exact 0.4.50 root BOS app binding and migrates
  both direct-MCP and replacement-ID installations. Release acceptance remains
  blocked until `Vault/evidence/codex-login/0.4.71-connect-button.png` visibly
  shows the native BOS Login or Connect control in the GPT client.

### Validation and Oracle review

Repository acceptance requires deterministic package generation, focused Codex
install/login/runtime tests, `npm run release:check`, `npm run contract:check`,
the version-matched GPT UI Login/Connect screenshot, and Oracle review of the
actual diff. Live signed-in acceptance additionally proves OAuth,
declared tool discovery, `bos_get_context`, and one bounded authenticated read.

### Prevention guidance

Treat receiving an MCP response and displaying an authentication action as
separate host behaviors. Pin the last user-proven app identity in product
metadata, generated artifacts, the portable contract, installer migrations,
runtime verification, and regression tests. Treat package binding, registered-app resolution,
OAuth grant state, callable discovery, and execution as independent gates. Test
fresh-account portability instead of validating only an embedded identity's
shape.
