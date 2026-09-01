# Customer skill extension v2 review

## Objective

Review the implemented customer-owned skill extension model against the BOS
architecture, constitution, controlling specification, client packaging, and
release gates.

## Controlling sources

- `Vault/docs/architecture.md`
- `Vault/docs/CONSTITUTION.md`
- `Vault/specs/customer-skill-extensions.md`
- `Vault/docs/DESIGN.md`

## Diff review

- `source/platform/manage-customer-extension/SKILL.md:11-75` defines discovery,
  classification, host-specific storage, precedence, protected surfaces,
  keyed updates, compatibility handling, and lossless legacy migration.
- `source/platform/manage-customer-extension/scripts/manage-extension.mjs:7-140`
  validates the typed schema and rejects protected keys and directives.
- `source/platform/manage-customer-extension/scripts/manage-extension.mjs:212-301`
  performs staged replacement with recovery and rejects symbolic-link targets.
- `source/platform/manage-customer-extension/scripts/manage-extension.mjs:303-366`
  preserves prior values, requires explicit removal and compatibility
  acceptance, and migrates version-1 extensions without discarding their
  instructions.
- `scripts/build-packages.mjs:41-107` writes portable product metadata and
  packages the manager for Codex, Claude, and GitHub Copilot.
- `tests/customer-extension.test.mjs:27-235` exercises creation, replacement,
  removal, idempotence, fail-closed authority checks, version acceptance,
  migration, symbolic-link rejection, and packaged execution on every client.
- `source/platform/submit-feedback/SKILL.md:49-80` derives the active customer
  from trusted client context and includes sanitized typed customizations in
  authorized session feedback.
- `source/platform/submit-feedback/scripts/discover-customizations.mjs:7-88`
  requires a tenant-qualified lookup, filters by product and base skill, and
  omits tenant identifiers and local paths from its result.
- `tests/feedback-customization.test.mjs:15-88` verifies typed discovery and
  base-skill isolation; the extension tests also verify cross-tenant filtering.

## Architecture findings

The extension is customer-owned, base-qualified, typed, and lower precedence
than BOS authentication, tenant scope, tool authorization, package invariants,
and host instructions. It cannot supply credentials, endpoints, identities,
roles, or tool grants. Package upgrades preserve the extension and surface a
compatibility warning until the installed base version is explicitly accepted.
The implementation uses cross-platform Node and requires no client wrapper or
additional authentication method.

No blocking findings remain.

## Validation evidence

- Source skill validation: passed.
- Complete `npm run release:check`: 42 tests passed, 0 failed.
- Forward trigger test: a natural-language BOS planning update created the
  intended customer default and policy with no repository mutation or scope
  ambiguity.
- Deterministic two-build package comparison: passed.
- Release artifact: `dist/bos-operations-center-0.4.9.zip`.
- Release SHA-256:
  `b0e4c40968eba2871769338f32b82fb5da9b972d6a49268525e4f558bf28956b`.
- `git diff --check`: passed.

APPROVED
