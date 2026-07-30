# Implementation status

The local-first skill hierarchy and BOS package implementation are complete and
ready for client testing.

## Implemented

- Canonical layered skill sources under `source/platform`,
  `source/capabilities`, and `source/verticals`.
- Product manifests for BOS, iCode Operations Center, and Lead Director.
- One BOS-owned MCP runtime, with companion products consuming BOS through
  skill composition.
- Deterministic Codex, Claude, and Copilot package generation.
- Deterministic release archives and SHA-256 release manifests.
- Idempotent Codex installation with inspect, plan, apply, and verify modes.
- Safe adoption of compatible unmanaged installations.
- Managed upgrades, package-owned stale-path removal, conflict detection,
  marketplace reconciliation, and recoverable backups.
- Source-to-generated drift validation, skill validation, secret/path scanning,
  installer tests, broker compilation, and release checks.
- Lead Director repository specializations that explicitly compose the
  application-neutral BOS planning, implementation, review, authentication, and
  boundary foundations.
- Local BOS and iCode plugin installation through the personal marketplace.
- Retirement of superseded flat global BOS/iCode skills into a recoverable
  backup.

## Validated locally

- All package unit and installer tests pass.
- All generated Codex plugins pass the official plugin validator.
- BOS broker tests pass.
- Repeated release builds produce identical checksums.
- Fresh Codex tasks discover the namespaced `bos:*` skills and Lead Director
  repository skills.
- The BOS MCP is reachable through the installed BOS plugin and returns tenant
  context.
- A second installer apply is a no-op for a current managed installation.

## Client testing gates

The implementation is ready for these environment-specific smoke tests:

1. Install the generated Claude bundle in a clean Claude environment and verify
   skill discovery.
2. Install the generated Copilot bundle in a clean Copilot environment and
   verify repository instruction discovery.
3. Run one authenticated read-only BOS domain operation from a clean client.
4. Exercise an upgrade from version `0.2.0` to the next test version and confirm
   user-owned files remain unchanged.

These gates validate client environments; they require no additional package
architecture work.
