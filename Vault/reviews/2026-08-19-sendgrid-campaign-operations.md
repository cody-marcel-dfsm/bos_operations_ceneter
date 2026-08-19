# SendGrid campaign operations skill review

Date: 2026-08-19

## Scope

Reviewed the canonical `sendgrid-campaign-operations` capability, Education
Center product composition, release `0.4.25`, generated
Codex/Claude/Copilot/Gemini copies, and the package-model regression test.

## Findings

No material findings.

## Architecture evidence

- `source/capabilities/sendgrid-campaign-operations/SKILL.md:8-16` routes runtime
  work through the authenticated BOS MCP client and the Education Center source
  router while keeping provider identity, sender configuration, and credentials
  server-owned.
- `source/capabilities/sendgrid-campaign-operations/SKILL.md:20-53` requires live
  schema discovery, bounded source queries, suppression-aware audience
  construction, explicit list-send approval, idempotency, and event-backed
  delivery reporting.
- `source/capabilities/sendgrid-campaign-operations/SKILL.md:60-72` fails closed
  on ambiguous authority and prohibits local credentials, browser state, and
  uncertain send replay.
- `source/capabilities/sendgrid-campaign-operations/references/capability-contract.md:8-26`
  separates client inputs from server behavior and treats unavailable lifecycle
  and statistics operations as explicit capability gaps.
- `source/capabilities/sendgrid-campaign-operations/references/capability-contract.md:28-44`
  governs cross-source deduplication, adult-contact selection, suppression,
  eligibility, and server-owned audience evidence.
- `products/education-center/product.json:18-33` composes the capability through
  the canonical product manifest.
- `tests/package-model.test.mjs:68-99` protects composition, source coverage,
  approval, delivery evidence, idempotency, lifecycle, metrics, and consent
  invariants.

## Validation evidence

- Skill quick validation passed.
- Package generation completed for two active products across Codex, Claude,
  Copilot, and Gemini.
- Canonical and generated skill files matched byte-for-byte for every Education
  Center client package.
- Package structure and credential scan passed.
- Full test suite passed: 122 tests.
- `git diff --check` passed.

APPROVED
