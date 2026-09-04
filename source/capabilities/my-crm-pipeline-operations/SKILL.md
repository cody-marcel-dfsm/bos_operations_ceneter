---
name: my-crm-pipeline-operations
description: Inspect and change authorized CRM lead, opportunity, stage, owner, status, and next-action state across BOS-connected sources with per-source provenance and version checks.
---

# My CRM Pipeline Operations

Discover the app-owned provider-neutral CRM pipeline service and current API
contract through Lead Director's returned MCP contact. Let the service resolve
eligible source systems and normalize their vocabulary. Present only the
server-normalized lead, opportunity, stage, owner, status, value, and next-action
fields while preserving the source evidence returned with them.

For reads, retain server-returned opaque record handles, stage labels, versions,
and freshness. For changes, select one exact server-returned source handle and
record, require its current version, call one provider-neutral service
operation, use idempotency only when
its schema supports it, verify read-back, and refresh affected caches.

For a requested change across sources, prepare a synchronization plan with
explicit field authority and targets through `my-crm-federation-operations`.
Invoke it once only when the service advertises server-side orchestration.
Report its per-source commits and server-returned reconciliation state. The
server owns recovery and the client issues no per-source retry.
