# Managed extension directory review

- **Date:** 2026-08-11
- **Scope:** Align customer-extension instructions with the installed BOS Codex
  product directory and installer preservation behavior.
- **Controlling sources:** `source/platform/manage-customer-extension/SKILL.md`,
  `scripts/create-extension.mjs`, and `scripts/install-package.mjs`.

## Findings

No material findings remain.

The prior skill listed generic Codex user scope before the BOS-managed product
scope, allowing an agent to report `~/.agents/skills` for an installation whose
active products live under `~/plugins`. The corrected workflow checks for
`<product-root>/.bos-package-state.json` first and resolves customer extensions
to `<product-root>/skills/<base-skill>-<tenant-key>`.

The resolved path matches `scripts/create-extension.mjs:25-33`, extension
discovery in `scripts/install-package.mjs:933-965`, and the preservation test in
`tests/installer.test.mjs:833-860`. Documentation now distinguishes the active
product tree from `~/.agents` marketplace state.

## Validation evidence

- Skill Creator `quick_validate.py`: passed.
- Direct manager inspection resolved the Cherry Creek class-operations
  extension to
  `~/plugins/education-center/skills/education-center-class-operations-cherry-creek`.
- `npm run build:artifacts`: passed and regenerated all client copies.
- `npm run check:build`: passed.
- `npm run check`: passed.
- `npm test`: 121 passed, 0 failed.
- `git diff --check`: passed.

APPROVED
