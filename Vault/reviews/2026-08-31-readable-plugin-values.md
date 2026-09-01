# Readable plugin values review

Date: 2026-08-31

## Scope

Reviewed the actual repository diff that replaces generic structured-result
presentation with visible, readable plugin-console and plugin-settings values,
real native controls when mounted, and an immediate conversational fallback.

## Findings

No material findings remain.

## Evidence

- The Plugin Console treats a generic **Structured output** card as unsupported,
  renders the complete table directly when no component is mounted, expands
  nested properties, linkifies display-safe contact values, and distinguishes
  real host controls from printed action labels
  (`source/platform/bos-plugin-console/SKILL.md:57-86`).
- Typed plugin settings require actual field labels and values to be visible,
  prohibit generic or raw payload presentation, preserve server field order,
  and render URLs, email addresses, phone numbers, objects, arrays, enums,
  schedules, and empty values through readable type-aware forms
  (`source/platform/bos-plugin-settings/SKILL.md:69-97`).
- The fallback remains memory-only and uses exact server-authorized
  conversational actions. It introduces no renderer, file, browser, localhost
  process, credential path, authority selector, or mutation bypass
  (`source/platform/bos-plugin-settings/SKILL.md:60-67`,
  `source/platform/bos-plugin-console/SKILL.md:88-90`).
- The architecture and owning design/specification now define visible values as
  the completion invariant while preserving server-owned state, the single root
  BOS connection, remote MCP App ownership, and natural-language fallback
  (`Vault/docs/architecture.md:280-318`,
  `Vault/specs/plugin-service-console.md:157-172`,
  `Vault/docs/plugin-settings-streaming-sync-design.md:456-499`).
- Focused regressions require readable values, clickable safe links, expanded
  nested data, real control semantics, and rejection of a generic structured
  result as the user-facing surface (`tests/plugin-console.test.mjs:19-62`,
  `tests/plugin-settings.test.mjs:45-82`).
- Deterministic generation reproduced the canonical skills across Codex,
  Claude, Copilot, and Gemini packages. The complete release check passed package
  structure, credential scanning, the single-BOS connection contract, and all
  195 tests.

## Remaining delivery boundary

Clickable mutation buttons and toggles require the remote MCP App or a native
host component to be mounted. A host exposing only its generic tool-result
viewer now receives the complete readable conversational table, clickable safe
value links, and exact authorized requests instead of a misleading component
claim.

APPROVED
