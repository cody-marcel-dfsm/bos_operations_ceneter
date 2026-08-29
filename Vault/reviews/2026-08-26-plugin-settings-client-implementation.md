# Plugin settings client implementation review

## Scope

Reviewed the actual repository diff for the approved plugin-settings streaming
and synchronization client design. This verdict covers BOS Operations Center
package composition, skills, initialization ordering, local cache behavior,
generated clients, tests, and Vault sources. It does not approve or represent
the remote BOS service implementation.

## Findings

No blocking findings.

- Authority remains server-derived. The operation skill requires
  `bos_get_context` and uses its opaque `cache_scope` and `settings_epoch`
  (`source/platform/bos-plugin-settings/SKILL.md:17`). The cache hashes the
  opaque scope and never persists its raw value
  (`source/platform/bos-mcp-client/scripts/plugin-settings-cache.mjs:150`).
- Canonical ownership and PO/GO boundaries remain intact. The architecture
  assigns profiles, values, revisions, preparation, mutation, audit, and epochs
  to BOS while assigning research, confirmation, controls, recovery, and the
  display-safe replica to the client (`Vault/docs/architecture.md:232`).
- Cache writes accept only confirmed BOS reads, commits, or reconciliations and
  reject secret-shaped data
  (`source/platform/bos-mcp-client/scripts/plugin-settings-cache.mjs:19`,
  `source/platform/bos-mcp-client/scripts/plugin-settings-cache.mjs:277`). Cache
  envelopes are private, atomic, schema-bound, epoch-bound, freshness-checked,
  and fail closed on corruption
  (`source/platform/bos-mcp-client/scripts/plugin-settings-cache.mjs:175`,
  `source/platform/bos-mcp-client/scripts/plugin-settings-cache.mjs:214`).
- Initialization order is deterministic. Package generation composes local
  client settings before plugin settings and resumes the pending request
  (`scripts/lib/package-model.mjs:397`). Education Center declares both stages
  and includes the shared operation and initialization skills
  (`products/education-center/product.json:16`).
- Recommendations remain unconfirmed until one consolidated authorization;
  independent persistence uses the owning named product connection
  (`source/platform/bos-plugin-settings-initialization/SKILL.md:51`,
  `source/platform/bos-plugin-settings-initialization/SKILL.md:60`).
- Mutation recovery is bounded, preserves idempotency, reconciles uncertain
  outcomes before replay, and routes terminal failures to confirmed feedback
  (`source/platform/bos-plugin-settings/references/settings-operation-contract.md:28`,
  `source/platform/bos-plugin-settings/SKILL.md:67`).
- Deterministic tests cover cache isolation, canonical-only commits, secret
  rejection, corrupt-entry failure, epoch/schema invalidation, composition,
  workflow behavior, and generated-client parity
  (`tests/plugin-settings-cache.test.mjs:81`,
  `tests/plugin-settings-cache.test.mjs:142`,
  `tests/plugin-settings-cache.test.mjs:162`,
  `tests/plugin-settings-cache.test.mjs:184`,
  `tests/plugin-settings.test.mjs:12`,
  `tests/plugin-settings.test.mjs:35`,
  `tests/plugin-settings.test.mjs:66`).

## Validation evidence

- `npm run build`: generated two active products for Codex, Claude, Copilot,
  and Gemini.
- `npm run check`: package structure, source parity, product validation, skill
  validation rules, and credential scan passed.
- `npm test`: 149 tests passed; zero failed.
- Both new source skills passed the skill-creator quick validator.
- `git diff --check` returned no whitespace errors.
- `Vault/index/manifests/latest.json` includes the current architecture,
  plugin-settings design, and Plugin Console specification.

## External delivery dependency

The owning BOS service repository must still implement and independently review
the remote profile registry, initialization inventory and epoch, MCP read,
prepare, apply, and reconciliation tools, Router-to-PO-to-GO mutation path,
audit records, resource notifications, native MCP App resource, and Business
Hours reference profile. The client package fails closed until those live tools
and capabilities are discoverable.

APPROVED
