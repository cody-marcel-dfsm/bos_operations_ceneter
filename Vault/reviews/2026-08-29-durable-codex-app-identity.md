# Durable ChatGPT/Codex app identity review

Date: 2026-08-29

## Findings

No material findings remain.

## Evidence

- `products/bos/product.json:39` owns the durable registered BOS app identity.
- `clients/codex/plugins/bos/.app.json:4` contains the generated durable
  `asdk_app_*` binding and no installation-scoped connector wrapper.
- `scripts/lib/package-model.mjs:191-195` and
  `scripts/lib/package-model.mjs:504-513` reject non-durable app identities
  during product validation and generation.
- `scripts/install-package.mjs:131-139` rejects a generated or installed BOS
  package whose app identity is missing, mismatched, or installation-scoped.
- `tests/package-model.test.mjs:1204-1209` rejects a
  `plugin_asdk_app_*` wrapper, and `tests/installer.test.mjs:170-181` rejects an
  unregistered durable-looking app identity.
- Claude, Copilot, Gemini CLI, and Antigravity retain their native single-root
  BOS connection declarations at `https://dfsm.ai/mcp/apps/bos/platform`.
- `npm run release:check` for release `0.4.51` regenerated every client, passed package and
  credential validation, passed the portable single-BOS-connection contract,
  and passed all 161 tests.

APPROVED
