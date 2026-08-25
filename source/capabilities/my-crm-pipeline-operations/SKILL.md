---
name: my-crm-pipeline-operations
description: Inspect and change authorized CRM lead, opportunity, stage, owner, status, and next-action state across BOS-connected sources with per-source provenance and version checks.
---

# My CRM Pipeline Operations

Discover pipeline-capable sources from the active CRM MCP tool manifest and
the package routing map. Keep each provider's pipeline vocabulary in its
discovered tool schema and normalize it into
lead, opportunity, stage, owner, status, value, and next action for presentation.

For reads, retain source-native identifiers, stage labels, versions, and
freshness. For changes, select one exact source record, require its current
version, call one discovered server-owned operation, use idempotency only when
its schema supports it, verify read-back, and refresh affected caches.

For a requested change across sources, prepare a synchronization plan with
explicit field authority and targets through `my-crm-federation-operations`.
Report per-source commits and task-local recovery state.
