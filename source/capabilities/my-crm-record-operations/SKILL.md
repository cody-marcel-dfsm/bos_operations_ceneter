---
name: my-crm-record-operations
description: Search, inspect, create, update, and manage CRM records through provider-neutral My CRM operations while preserving source identity, versions, duplicate checks, and provider transaction guarantees.
---

# My CRM Record Operations

Use `my-crm` for routing and the authenticated BOS MCP connection for
execution. BOS resolves the CRM subservice for each tool.

## Reads

1. Discover eligible sources and compile the normalized record query.
2. Use one source execution unit per source. Preserve successful results and
   report source-specific errors.
3. For `merged_view`, correlate only with the approved identity policy. Keep
   ambiguous records separate and show field-level provenance and conflicts.
4. Render origin, last update in local time, age, maximum age, and coverage.

## Creates and updates

1. Resolve the exact source and verify that the operation is advertised.
2. Search that source for duplicates before create when a stable identity value
   exists.
3. Supply the current source version and a fresh idempotency key when the live
   tool schema supports or requires them. Never invent unsupported parameters.
4. Report the source's declared transaction guarantee, commit reference,
   read-back verification, and final state.
5. Invalidate or refresh the affected query cache after a confirmed mutation.

Use multi-source synchronization only through `my-crm-federation-operations`.
Invoke delete only when a discoverable server operation explicitly supports it
and the user confirms the exact destructive target. The initial My CRM server
surface may omit delete.
