# Callback journeys within API v1

Discover the current BOSL schema and the installed plugin's event descriptor
before authoring callbacks. A host without resource reads follows the
[inline authoring path](bosl-authoring.md) through the exact existing
registration contract link. Use a freshly advertised complete callback example
and validate it with that contract's schema and current source/operation
contracts; preserve its published binding and predicate shapes. Resolve a
missing schema or a public compile finding before resubmission. A sequence of
guessed HTTP422 payloads establishes no registered or Started journey.

Bootstrap declares named callbacks with a source,
its typed business inputs and a bounded match predicate. Source inputs use
literal or journey-input bindings. The first source is the configured Gmail
inbox; readiness and eligible match/deduplication fields come from its current
contract. Author no provider URL, handler, executable code or authority selector.

Before upload or Start, obtain the source's full current `api.contract.get`
response and matching read-only `service.describe` contact. Call
`checkCallbackSourceReadiness({adapter, sourceContract, contact})` from
`scripts/callback-source-readiness.mjs` through the existing BOS adapter. Keep
the pending graph and original registration request in memory; the source read
receives neither. A declared source and an available limits profile do not
establish a configured provider watch.

On `configure_source`, follow the source's returned recovery descriptor through
the existing discovered plugin-settings/provider-consent workflow. Preserve
the selected context and request. Refresh discovery and repeat the source GET
after configuration or reconnection, then resume the pending authoring when it
reports ready. If setup/recovery is unavailable, report that exact missing
capability and retain the pending intent. Never invent a setup POST, select
another mailbox/actor or create a listener. A source read reporting failure
does not establish a production policy failure, or permission to start.

Read [the failure model](journey-failure-model.md) when choosing error, expiry,
parked-work or irreversible-effect recovery behavior.

Ordinary nodes may execute before a server-owned `bosl.callbacks.await` node.
Its callback is a local literal. Optional narrowing correlation may use typed
outputs from an earlier node that dominates every path into the wait. Use
normal `next`/`transitions` for success and `catch` for the declared expiry or
unavailable-source error. Each canonical event is captured once per run;
downstream nodes reuse its returned reference. Later waits can capture fresh
events. Repeated delivery and completion preserve settled outcomes. An explicit
finite wait requires a `catch.cases` branch comparing `$error.code` with
`CALLBACK_WAIT_EXPIRED` and targeting a declared recovery node.

Use `bootstrap.activate_on` only when discovery advertises standing activation.
Registration compiles and reserves capacity; the returned explicit start
activates the standing workflow. Each matching event starts a private graph run
under the author's original grant and current permissions. Fully server-owned
graphs can progress unattended through the existing service worker. A graph
with client nodes returns interactive work through the existing client lifecycle.

Before offering or invoking explicit Start, call
`interpretJourneyResponse(response, {registrationRequest})` with the original
request returned by `buildJourneyRegistrationRequest`. Retain that request
through the compile response; the helper privately binds its unchanged serialized
document to the response identity and checks the complete callback/source rows,
wait-to-callback bindings and explicitly requested delivery/TTL terms. It returns
`presentation` and the original signed Start only after grant review succeeds.
`reviewCallbackGrant(submittedDocument, response.callback_report)` validates
one report row per submitted callback and wait and checks expiry recovery for every finite
granted TTL, including a profile default when local TTL was omitted. Correct and
resubmit a missing expiry branch before starting. An explicitly granted `null`
wait remains permanent. Show organization usage and limits, requested and
granted wait/delivery terms and material adjustments. Permanent logical waits
use `null` lifetime while delivery attempts and payload retention remain finite.
Treat restricted usage as restricted; show unlimited limits as unlimited.
The presentation retains every returned usage scope and submission reservation,
plus requested/granted queue, attempts, delay, retention and TTL even when they
are unchanged. Empty usage remains valid where the discovered contract permits it.

## Reservation renewal and policy recovery

An expired provisional capacity reservation preserves the uploaded definition
and its logical expiry. An explicit current returned Start reacquires full
capacity before provider preparation under current source/author checks and
unchanged effective public terms. Preserve that definition and returned action;
reservation expiry alone requires no re-upload. A private catalog revision with
the same effective public terms retains the grant. The client supplies no
revision selector, tier assignment, quota accounting or guessed reservation time.
Refresh an expired opaque control through its existing catalog/state recovery;
control expiry and actual terminal journey expiry retain their own rules.

Rejected Start may return HTTP409 `CALLBACK_LIMIT_REACHED` with only the public
error and no usage, identity or action. Show counts only when actually returned;
never fabricate zero or unlimited capacity. HTTP409 `CALLBACK_POLICY_CHANGED`
requires fresh policy review, complete journey resubmission/current grant review
and a fresh explicit Start when the user still wants that changed effect.
Use that exact code; add no shorthand alias. HTTP503
`CALLBACK_POLICY_UNAVAILABLE` preserves pending intent and follows current
discovered recovery; retryable does not supply a successor action or a numeric
retry budget. Policy values remain service-discovered.

## Profile reset and uncertain effects

Paid permanence depends on the current organization profile. Profile changes
retire old callback bindings while preserving already-settled lifecycle receipts:
completed or failed outcomes keep their existing terminal history and retention.
Keep the actual returned status, outcome/error and receipt; a downgrade supplies
no reason to relabel settled work as `CALLBACK_PROFILE_RESET`.

A confirmed reset fences pending old-generation work immediately. Its ordinary
state/Start can return HTTP200 `status: failed` with `CALLBACK_PROFILE_RESET`,
the retained receipt and no continuation action. Its error's retryable flag does
not revive that terminal lifecycle. A later Paid upgrade never restores the old
generation; new work requires complete upload and explicit Start under current
terms.

An already-claimed uncertain effect in pending work can remain HTTP202
`in_progress`. Observe
only its returned read-only state action under the ordinary retry timing while
BOS reconciles the original attempt. Preserve the confirmed or uncertain receipt;
dispatch no new effect, retry attempt or successor because a profile changed.
Once the original result or absence is known, consume the terminal reset failure.
The client creates no reset schedule, midnight rule or cancellation policy.
The submission callback report proves no completed reset or reset readiness;
its presentation helper supplies no such claim. Follow actual returned lifecycle
and discovered service behavior throughout.

Use the exact `app.describe.workflow_catalog.contract` link to discover the
catalog GET contract. Organization members can inspect the safe workflow
catalog. Only the author edits a definition. Invoke a control only when BOS
returns it for the current role. Role bindings apply separately to `start`,
`complete`, `step`, `failed`, `stop` and `retire`. A listed role group requires
every role in that group; separate groups for one verb are alternatives. BOS
rechecks current installed-app membership
when it returns and invokes each action. The actual operator is audited; the
author remains the source of execution authority. Follow exact opaque control
actions to inspect a private child run,
complete its typed client attestation, stop a selected run or stop/retire its
standing parent. The authored journey identity remains the public identity.

Consume `runs_truncated`, catalog truncation and failure-list truncation with
their exact returned `next_page` actions. Preserve each selected run's action
through completion and recovery. Refresh the discovered catalog after an expired
control action; use current context and the newly returned action. Stop of a
standing parent closes new admission while admitted runs drain. Stop of a child
fences its remaining work and reconciles actions already started. Settled
failure/catch outcomes remain final; a new attempt requires the supported new
registration and explicit start. Journey failures inherit journey permissions,
and protected source fields retain their own permission checks.

Use `buildIdentityV2WorkflowActionRequest` for opaque workflow controls. Keep
the current context handle in its existing header. The client supplies no
author credential, private execution id, claim, retry key or generated route.
