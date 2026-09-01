# Local Oracle review: ownership correction and skill-exposure RCA

Date: 2026-09-01

## Scope

Review the completed Operations Center diff that moves Oracle from the
distributed BOS product into `.agents/skills/oracle`, and re-review the
skill-exposure RCA using this repository's current local Vault and host evidence.

## Findings

No material findings remain.

The earlier claim that the RCA had been reviewed by the correct Oracle was
invalid: the task used the packaged `bos:oracle` skill. The technical RCA has
now been re-reviewed through the repository-local Oracle workflow.

## Repository evidence

- `.agents/skills/oracle/SKILL.md:1-60` defines a repository-maintainer review
  workflow that synchronizes and reads this project's local Vault.
- `AGENTS.md:49-61` assigns Operations Center review authority to the local
  Oracle and excludes it from customer packages.
- `products/bos/product.json:22-45` omits `platform/oracle` from BOS product
  composition. The former canonical packaged source and all generated Codex,
  Claude, Copilot, and Gemini Oracle copies are deleted by deterministic
  generation.
- `Vault/docs/architecture.md:207-218` and `Vault/docs/architecture.md:348-361`
  establish local maintainer ownership and generated-package exclusion.
- `Vault/specs/oracle-and-vault.md:10-31` makes the local Vault, actual diff,
  and validation evidence the review authority.
- `tests/package-model.test.mjs:2085-2113` prevents the packaged Oracle from
  returning to the product manifest, canonical packaged source, or generated
  clients.

## RCA evidence

- The screenshot-era desktop log records `platform` MCP startup failure as
  `reauthenticationRequired`; a later captured task records
  `invalid_grant: Refresh token replay detected`. This supports the historical
  OAuth-grant failure classification.
- The current desktop log records HTTP 404 `Connector not found` for
  `asdk_app_6a932992592081919cdc88c60e4ff2dd`. This supports the current
  registered-app identity availability classification.
- `clients/codex/plugins/bos/.codex-plugin/plugin.json:8-30` still declares the
  BOS workflow skills and registered app binding independently.
- `scripts/verify-codex-runtime.mjs:151-185` evaluates the app binding,
  callable catalog, and missing tools independently. The runtime result showed
  a current package/app declaration and zero discovered tools.
- `Vault/specs/single-bos-mcp-connection.md:22-55` distinguishes the registered
  app display binding, unusable OAuth grant, and callable runtime lifecycle.

## Validation

- Local Oracle skill validation: passed.
- `npm run release:check`: passed after the ownership regression correction;
  package generation, credential scan, single-connection contract, and all 210
  tests passed.
- `git diff --check`: passed.
- Vault synchronization and grounded query: passed.

## Conclusion

Oracle is now owned by this repository, reads this repository's local Vault,
and is absent from BOS customer packages. The original RCA's technical causal
chain remains supported. Its prior Oracle-review claim is superseded by this
local review.

APPROVED
