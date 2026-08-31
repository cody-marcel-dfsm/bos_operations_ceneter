# Plugin Console default-organization review

Date: 2026-08-31

## Scope

Reviewed the actual release `0.4.60` diff that makes an unqualified BOS Plugin
Console request select the validated shared default organization before
querying live plugin services, routes one named plugin into typed settings, and
requires the complete console/settings tool path during runtime verification.

## Findings

No material findings remain.

## Evidence

- The canonical console skill calls `bos_get_context`, validates an explicit
  override or the shared display-label preference, selects exactly one
  organization, and only then calls `bos_list_plugin_services` with that
  organization's opaque default-role context
  (`source/platform/bos-plugin-console/SKILL.md:33`).
- Missing, stale, malformed, or ambiguous preference state fails closed before
  the remote console data call (`source/platform/bos-plugin-console/SKILL.md:42`).
- Live-console failure cannot substitute a prior task, typed-settings cache,
  local inventory, or cross-organization summary
  (`source/platform/bos-plugin-console/SKILL.md:48`).
- The display label is revalidated against the current authenticated BOS
  context and remains selection context rather than authority
  (`Vault/specs/plugin-service-console.md:15`).
- The regression test exercises a validated default among three authorized
  organizations and verifies canonical/generated skill parity
  (`tests/plugin-console.test.mjs:50`, `tests/plugin-console.test.mjs:82`).
- Requests for all settings of one unambiguously named plugin route to typed
  settings, whose native client surface uses type-matched inline controls and
  creates no local renderer or UI service
  (`source/platform/bos-plugin-settings/SKILL.md:26`,
  `source/platform/bos-plugin-settings/SKILL.md:60`).
- The BOS runtime verifier requires the service-list, connection, enablement,
  settings-read, settings-prepare, settings-apply, and change-stream tools
  needed by the client workflow (`products/bos/product.json:50`).
- Generated Claude, Codex, Copilot, and Gemini skills are byte-equivalent to
  canonical source. No customer identity or credential appears in the tracked
  diff.

## Validation

- `npm run release:check` passed.
- Two active products regenerated for Codex, Claude, Copilot, and Gemini.
- Package structure, skills, and credential scan passed.
- The single-BOS MCP connection contract passed with zero violations.
- All 195 tests passed.
- `git diff --check` passed.

APPROVED
