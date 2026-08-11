# Canonical Codex marketplace layout review

- **Date:** 2026-08-11
- **Scope:** Installer paths, legacy-layout migration, extension storage,
  generated packages, customer installation guidance, and release 0.4.21.
- **Controlling sources:** `Vault/docs/architecture.md`,
  `Vault/decisions/2026-08-11-canonical-codex-marketplace-layout.md`, and
  `Vault/decisions/2026-08-11-education-center-product-identity.md`.

## Findings

No material findings remain.

The reviewed diff establishes
`~/.agents/bos-education-center-marketplace/` as the single physical Codex
marketplace root. Installer target resolution, extension creation, inventory,
release packaging, source guidance, and generated clients now use that model.
The two reviews describing the superseded split-directory model were removed.

The initial migration implementation removed the marketplace link before
moving its physical target. Review added rollback that restores the verified
link when the move fails, plus a regression test. Review also extended disabled
product retirement to inspect both the canonical marketplace directory and the
retired `~/plugins` directory.

Migration validates product metadata and the existing link target before
moving data. It stops when canonical and legacy physical directories both
exist. Customer settings, extension manifests, and unmanaged customer files
move with the product and remain preserved by later package applies.

## Validation evidence

- `npm run build:artifacts`: passed; generated two active products, eight
  release archives, and the versioned 0.4.21 customer installer.
- `npm run check:build`: passed, including execution from the packaged customer
  installer and presence of the shared layout helper.
- `npm run check`: package structure, generated parity, identity gates, and
  credential scan passed.
- `npm test`: 124 passed, 0 failed.
- `git diff --check`: passed.
- Migration success and rollback paths are covered by installer regression
  tests.

APPROVED
