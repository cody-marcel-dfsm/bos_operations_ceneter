# Implementation status

The local-first skill hierarchy and BOS package implementation are complete and
ready for client testing.

## Implemented

- Canonical layered skill sources under `source/platform`,
  `source/capabilities`, and `source/verticals`.
- Product manifests for BOS and Education Center.
- One BOS-owned MCP runtime, with companion products consuming BOS through
  skill composition.
- Deterministic Codex, Claude, Copilot, and Gemini package generation.
- Idempotent Codex installation with inspect, plan, apply, and verify modes.
- Safe adoption of compatible unmanaged installations.
- Managed upgrades, package-owned stale-path removal, conflict detection,
  marketplace reconciliation, and recoverable backups.
- Immutable, read-only managed skill installation with recoverable replacement
  of locally modified package files.
- Customer-owned extension skill scaffolding, preservation, base-skill
  composition metadata, and version compatibility warnings.
- Natural-language customer extension management in every product, including
  typed schema-version-2 overlays, cross-client product metadata, atomic
  updates, protected-authority rejection, explicit version acceptance, and
  lossless legacy migration.
- Machine-local Codex developer linking with pre-link backups and idempotent
  canonical-source symlinks.
- Codex Education Center app binding through the registered
  `asdk_app_6a7cb1cc330c81918aa63d96aeeaba91` connection, with no direct
  `.mcp.json` entry.
- Source-to-generated drift validation, skill validation, secret/path scanning,
  installer tests, host-native connection checks, and credential-free local
  release checks.
- Lead Director repository specializations that explicitly compose the
  application-neutral BOS planning, implementation, review, authentication, and
  boundary foundations.
- Removal of legacy Lead Director BOS workflow copies and the redundant Lead
  Director plugin product.
- Local BOS and Education Center plugin installation through the `bos-education-center` marketplace.
- Retirement of superseded flat global BOS/Education Center skills into a recoverable
  backup.

## Validated locally

- All package unit and installer tests pass.
- The generated Codex plugin installs successfully and its registered app
  binding passes repository package validation. The bundled plugin-validator
  currently rejects `required`, including on OpenAI's own Gmail package, so it
  is not a usable release signal for this field.
- Host-native connection package tests pass.
- Repeated release builds produce identical checksums.
- Generated Claude runtime plugins contain one credential-free `.mcp.json`
  mirrored inline by `mcpServers`, so installation registers the connector and
  an eligible request presents authorization without a separately entered URL.
- Fresh Codex tasks discover the namespaced `bos:*` skills and Lead Director
  repository skills.
- ChatGPT displays Connect for Education Center BOS, discovers BOS OAuth, and
  reaches Cherry Creek organization and Director-role selection. The deployed
  BOS application then rejects the MCP agent handoff with `Authenticated BOS
  session is required`; server remediation remains the live release gate.
- The BOS application reports the Cherry Creek Calimatic SIS provider enabled.
- A second installer apply is a no-op for a current managed installation.

## Client testing gates

The package implementation is ready for these environment-specific smoke tests:

1. Install the generated Claude bundle in a clean Claude environment, verify
   that its packaged connector and **Connect** control appear automatically,
   complete BOS OAuth, and confirm skill discovery and one bounded read.
2. Install the generated Copilot bundle in a clean Copilot environment and
   verify repository instruction discovery.
3. Repair the deployed BOS MCP agent handoff so the authenticated web session
   completes OAuth authorization, then run `bos_get_context` and one bounded
   `education_center_list_enrollments` read from a clean Codex task.
4. Exercise an upgrade from version `0.4.0` to `0.4.1` and confirm managed
   files are replaced while customer extension files remain unchanged.

These gates validate client and deployed-server environments. The known Codex
MCP handoff failure remains server-owned; Claude connector registration is now
owned and validated by the runtime plugin package.
