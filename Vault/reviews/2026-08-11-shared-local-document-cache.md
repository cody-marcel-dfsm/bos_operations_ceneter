# Shared local document cache review

- **Date:** 2026-08-11
- **Objective:** Give BOS-family runtime plugins one authority-safe local
  document cache and make steady-state source reads incremental.
- **Controlling sources:** `Vault/docs/architecture.md`,
  `Vault/docs/CONSTITUTION.md`,
  `Vault/specs/shared-local-document-cache.md`

## Findings

No material findings.

## Architecture evidence

- Architecture invariant 19 assigns the common cache to the packaged
  `bos-mcp-client`, requires authority-scoped indexes, shared content objects,
  cross-process leases, delta reads, and atomic watermark publication:
  `Vault/docs/architecture.md:130`.
- Constitution principle 13 requires live source authority and complete atomic
  publication before a watermark advances:
  `Vault/docs/CONSTITUTION.md:35`.
- The focused specification defines platform roots, authority and query keys,
  half-open coverage, catch-up sequencing, overlap handling, provider delta
  capabilities, minimum-necessary payloads, and validation gates:
  `Vault/specs/shared-local-document-cache.md:16`,
  `Vault/specs/shared-local-document-cache.md:40`,
  `Vault/specs/shared-local-document-cache.md:52`,
  `Vault/specs/shared-local-document-cache.md:86`,
  `Vault/specs/shared-local-document-cache.md:101`,
  `Vault/specs/shared-local-document-cache.md:122`.

## Implementation evidence

- The helper derives a product-independent platform cache root and accepts only
  an absolute managed override:
  `source/platform/bos-mcp-client/scripts/document-cache.mjs:66`.
- Canonical JSON digests make property order immaterial, and request
  normalization requires organization, installation, delegated role,
  application, skill group, provider, and account scope:
  `source/platform/bos-mcp-client/scripts/document-cache.mjs:40`,
  `source/platform/bos-mcp-client/scripts/document-cache.mjs:100`.
- Private directories, private files, atomic rename, and expiring exclusive
  leases coordinate local processes without publishing partial indexes:
  `source/platform/bos-mcp-client/scripts/document-cache.mjs:166`,
  `source/platform/bos-mcp-client/scripts/document-cache.mjs:183`,
  `source/platform/bos-mcp-client/scripts/document-cache.mjs:288`.
- Commit stores immutable content-addressed objects, applies tombstones, merges
  coverage, and advances the cursor, refresh watermark, and successful sync
  time in one manifest publication:
  `source/platform/bos-mcp-client/scripts/document-cache.mjs:374`,
  `source/platform/bos-mcp-client/scripts/document-cache.mjs:390`.
- The packaged skill requires live context before cache access and directs
  skills through cold snapshot, delta catch-up, busy-wait, commit, abort, and
  read behavior with minimum-necessary payloads:
  `source/platform/bos-mcp-client/SKILL.md:98`.
- Runtime product validation requires composition of the shared client skill:
  `scripts/lib/package-model.mjs:146`.

## Validation evidence

- `npm run build:packages`: passed; two active products regenerated for Codex,
  Claude, Copilot, and Gemini.
- `npm test`: passed; 113 tests.
- `node --test tests/document-cache.test.mjs`: passed; 6 focused tests covering
  root resolution, canonical fingerprints, future record windows, catch-up
  gaps, abort behavior, concurrency, deduplication, and authority isolation.
- Focused package composition and generated helper parity tests: passed.
- `node scripts/check-package.mjs`: passed package structure, product, skill,
  and credential scans.
- `git diff --check`: passed.
- Vault sync manifest verification: passed for the architecture, constitution,
  and shared cache specification.

## Remaining integration condition

BOS-routed and connected provider read tools must expose one of the specified
cursor, modified-time, conditional-resource, or conditional-snapshot contracts.
The versioned conditional snapshot is the bounded compatibility path; providers
should add record-level deltas to reduce changed-snapshot transfer further.

APPROVED
