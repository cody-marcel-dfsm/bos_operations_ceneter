# Durable ChatGPT/Codex app identity review

Date: 2026-08-29
Status: Superseded on 2026-09-01 by
`Vault/decisions/2026-09-01-codex-registered-app-login-surface.md`

This record preserves the 0.4.51 review history. Its bare-identifier conclusion
was invalidated by the exact repository history and later live evidence. It does
not approve current package identity or release readiness.

## Findings

The review incorrectly classified the complete `plugin_asdk_app_*` technical
identifier as an installation-scoped wrapper. Commit `16b44bc` replaced the
bare `asdk_app_6a7cb...` declaration after connector resolution failed, and
commit `e46546c` preserved the complete prefixed identifier in both product
metadata and generated `.app.json`. The accepted 2026-09-01 decision therefore
controls current implementation.

## Historical evidence evaluated at the time

- `products/bos/product.json:39` owns the durable registered BOS app identity.
- `clients/codex/plugins/bos/.app.json:4` then contained a bare `asdk_app_*`
  binding that subsequent evidence proved was not the last-known-good shape.
- `scripts/lib/package-model.mjs:191-195` and
  `scripts/lib/package-model.mjs:504-513` reject non-durable app identities
  during product validation and generation.
- `scripts/install-package.mjs:131-139` rejects a generated or installed BOS
  package whose app identity is missing, mismatched, or installation-scoped.
- `tests/package-model.test.mjs:1204-1209` rejected the prefixed identifier;
  that assertion encoded the invalid assumption and no longer controls.
- Claude, Copilot, Gemini CLI, and Antigravity retain their native single-root
  BOS connection declarations at `https://dfsm.ai/mcp/apps/bos/platform`.
- `npm run release:check` for release `0.4.51` regenerated every client, passed package and
  credential validation, passed the portable single-BOS-connection contract,
  and passed all 161 tests.

SUPERSEDED
