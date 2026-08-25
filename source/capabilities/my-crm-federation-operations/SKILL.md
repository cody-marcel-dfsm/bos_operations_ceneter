---
name: my-crm-federation-operations
description: Compare, correlate, merge for presentation, and coordinate CRM records across authorized BOS sources using explicit identity confidence, field authority, discovered operations, source receipts, and transparent eventual-consistency recovery.
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
2. Read current target records and versions. Prepare a task-local plan with
   exact discovered create/update tools, source-specific changes, supported
   idempotency/version arguments, conflicts, unsupported operations, and
   declared provider guarantees.
3. Apply only the confirmed plan. Each tool call is an independent source
   transaction at that tool's existing guarantees.
4. Report every source as pending, committed, failed, uncertain, or reconciled.
   Cross-source completion is eventually consistent and carries no distributed
   atomicity claim.
5. Re-read uncertain targets and use existing source status/idempotency tools
   when discovered. Retry only where the existing contract proves safety.
   Refresh affected caches after terminal updates. My CRM adds no server
   persistence or recovery service.

Never silently choose a field authority, overwrite an ambiguous identity, or
claim rollback without a verified compensating commit.
