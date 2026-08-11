# Customization storage and marketplace path review

- **Date:** 2026-08-11
- **Scope:** Distinguish product-wide tenant settings from per-skill extensions
  and canonicalize marketplace symlink paths in extension management.
- **Controlling sources:** `source/platform/manage-customer-extension/SKILL.md`,
  `source/platform/manage-customer-extension/scripts/manage-extension.mjs`, and
  `scripts/install-package.mjs`.

## Findings

No material findings remain.

The marketplace exposes `plugins/education-center` as a symlink to the managed
`~/plugins/education-center` product. Direct filesystem evidence confirms that
`config/customer-settings.json` reached through either access path is the same
file. The manager now resolves existing symlinked product and extension roots
to their physical paths before inspection, validation, or mutation.

The skill and installation guidance now distinguish these storage types:

- `config/customer-settings.json` is the preserved product-wide tenant
  settings overlay;
- `config/customer-settings.template.json` is package-owned defaults and
  schema; and
- `skills/<base-skill>-<tenant-key>/.bos-extension.json` plus its sibling
  `SKILL.md` form a customer-owned per-skill extension after one is created.

The current Education Center installation has zero per-skill extension
manifests. The visible files are tenant settings. A per-skill extension
directory will appear after one is created.

## Validation evidence

- Skill Creator `quick_validate.py`: passed.
- Focused customer-extension tests: 9 passed, 0 failed.
- Marketplace-symlink regression test proves the manager reports the physical
  product path.
- `npm run build:artifacts`: passed and regenerated all client copies.
- `npm run check:build`: passed.
- `npm run check`: passed.
- `npm test`: 122 passed, 0 failed.
- `git diff --check`: passed.

APPROVED
