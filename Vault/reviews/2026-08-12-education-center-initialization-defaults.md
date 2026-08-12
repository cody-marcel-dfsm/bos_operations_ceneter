# Education Center initialization defaults review

- **Scope:** Authentication-first Education Center customer initialization,
  sourced default suggestions, one-step customer acceptance, installer brand
  derivation, and generated-client parity.
- **Reviewed:** 2026-08-12

## Findings

No material findings.

## Evidence

- The initialization skill completes host-managed authentication before any
  customer-settings question, runs bounded connection recovery and context
  discovery, and preserves the draft without eliciting settings when
  authentication remains unavailable at
  `source/verticals/education-center/education-center-customer-initialization/SKILL.md:32-38`
  and `:57-66`.
- The skill derives candidates from non-secret client and authorized BOS
  metadata, distinguishes confirmed, derived, and suggested values, and excludes
  public research and unrelated message content at
  `source/verticals/education-center/education-center-customer-initialization/SKILL.md:23-53`.
- The customer receives one sourced four-field recommendation and can accept it
  with “Use these defaults”; suggested values are never applied before that
  confirmation at
  `source/verticals/education-center/education-center-customer-initialization/SKILL.md:68-92`.
- Explicit client-provided brand metadata now participates in the installer
  initialization draft with source tracking at
  `scripts/install-package.mjs:669-687`. Customer settings remain inert display
  configuration and cannot change technical identifiers or authorization at
  `source/verticals/education-center/education-center-customer-initialization/SKILL.md:112-122`.
- The canonical architecture and identity decision now record authentication
  ordering, sourced suggestions, and confirmation before persistence at
  `Vault/docs/architecture.md:57-62` and
  `Vault/decisions/2026-08-11-education-center-product-identity.md:22-29`.
- Contract tests cover authentication ordering, the one-step recommendation,
  recovery failure behavior, and explicit installer brand derivation at
  `tests/package-model.test.mjs:328-344` and
  `tests/installer.test.mjs:620-648`.

## Validation

- `python3 .../quick_validate.py source/verticals/education-center/education-center-customer-initialization` — passed.
- `npm run build:artifacts` — generated all active Codex, Claude, Copilot, and
  Gemini packages plus deterministic release archives.
- `npm run check:build` — passed.
- `npm run check` — package structure, generated parity, and credential scan
  passed.
- `npm test` — 127 tests passed.
- `git diff --check` — passed.

APPROVED
