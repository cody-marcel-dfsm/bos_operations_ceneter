---
name: my-crm-federation-operations
description: Compare, correlate, merge for presentation, and synchronize CRM records across authorized BOS sources using explicit identity confidence, field authority, versioned plans, idempotent commits, and durable eventual-consistency recovery.
---

# My CRM Federation Operations

## Compare and merge for presentation

1. Query selected sources independently and preserve every source result.
2. Correlate exact normalized identities under the product identity policy.
3. Keep ambiguous matches separate and show the conflicting evidence.
4. Build a merged view without changing source records. Attach field-level
   provenance and freshness.

## Synchronize from one source

1. Require the user to identify the authoritative source and fields or present
   a plan for confirmation when intent is ambiguous.
2. Read current target records and versions. Prepare explicit create/update
   targets, source-specific changes, idempotency keys, conflicts, unsupported
   operations, and declared provider guarantees.
3. Call the server plan operation. Apply only the exact unexpired plan and hash
   after the required mutation confirmation.
4. Report every source as pending, committed, failed, uncertain,
   recovery-scheduled, or reconciled. Cross-source completion is eventually
   consistent and carries no distributed atomicity claim.
5. Use the server status/reconciliation operation for uncertain results. The
   server owns durable retries. Refresh affected caches after terminal updates.

Never silently choose a field authority, overwrite an ambiguous identity, or
claim rollback without a verified compensating commit.
