# Native plugin settings controls review

Date: 2026-08-31

## Scope

Reviewed the actual repository diff that routes a named-plugin settings request
directly to typed settings, requires Codex Agent Harness native inline controls,
and expands runtime verification to cover the complete settings tool path.

## Findings

No material findings remain.

## Evidence

- The canonical settings skill resolves an explicit or validated default
  organization, obtains one opaque plugin selector from the live service
  inventory, and stops on zero or ambiguous matches
  (`source/platform/bos-plugin-settings/SKILL.md:34`).
- The named-plugin request opens the typed settings workflow directly and does
  not render the Plugin Console as an intermediate view
  (`source/platform/bos-plugin-console/SKILL.md:20`,
  `source/platform/bos-plugin-settings/SKILL.md:37`).
- Codex Agent Harness owns an in-memory native settings table with inline
  server-typed controls and Apply/Discard actions. The workflow creates no UI
  file, renderer, localhost process, browser session, or separate UI service
  (`source/platform/bos-plugin-settings/SKILL.md:60`).
- The BOS product requires service inventory, settings read, draft preparation,
  mutation, change-sync, connection, and enablement tools in runtime
  verification (`products/bos/product.json:50`). The Education Center product
  separately requires its settings-initialization inventory tool
  (`products/education-center/product.json:25`).
- The Codex runtime regression rejects a catalog missing settings read,
  preparation, or mutation tools
  (`tests/codex-runtime-verification.test.mjs:164`).
- Canonical and generated client skills are regenerated from the same source,
  preserve the single root BOS connection, and contain no customer identity or
  credential material.

## Validation

- `npm run release:check` passed.
- Two active products regenerated for Codex, Claude, Copilot, and Gemini.
- Package structure, product manifests, skills, and credential scan passed.
- The single-BOS MCP connection contract passed with zero violations.
- All 195 tests passed, including the missing-native-settings-tools regression.
- `git diff --check` passed.
- The Vault index was regenerated from the current architecture, design, spec,
  and review sources.

APPROVED
