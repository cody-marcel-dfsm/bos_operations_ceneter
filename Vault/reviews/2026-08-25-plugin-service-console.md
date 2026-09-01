# In-memory BOS Plugin Console review

Date: 2026-08-25

## Findings

No material findings remain.

The earlier packaged renderer design was rejected and removed. The current
implementation is an instructions-only client package contract backed by
remote MCP structured content and server-owned actions.

## Evidence

- `Vault/docs/architecture.md:212-225` establishes the console as a memory-only
  client-content interaction, preserves the single BOS grant, assigns
  canonical state and actions to BOS, and prohibits a packaged renderer or
  machine-local service.
- `Vault/docs/DESIGN.md:167-194` describes the cross-product context source, remote
  `structuredContent`, remotely served MCP App resource, ephemeral component
  state, and the absence of local files, ports, processes, browsers, or
  services.
- `Vault/specs/plugin-service-console.md:5-41` assigns client, server, OAuth,
  provider, PO, and GO ownership and separates the BOS connection, plugin
  enablement, and provider readiness.
- `Vault/specs/plugin-service-console.md:43-89` requires an authenticated opaque
  context, server-side sorting, display-safe structured content, scoped opaque
  action selectors, and no credentials, raw IDs, records, or volatile URLs.
- `Vault/specs/plugin-service-console.md:91-114` makes the remote MCP App or
  native structured-content surface the primary presentation path and keeps
  component state ephemeral.
- `Vault/specs/plugin-service-console.md:116-150` routes connection and
  enablement through scoped remote tools and a revisioned, idempotent, audited
  PO/GO mutation that never changes software on the user's machine.
- `source/platform/bos-plugin-console/SKILL.md:8-41` requires direct rendering
  inside the client content window and prohibits filesystem inspection, local
  renderers, output files, downloads, ports, browsers, processes, and services.
- `source/platform/bos-plugin-console/SKILL.md:43-74` binds **Connect** and the
  **Enabled** toggle to the owning authenticated product route and preserves
  provider credentials in BOS-hosted secure surfaces.
- The canonical skill and all four generated client copies contain exactly
  `SKILL.md` and `agents/openai.yaml`; canonical/generated files compare
  byte-for-byte.
- `tests/plugin-console.test.mjs:13-56` verifies the instructions-only source
  topology, absence of packaged query-time artifacts, in-memory contract, and
  equivalent distribution to Codex, Claude, Copilot, and Gemini packages.
- Release validation generated both active products for all four clients;
  package structure, parity, and credential scanning passed; and all 134
  repository tests passed. Disabled My CRM inventory and pruning behavior were
  included in the validated product set.
- `git diff --check` passed.

## Architecture conclusion

The corrected design satisfies explicit authority, application neutrality,
server-owned state, PO/GO mutation boundaries, credential containment,
fail-closed execution, and canonical cross-client generation. Query execution
is confined to existing authenticated remote MCP connections and ephemeral
client content state. The server tools and remotely served interactive
component remain explicit rollout work in their owning service surfaces and are
not represented as deployed by this package change.

APPROVED
