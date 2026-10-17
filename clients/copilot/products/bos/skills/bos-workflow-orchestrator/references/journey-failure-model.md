# Choose a journey's failure behavior

Before authoring, decide what a failure means for each step and show that choice
in the explain plan. Read the operation's current errors, retry policy, receipt
and recovery contract. Author only the discovered BOSL grammar and operations.

| Intent | Supported authoring and recovery |
| --- | --- |
| Continue after an ancillary failure | Use a declared `catch` branch to an explicit recovery node, then the next useful step. Keep the failed result visible; supply only outputs that the recovery node actually produces. |
| Retry a temporary service/provider failure | Use the operation's service-owned retry and returned recovery contract. The client follows the exact state action and retry timing. A graph loop or repeated mutation does not establish permission to retry. |
| Wait for an event or human decision | Use a discovered server callback wait or a client-owned step with the existing typed completion/step/failure lifecycle. Persisted client work remains pending when the host leaves. Explain its granted lifetime and recovery path. |
| Stop on a required-step failure | Let the runtime's declared terminal failure apply, or route its published error to an explicit failure outcome supported by the discovered graph. Report the required work that failed. |

`on_error: resume/retry/park/fail` is a planning vocabulary from feedback. Those
field names are authored only if the current BOSL schema actually declares them.
Use the existing `catch` and transition grammar otherwise. A client acknowledgement
attests to the requested client work; it cannot upload business results, move a
server node or select a private execution.

## Irreversible steps and compensation

After a lost response to a send, call, create or update, retain the original
request and invoke only its returned state action. Reconcile the original
receipt before another effect. A retry, callback delivery or notification gives
no new authority to send again.

An email already sent cannot be unsent by a journey rollback. A corrective
message is a separate communication with its own discovered operation,
recipient/content review, consent and required approval. Describe that remedy
explicitly; never label an irreversible effect rolled back. Apply the same
reasoning to calls and external writes.

Resume from the service's current state and returned actions. Re-enter a step
only where its current operation contract establishes safe reuse/reconciliation
and the service offers that continuation. Another registration and explicit
start can create a new attempt; preserve prior confirmed-effect evidence and
review any repeated business effect before doing it.

## Callback waits and parked work

Read [callback journeys](callback-journeys.md) for source readiness, bootstrap,
matching, deduplication, requested/granted terms and failure-list permissions.
Discover each source independently of organization policy availability. A
missing source watch requires its existing configuration/recovery workflow.
Keep the pending graph and original registration request in memory while that
workflow runs; refresh discovery and repeat the source read before continuing.

Review the complete callback grant before Start. Every finite granted wait,
including a profile default, needs its declared `CALLBACK_WAIT_EXPIRED` catch
and a useful recovery target. An explicitly granted `null` wait has no automatic
local deadline. Worker attempts and source retention remain bounded. Explain
source-window loss and exhausted delivery attempts through the current
journey-owned failure and recovery actions.

Client work resumes through the existing client lifecycle when the intended
host is available. Claim background wake only for a discovered notification
transport and an independently verified host integration. Otherwise use the
service-returned state-read timing and retain the pending work.
