# Oracle review: Codex registered-app login surface

Date: 2026-09-01

## Scope

Review the actual Operations Center diff that restores the native Codex plugin
authentication control and prevents a direct-MCP-only regression. No BOS server
repository or infrastructure change is in scope.

## Findings

No blocking or advisory findings.

## Evidence

- `products/bos/product.json:47-50` restores the durable registered BOS app
  identity on the sole connection-owning product.
- `clients/codex/plugins/bos/.codex-plugin/plugin.json:29-30` binds the plugin to
  `.app.json`, and `clients/codex/plugins/bos/.app.json:1-7` maps exactly one BOS
  registered app. The generated Codex package contains no `.mcp.json`.
- `scripts/lib/package-model.mjs:214-252` reserves the app identity for the
  active root Codex runtime, while lines 524-539 deterministically generate the
  app binding.
- `scripts/install-package.mjs:112-148` fails closed on missing, malformed, or
  shadowed app bindings. Lines 663-677 migrate the prior recognized direct BOS
  MCP declaration without accepting unrelated files.
- `scripts/verify-codex-runtime.mjs:74-90` validates the exact installed app
  identity. Lines 150-182 keep app binding, package registration, and callable
  tool discovery as distinct readiness evidence.
- `source/platform/bos-mcp-client/SKILL.md:83-104` and
  `source/platform/bos-guided-support/references/support-state-machine.md:23-41`
  distinguish plugin-page display binding from runtime HTTP 401 OAuth discovery
  and prohibit CLI-login or generic-permission substitutes.
- `tests/codex-login-surface-contract.test.mjs:11-52` locks the generated display
  contract and its independence from server discovery. The negative regression
  in `tests/codex-runtime-verification.test.mjs:149-177` rejects a valid direct
  MCP declaration when the registered app binding is absent.
- `contracts/single-bos-mcp-connection.v1.json:3-22` makes the durable app ID and
  `.app.json` artifact part of the client-owned server acceptance contract while
  preserving one BOS root resource and transport-free subservices.

## Validation

- `npm run release:check`: passed; 206 tests passed.
- `npm run contract:check`: passed with zero violations.
- Current OpenAI plugin validator: passed for `clients/codex/plugins/bos`.
- Skill validation: passed for `bos-mcp-client`, `bos-guided-support`, and
  `authentication-context-integrity`.
- `git diff --check`: passed.

## Conclusion

The change restores the client-native registered-app surface that displays the
Codex login control, preserves the independent server OAuth discovery contract,
keeps every subservice behind the single BOS connection, and adds positive and
negative regression coverage across generation, installation, runtime
verification, and support guidance.

APPROVED
