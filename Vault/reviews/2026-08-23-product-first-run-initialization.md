# Product first-run initialization review

- **Scope:** Product-declared customer-settings initialization, automatic
  first-run preflight composition, resumable setup, and generated-client parity.
- **Reviewed:** 2026-08-23

## Findings

No material findings.

## Evidence

- The Education Center manifest declares its settings template and the included
  initialization skill at `products/education-center/product.json:13-14`.
- Product validation requires the settings template and initializer together and
  requires the initializer to name an included skill at
  `scripts/lib/package-model.mjs:193-213`.
- Deterministic composition injects the first-run preflight into every other
  product skill while leaving the initializer itself re-entrant at
  `scripts/lib/package-model.mjs:269-316`.
- The preflight validates the preserved overlay, invokes initialization for
  missing, incomplete, or invalid configuration, orders authentication before
  settings elicitation, preserves the pending request, and resumes it after
  validation at `scripts/lib/package-model.mjs:295-313`.
- The package checker hashes the composed skill form, retaining canonical-source
  parity checks for generated output at `scripts/check-package.mjs:61-73`.
- Cross-client tests inspect every packaged Education Center skill in Codex,
  Claude, both Copilot layouts, and Gemini at
  `tests/package-model.test.mjs:120-181`.
- The durable architecture records the same authentication-first, resumable
  invariant for all four clients at `Vault/docs/architecture.md:65-78`.
- Version `0.4.40` distinguishes these packages from `0.4.39` so native update
  controls can recognize the release.

## Validation

- `python3 tools/vault_index.py sync --quiet` — passed.
- `npm run release:check` — package generation and credential scan passed; all
  121 tests passed.
- `git diff --check` — passed.

APPROVED
