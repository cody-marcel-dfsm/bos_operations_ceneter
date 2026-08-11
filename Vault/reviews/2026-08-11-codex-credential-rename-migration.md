# Codex credential-preserving rename migration review

- **Date:** 2026-08-11
- **Scope:** Preserve an existing Codex BOS credential binding during the
  Education Center identifier migration without copying or persisting the
  bearer.
- **Controlling sources:** `Vault/docs/architecture.md`,
  `Vault/decisions/2026-08-11-education-center-product-identity.md`, and
  `Vault/specs/named-mcp-application-group-routing.md`.

## Findings

No material repository findings remain.

The prior installer forced the newly declared credential variable even when
the active Codex host already contained the same product credential under its
pre-rename binding. That created an unnecessary configuration requirement.
The implementation now inspects the declared binding first, checks the narrow
Education Center compatibility alias only when the declared binding is absent,
and registers the existing binding name without copying, displaying, or
persisting the bearer.

Fresh installations continue to use `EDUCATION_CENTER_BOS_API_KEY`. Other
products receive no compatibility alias, and the immutable application/group
route remains unchanged.

## Validation evidence

- A focused installer test proves the active pre-rename binding is reused and
  the declared binding remains the default.
- `npm run build:artifacts`: passed and produced deterministic archives.
- `npm run check:build`: passed.
- `npm run check`: package structure, generated parity, and credential scan
  passed.
- `npm test`: 121 passed, 0 failed.
- `git diff --check`: passed.
- Vault index synchronization completed after the architecture and decision
  updates.

## External runtime state

The credential migration removes the client-side missing-key condition. The
production `/mcp/apps/leaddirector/education-center` route still requires its
own server deployment before the live tool-group smoke can pass.

APPROVED
