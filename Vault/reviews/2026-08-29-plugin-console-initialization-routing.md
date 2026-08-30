# Plugin Console initialization-routing review

## Scope

Reviewed the actual working-tree diff that routes broad BOS plugin and server
settings requests to the memory-only Plugin Console before Education Center or
other product initialization.

## Findings

No material findings.

## Evidence

- `source/platform/bos-plugin-console/SKILL.md:8-17` classifies broad plugin and
  server-settings language as a console request and forbids customer or plugin
  settings initialization and cache access for that request.
- `source/platform/bos-plugin-settings/SKILL.md:17-28` routes broad requests to
  the console before product preflight, filesystem access, or settings-cache
  access, while preserving typed settings behavior for one named property.
- `scripts/lib/package-model.mjs:16-20,366-369` keeps root BOS connection,
  console, and runtime settings routing independent of subservice customer
  initialization during deterministic generation.
- `tests/plugin-console.test.mjs:44-73` verifies the screenshot request phrase
  and confirms that generated Education Center settings skills contain no
  product initialization preflight or customer-settings path.
- `tests/package-model.test.mjs:194-243` verifies the transformation boundary
  and cross-client Education Center generation behavior.
- `Vault/specs/plugin-service-console.md:10-20` and
  `Vault/docs/architecture.md:70-80,255-276` preserve the single root BOS
  connection, memory-only console, server-owned authority, and domain-workflow
  initialization boundary.
- `npm run check` passed package structure, product, skill, and credential
  validation.
- `npm test` passed all 186 tests.
- `git diff --check` passed.

The change performs no server mutation, introduces no credential or customer
data persistence, and preserves server-side tenant, installation, role, plugin,
capability, and provider authorization.

APPROVED
