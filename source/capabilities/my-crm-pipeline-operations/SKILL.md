---
name: my-crm-pipeline-operations
description: Inspect and change authorized CRM lead, opportunity, stage, owner, status, and next-action state across BOS-connected sources with per-source provenance and version checks.
---

# My CRM Pipeline Operations

Discover pipeline-capable sources through `crm_list_sources`. Keep each
provider's pipeline vocabulary in its adapter contract and normalize it into
lead, opportunity, stage, owner, status, value, and next action for presentation.

For reads, retain source-native identifiers, stage labels, versions, and
freshness. For changes, select one exact source record, require its current
version, apply one idempotent server-owned operation, verify read-back, and
refresh affected caches.

For a requested change across sources, prepare a synchronization plan with
explicit field authority and targets through `my-crm-federation-operations`.
Report per-source commits and recovery state.
