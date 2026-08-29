# Plugin settings operation contract

## Mutation worker input

Give the worker the complete operational context required for one update:

- exact prompt authorization or widget Apply event;
- named product connection and selected interactive role context;
- current confirmed snapshot, field schema, revision, and cursor;
- exact prepared draft reference and hash;
- stable client operation identity and idempotency key for the current draft;
- retry deadline and recovery policy; and
- required sanitized progress and terminal-result schemas.

Exclude credentials, tokens, raw authority IDs, raw provider payloads,
unrelated customer records, and hidden reasoning. Delegation carries the same
authenticated product connection and interactive user role. It grants no new
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
| Transport closure, timeout, or temporary unavailability | Reconnect the same endpoint, refresh tools and context, reconcile, and retry. |
| Rate limit | Honor the server retry time within the task deadline. |
| Stale tool or field schema | Refresh live schemas, rebuild from original intent, and retry once when the semantic change is identical. |
| Expired BOS context | Complete host-managed recovery for the same product, then resume once. |
| Provider authorization required | Complete the BOS-hosted provider flow and resume once. |
| Stale revision | Refresh. Rebase only when the target is unchanged and the authorized change set remains identical; otherwise return the conflict for user review. |
| Correctable client request shape | Rebuild from the live field schema and retry once. |
| Business validation | Stop and return field guidance. |
| Capability denial | Refresh context once, then return the authoritative denial. |
| Server invariant, malformed result, or repeated shape failure | Stop and return a feedback-ready bug result. |

Use at most five total apply attempts with full jitter over nominal delays of
1, 2, 4, and 8 seconds. A server retry time takes precedence within the task
deadline. Replay an exact draft with its original idempotency key. A refreshed
draft uses a linked new key only after the prior attempt is reconciled. Always
reconcile an uncertain mutation before replay.

## Progress and terminal result

Progress contains phase, attempt number, sanitized error class, recovery
action, and next retry time. The terminal result is one of:

- `committed`: canonical commit and local cache commit completed;
- `committed_with_cache_warning`: canonical commit completed and bounded local
  cache repair failed;
- `failed`: server confirms no commit and recovery is terminal; or
- `indeterminate`: reconciliation could not establish the canonical result.

For failure, include the requested change, last confirmed values, sanitized
error and support references, attempts, recoveries, reconciliation result,
cache state, and privacy-minimized feedback draft.
