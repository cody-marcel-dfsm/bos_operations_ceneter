# Plugin settings operation contract

## Mutation worker input

Give the worker the complete operational context required for one update:

- exact prompt authorization or widget Apply event;
- BOS connection and server-validated scoped-grant status;
- current confirmed snapshot, field schema, revision, and cursor;
- exact prepared draft reference and hash;
- the exact prepared draft reference and public approval evidence required by
  the current schema;
- the exact current request schema; and
- required sanitized result schema.

Exclude credentials, tokens, raw authority IDs, raw provider payloads,
unrelated customer records, and hidden reasoning. Delegation carries the same
authenticated BOS connection and interactive user role. It grants no new
capability and never uses plugin `run_as_role`.

## Expected server result

A committed result contains the complete confirmed snapshot, new revision,
change cursor, operation reference, and settings epoch. An unsuccessful result
contains a sanitized error class and code, retryability, public message,
operation and support references, and applicable field errors, retry time,
recovery action, current revision, or schema fingerprint.

## Recovery

| Failure | Action |
| --- | --- |
| Transport closure, timeout, or temporary unavailability | Refresh the same connection and follow the exact returned state action when present; otherwise report the uncertain result without replaying the mutation. |
| Rate limit | Report the service-returned eligible time; do not schedule or replay the mutation. |
| Stale tool or field schema | Refresh live schemas and rebuild the draft from original intent. A materially changed draft requires current approval. |
| Expired or revoked BOS grant | Complete host-managed recovery for the same BOS connection, then follow the exact returned continuation action. |
| Provider authorization required | Complete the BOS-hosted provider flow, then follow the exact returned continuation action. |
| Stale revision | Refresh. Rebase only when the target is unchanged and the authorized change set remains identical; otherwise return the conflict for user review. |
| Correctable client request shape | Rebuild from the live field schema as a corrected semantic request. |
| Business validation | Stop and return field guidance. |
| Capability denial | Revalidate the scoped grant and return the authoritative denial. |
| Server invariant or malformed result | Stop and return a feedback-ready bug result. |

Use only service-returned retry timing and actions. On an unknown mutation
outcome, invoke the returned bodyless state action until BOS returns a terminal
result. Never replay the setting mutation or send a client idempotency key,
attempt identity, retry counter, or reconciliation state. A changed draft is a
new semantic request and requires its current approval contract.

## Authoritative result

The service result may contain phase, sanitized error class, a continuation or
state action, and an eligible observation time. The authoritative result is one
of:

- `committed`: canonical commit and local cache commit completed;
- `committed_with_cache_warning`: canonical commit completed and bounded local
  cache repair failed;
- `failed`: server confirms no commit and recovery is terminal; or
- `indeterminate`: reconciliation could not establish the canonical result.

For failure, include the requested change, last confirmed values, sanitized
error and support references, authoritative service result, cache state, and a
privacy-minimized feedback draft. The client does not create or manage an
attempt counter, retry schedule, reconciliation decision, or execution state.
