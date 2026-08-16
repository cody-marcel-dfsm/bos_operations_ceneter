# Bright Horizons deterministic report-rules review

Date: 2026-08-16

## Findings

No material findings.

## Scope and evidence

- The change remains in the owning Education Center vertical specialization.
  It does not change platform authority, transport, credentials, or provider
  mutation boundaries. The invoice skill continues to require tenant-scoped
  BOS evidence at
  `source/verticals/education-center/education-center-invoice-operations/SKILL.md:17-28`.
- Every Bright Horizons inquiry now loads one shared operating contract, and
  reimbursement prompts retain deterministic intent routing at
  `source/verticals/education-center/education-center-invoice-operations/SKILL.md:30-58`.
- Invoice generation now reconciles every candidate child-day against provider
  and Calimatic evidence before workbook construction at
  `source/verticals/education-center/education-center-invoice-operations/SKILL.md:48-66`.
- The operating contract establishes evidence precedence, the shared Calimatic
  parser address, provider-message timestamp control, fail-closed discrepancy
  handling, the two-business-day cutoff, 50% late-cancellation treatment,
  written approval for post-start full-rate treatment, the billing mailbox,
  and payment-after-receipt control at
  `source/verticals/education-center/education-center-invoice-operations/references/bright-horizons-operating-rules.md:25-115`.
- The workbook workflow builds the candidate child-day set from the union of
  Calimatic and provider evidence, assigns exactly one billing disposition,
  blocks unresolved records, and supports mixed full-rate and half-rate rows at
  `source/verticals/education-center/education-center-invoice-operations/references/bright-horizons-workbook.md:13-100`.
- Class, roster, attendance, capacity, and placement reporting now shares the
  same Bright Horizons evidence and cancellation rules while keeping invoice
  generation in its owning skill at
  `source/verticals/education-center/education-center-class-operations/SKILL.md:54-61`.
- Regression coverage asserts the addresses, cancellation policy, evidence
  union, unresolved-state control, mixed-rate invoice total, and distribution
  of the shared operating contract at `tests/package-model.test.mjs:346-480`.
- Canonical source and the Codex, Claude, Copilot, and Gemini generated copies
  were byte-identical for the new operating-rules reference after package
  generation, preserving the canonical-generation contract in
  `Vault/docs/architecture.md:38-41`.
- The canonical files contain provider workflow addresses rather than customer
  credentials or reusable authority. Package credential scanning and the
  customer-neutrality regression passed, consistent with
  `Vault/docs/CONSTITUTION.md:21-28`.

## Validation

- `node scripts/build-packages.mjs`: passed.
- `npm test`: 132 passed, 0 failed.
- `node scripts/check-package.mjs`: passed package structure, product, skill,
  and credential scan.
- `quick_validate.py` for `education-center-invoice-operations`: passed.
- `quick_validate.py` for `education-center-class-operations`: passed.
- `git diff --check`: passed.
- Direct source-to-client comparison for the new operating-rules reference:
  passed for Codex, Claude, Copilot, and Gemini.

APPROVED
