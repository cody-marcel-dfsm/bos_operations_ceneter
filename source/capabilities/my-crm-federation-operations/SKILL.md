---
name: my-crm-federation-operations
description: Compare, correlate, merge for presentation, and coordinate CRM records across authorized BOS sources using explicit identity confidence, field authority, discovered operations, source receipts, and transparent eventual-consistency recovery.
---

# My CRM Federation Operations

## Compare and merge for presentation

1. Query selected sources independently and preserve every source result.
2. Correlate only one exact normalized email shared across distinct sources.
   Treat exact normalized phone as supporting evidence.
3. Keep duplicate candidates within one source, conflicting emails, and
   transitive matches separate and show the conflicting evidence.
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
5. Perform one verification read for an uncertain target and use existing
   source status/idempotency tools when discovered. Perform at most one replay
   where the existing contract proves safety, then return complete, stable
   partial, or `user_action_required`. Refresh affected caches after terminal
   updates. My CRM adds no server persistence, recovery service, or background
   work.

Never silently choose a field authority, overwrite an ambiguous identity, or
claim rollback without a verified compensating commit.
