# Issue #0005 dynamic MCP services Oracle review

Date: 2026-09-03

Product version: `0.4.80`

## Scope

Reviewed the complete actual working-tree diff for Issue #0005, including all
tracked and untracked paths, canonical architecture and constitution changes,
Issue History, the screenshot evidence record, current MCP specifications,
platform and domain source skills, generated Codex, Claude, Copilot, and Gemini
clients, product metadata, contract-field migration, validators, regression
tests, package ownership, repository boundaries, credential safety, and supplied
validation evidence.

## Findings

No material findings remain.

The first review rejected three stale-contract gaps. The updated candidate
corrects all three:

- `Vault/specs/federated-query-execution.md:72-90` now invalidates cached
  source/tool maps and refreshes live discovery when permission, role, plugin,
  capability, or provider changes may alter the dynamically resolved surface.
- `source/platform/bos-guided-support/references/support-state-machine.md:30-37`
  now refreshes live discovery after consent, and
  `source/capabilities/seo-improvement-loop/SKILL.md:8-14` treats a
  live-discovered descriptor as a schema signal rather than authority.
  Deterministic generation carries both corrections to supported clients.
- `tests/package-model.test.mjs:173-230` recursively scans product, source,
  generated-client, script, contract, and current Vault documentation and
  specification roots. It excludes historical issue records and detects
  qualified or line-wrapped obsolete static catalog/registry language and the
  retired contract field names.

## Screenshot receipt

The supplied PNG was visually inspected from its exact local artifact and its
SHA-256 was independently recomputed.

- File:
  `/var/folders/01/sn57hs8566145w17svn1c9780000gn/T/codex-clipboard-a4b10c26-270b-4f44-aad0-802977b3de81.png`
- SHA-256:
  `4add97a85255b6d32398b4269d386b8c13777ab94a5e55250bd21c7933db60d2`
- Product version: `0.4.80`.
- Surface: Codex/ChatGPT Desktop BOS plugin detail page.
- Observed state and actions: the marketplace long description says subservices
  add workflows through “a complete static operation catalog”; skill enablement
  toggles are visible. No authentication action is part of this evidence.

The hash matches
`Vault/evidence/dynamic-mcp-services/0.4.80-static-catalog-copy-correction.md`.
The screenshot proves the reported marketplace-copy defect and does not prove
the corrected source/package state.

## Verified correction and validation evidence

- `products/bos/product.json` and its generated marketplace manifests now
  describe one authenticated BOS connection with dynamic domain-specific MCP
  services and tooling.
- `contracts/single-bos-mcp-connection.v1.json:23-34`,
  `scripts/lib/single-bos-contract.mjs`, and their tests consistently use
  `post_authentication_tool_surface` and
  `tool_surface_authorization_semantics` with the expected dynamic invariant.
- The root BOS package remains the only transport owner; generated Codex uses
  one required credential-free `.mcp.json` binding to
  `https://dfsm.ai/mcp/apps/bos/platform`, and subservices add no connection.
- A fresh settled-tree `npm run release:check` passed deterministic generation,
  package structure and credential validation, the dynamic single-connection
  contract, and all 249 tests. A transient package mismatch observed during the
  review was caused by concurrent source generation; restarting the complete
  gate after the tree settled passed cleanly. `git diff --check` passed.
- The supplied screenshot hash matched exactly, and the current Vault index was
  queried for Issue #0005, dynamic service discovery, static catalog history,
  and federated-query prevention guidance.

## Prevention

Test stable transport identity separately from dynamic tool-surface
invalidation. The stale-contract scan must cover every active specification,
canonical source, and generated package, allow intervening qualifiers and line
breaks, and assert that permission, role, plugin, capability, provider,
installation, license, domain-service, and schema changes trigger live
rediscovery whenever they may change the exposed surface.

APPROVED
