# BOS Operations Center release-readiness review

- **Date:** 2026-08-11
- **Scope:** Complete uncommitted repository diff, including canonical sources,
  generated clients, installers, documentation, tests, and release artifacts.
- **Controlling sources:** `Vault/docs/architecture.md`,
  `Vault/docs/CONSTITUTION.md`, and
  `Vault/specs/shared-local-document-cache.md`.

## Findings resolved during review

1. The new Claude installer initially accepted a sensitive BOS value in the
   wrapper process and forwarded it in command arguments. The final
   implementation delegates collection and storage to Claude's declared
   sensitive `userConfig` field. The wrapper now performs only marketplace and
   plugin lifecycle calls at `scripts/install-claude-local.mjs:40-119`, and the
   regression guard rejects credential prompts, configuration arguments, and
   BOS key handling at `tests/claude-installer.test.mjs:8-18`.
2. Installer guidance referenced a removed forced-restart option. The final
   launcher permits replacement only in an interactive terminal, requires the
   exact `RESTART CHATGPT` confirmation, requests graceful termination, and
   fails closed when the application remains open at
   `scripts/launch-codex-with-bos.swift:66-71` and
   `scripts/launch-codex-with-bos.swift:141-165`. Current installation guidance
   describes this contract without the removed option.

No material findings remain.

## Architecture and security evidence

- Shared document caching stays in the application-neutral `bos-mcp-client`
  foundation. Authority scope is part of every request identity, immutable
  objects are content addressed, and a lease is required before the complete
  manifest and watermark commit at
  `source/platform/bos-mcp-client/scripts/document-cache.mjs:391-449`.
- Camp roster output remains an iCode vertical presentation rule. The skill
  requires exact student/camp evidence, one entry per attendance day, phone
  numbers outside the image, and inline PNG/SVG output at
  `source/verticals/icode/icode-class-operations/SKILL.md:75-102`.
- Bright Horizons workbook generation validates required evidence and date,
  child-count, and rate boundaries before loading the artifact runtime at
  `source/verticals/icode/icode-invoice-operations/scripts/build_bh_invoice.mjs:41-124`.
  Formula inspection and visual preview remain part of artifact verification at
  `source/verticals/icode/icode-invoice-operations/scripts/build_bh_invoice.mjs:222-259`.
- The live build smoke completes protocol initialization and the full tool
  contract before concurrently issuing the independent authenticated-context
  and bounded enrollment reads at
  `scripts/smoke-icode-director-query.mjs:271-380`. It reports only aggregate,
  credential-safe validation state at
  `scripts/smoke-icode-director-query.mjs:383-451`.
- Canonical package generation produced matching Codex, Claude, Copilot, and
  Gemini clients. Package validation found no customer-specific values,
  credentials, Python caches, or generated-source drift.

## Validation evidence

- `git diff --check`: passed.
- Canonical quick validation: four affected skills passed.
- `npm run check`: package structure, products, skills, and credential scan
  passed.
- `ICODE_SMOKE_TIME_ZONE=America/Denver npm run release:check`: passed.
- Live MCP smoke: 15 required tools discovered, one authenticated iCode scope,
  seven canonical enrollment rows, and complete student/family-phone schemas and
  values.
- Test suite: 116 passed, 0 failed.
- Release artifacts: all product archives and both customer ZIP names passed
  inventory and deterministic-build validation.

APPROVED
