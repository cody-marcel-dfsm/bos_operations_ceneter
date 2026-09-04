---
name: my-crm-federation-operations
description: Compare, correlate, merge for presentation, and coordinate CRM records across authorized BOS sources using explicit identity confidence, field authority, discovered operations, source receipts, and transparent eventual-consistency recovery.
---

# My CRM Federation Operations

## Compare and merge for presentation

1. Invoke one provider-neutral CRM query and preserve every server-returned
   source result.
2. Use the service's returned federated records as the merged view. Preserve
   each record's source provenance, match confidence, and conflict evidence.
3. Never rerun identity matching, join records from separate source results, or
   strengthen the server's match confidence.
4. Present the merged view without changing source records. Attach field-level
   provenance and freshness.

## Synchronize from one source

1. Require the user to identify the authoritative source and fields or present
   a plan for confirmation when intent is ambiguous.
2. Read current target records and versions through one provider-neutral query.
   Select `crm.sync.plan` from the current discovered service and send one
   `{applicationId, targets}` request. Each target contains a task-local
   `targetId`, `create` or `update`, provider-neutral `changes`, a stable
   `idempotencyKey`, and only the current server-returned source or record
   handle plus required version. The plan operation is non-idempotent because
   every call creates a distinct expiring plan; issue it once and never replay
   it automatically.
3. Validate `lead-director-crm-sync-plan/v1` against the selected context,
   authority epoch, service, application, and exact target set. Present planned
   and rejected targets, source guarantees, sanitized field names, expiry, and
   `non_atomic_per_source`. Keep the raw plan handle out of visible output.
4. After explicit confirmation, select `crm.sync.apply` and invoke it once with
   exactly `{applicationId, planHandle}` before expiry. The server owns target
   fan-out, execution, recovery evidence, and idempotent provider calls. Never
   call a source once per target from the client. Require the apply operation
   to advertise `sideEffect: write` and `idempotent: true`.
   Bind confirmation to the exact application, opaque plan, current app/service
   discovery contract, and planned target set; any change requires a new plan
   presentation and confirmation.
5. Validate `lead-director-crm-sync-apply/v1` and report every source as
   committed, failed, or uncertain with its receipt and reconciliation action.
   Cross-source completion is eventually consistent and carries no distributed
   atomicity claim.
6. Preserve the service's returned reconciliation action for uncertain work.
   The server owns recovery and replay decisions; issue no per-target recovery
   calls and never replay synchronization planning or apply. Return complete,
   stable partial, or `user_action_required`, and refresh affected caches after
   terminal updates. My CRM adds no server persistence, recovery service, or
   background work.

Never silently choose a field authority, overwrite an ambiguous identity, or
claim rollback without a verified compensating commit.
