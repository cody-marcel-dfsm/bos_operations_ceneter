# Default organization selection review

## Scope

Reviewed the actual repository diff for the shared BOS default-organization
preference, organization-before-role selection, plugin initialization order,
generated client parity, and the local validation evidence.

## Findings

No material findings remain.

## Evidence

- `source/platform/bos-mcp-client/SKILL.md:161` selects one organization before
  a role, gives an explicit request precedence over the saved default, blocks
  implicit multi-organization fan-out, and permits bounded cross-organization
  work only when the user explicitly requests it.
- `source/platform/bos-mcp-client/scripts/client-preferences.mjs:15` limits the
  persisted schema to a display label and timestamp. Lines 29-59 normalize and
  validate labels against the current authorized inventory. Lines 110-124 use
  private directories, mode `0600`, and atomic replacement. Lines 126-184
  reject unknown fields, revalidate every read, and commit only a currently
  available organization label.
- `source/platform/authentication-context-integrity/SKILL.md:29` makes
  organization selection precede role selection and keeps the preference out
  of authority.
- `source/platform/bos-plugin-settings-initialization/SKILL.md:24` establishes
  or repairs the default organization before selecting its unique default role
  and before calling the organization-scoped settings inventory.
- `source/verticals/education-center/education-center-customer-initialization/SKILL.md:23`
  includes **Default BOS organization** in the consolidated recommendation;
  lines 129-140 commit and verify the accepted preference before continuing to
  plugin-settings initialization.
- `source/platform/bos-plugin-settings-initialization/references/initialization-contract.md:11`
  records authentication, consolidated confirmation, preference commit, role
  selection, and server plugin-settings ownership in their required order.
- `Vault/specs/role-aware-mcp-client.md:43` records selection precedence,
  fail-closed behavior, request-local overrides, and the prohibition on
  implicit cross-organization execution.
- `tests/client-preferences.test.mjs:19` covers platform-native storage,
  authorized-label validation, private file mode, unavailable saved defaults,
  and rejection of authority-shaped unknown fields.
- `tests/package-model.test.mjs:543` verifies that the canonical rule and helper
  ship across BOS-family clients and that generated copies equal the canonical
  helper.
- `tests/plugin-settings.test.mjs:55` verifies the initialization gate,
  single-organization shortcut, multi-organization confirmation, fail-closed
  behavior, role selection, and generated helper presence.

## Validation

- `npm run release:check` — passed for release `0.4.58`, including regenerated
  Codex, Claude, Copilot, and Gemini packages.
- `npm run build:packages` — passed; generated two active products for Codex,
  Claude, Copilot, and Gemini.
- `npm run check` — passed, including package parity, customer-neutral source,
  and credential scanning.
- `npm test` — passed, 192 tests.
- `npm run contract:check` — passed with zero single-BOS-connection violations.
- `git diff --check` — passed.
- Live `bos_get_context` evidence confirmed several organizations, a separate
  default role inside each organization, and the requested organization label.
- The shared local preference commit returned `state: committed`; the resulting
  file is mode `0600` and contains schema `bos-client-preferences/v1`.

APPROVED
