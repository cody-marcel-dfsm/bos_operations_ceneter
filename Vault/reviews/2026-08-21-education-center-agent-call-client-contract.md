# Education Center Agent Call client contract review

Date: 2026-08-21
Scope: Agent Call capability source, Education Center composition, generated
client parity, named MCP server contract, and focused package tests.

## Findings

No material findings remain in the scoped BOS Operations Center diff.

## Evidence

- The architecture assigns reusable workflows to `source/capabilities/`,
  versioned composition to `products/`, business mutations and credentials to
  the BOS service, and generated packages to the build
  (`Vault/docs/architecture.md:8-21`, `Vault/docs/architecture.md:46-51`).
- The skill resolves one server-derived context, selects exactly one lead,
  supplies only a lead identifier and stable idempotency key, uses provider
  recovery, reconciles uncertain outcomes, and fails closed
  (`source/capabilities/agent-call-operations/SKILL.md:8-53`).
- The capability contract excludes every client-supplied authority dimension,
  requires a dedicated PO plus GO persistence, and requires role/plugin
  authorization and duplicate-dispatch prevention
  (`source/capabilities/agent-call-operations/references/capability-contract.md:7-53`).
- The named MCP specification classifies the tool as an explicit mutating
  action and requires server-derived scope, FSM validation, locking, audit, and
  idempotent reconciliation
  (`Vault/specs/named-mcp-server-implementation.md:140-189`).
- The Education Center product composes the capability for Codex, Claude,
  Copilot, and Gemini (`products/education-center/product.json:12-38`).
- The package test verifies composition and the selection, scope-minimization,
  execution-role, and replay invariants
  (`tests/package-model.test.mjs:117-149`).

## External server dependency

The adjacent Lead Director server already implements the private Agent Call
provider dispatch with installation and lead metadata
(`lead_director/backend/platform_orchestration/automated_outreach_service.py:2405-2495`).
Its MCP catalog and Education Center alias/allowlist currently omit the public
Agent Call operation
(`lead_director/backend/platform_orchestration/agent_operation_catalog.py:2003-2075`,
`lead_director/backend/platform_orchestration/mcp_operational_profiles.py:34-76`,
`lead_director/backend/platform_orchestration/mcp_operational_profiles.py:156-233`).
That owning repository must implement, test, approve, deploy, and smoke the
server contract before the client workflow can execute live.

## Validation

- Agent Call skill validation: passed.
- Package structure, product, credential, and customer-neutrality scan: passed.
- Deterministic cross-client package build: passed.
- Release archive build and output validation: passed; eight archives created.
- Full repository suite: 125 passed, 0 failed.
- Vault index synchronization: passed.

APPROVED
