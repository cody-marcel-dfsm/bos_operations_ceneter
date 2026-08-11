# Lead Director private marketplace placement review

## Scope

Review the classification, documentation, and installed Codex placement of the
private `ism-meta-ads` package associated with Lead Director's `meta-ads` skill
group.

## Architecture evidence

- `Vault/decisions/2026-08-11-canonical-codex-marketplace-layout.md` records one
  physical BOS marketplace tree and identifies `ism-meta-ads` as a Lead
  Director application skill-group package.
- The package is distinct from the disabled `video-ads` creative-generation
  product. It remains excluded from the public Education Center distribution.
- The active marketplace entry uses the local source
  `./plugins/ism-meta-ads`, matching the physical package directory under
  `~/.agents/bos-education-center-marketplace/plugins/`.
- The legacy `~/plugins/ism-meta-ads` path is absent after migration.
- The marketplace policy reports `ism-meta-ads@bos-education-center` as
  available and uninstalled. This preserves the package without activating its
  retired broad MCP route or its superseded write-operation declarations.
- Existing installer coverage proves that product convergence preserves
  compatible application-owned marketplace entries and plugin files.

## Validation evidence

- `jq` validated the marketplace JSON, unique plugin names, canonical source
  path, and `AVAILABLE` policy.
- `codex plugin list` resolved the package from the canonical marketplace path
  and reported `not installed`.
- `codex mcp list` contained no `ism-meta-ads` runtime registration.
- `npm run build:packages` generated the two active public products.
- `npm run check` passed package structure, skill, and credential validation.
- `npm test` passed 124 tests, including marketplace-entry preservation and
  convergence coverage.
- `git diff --check` passed.

## Findings

No material findings in the reviewed scope. Activation remains a separate
Lead Director runtime-contract migration to the named `leaddirector/meta-ads`
route and current read-only authority catalog.

APPROVED
