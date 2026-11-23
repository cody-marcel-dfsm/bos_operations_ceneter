# Journey lifecycle contract

Validate public envelopes with `scripts/journey-runtime-client.mjs`. Preserve
every returned action's exact `verb`, `method`, `href`, and `payload_schema`.
Treat its href as an opaque server-bound capability. Invoke the complete value
verbatim; never parse capability material, substitute route scope, or persist
it as an identifier.

For an identity-v2 BOS context, invoke every returned `start`, `complete`,
`step`, `failed`, and `state` action through
`buildIdentityV2JourneyActionRequest`. Supply the current fresh opaque
`context_handle` to that transport adapter at invocation time. The adapter adds
only `X-BOS-Context-Handle`; the action envelope, payload, cache, dependent
product, and presentation never receive or store the handle. Registration uses
the same current handle through its discovered deterministic HTTPS contract.
Legacy/v1 actions remain header-free through `buildActionRequest`.

For `payload_schema: null`, supply no caller payload. The BOS transport sends
POST actions as exactly `{}` with `Content-Type: application/json`; GET actions
send no body and omit `Content-Type`. The service also accepts an empty POST
body, while the client uses empty JSON to provide explicit request framing.
JSON `null`, arrays, scalars, nonempty objects, and caller-supplied lifecycle
payloads remain invalid. A non-lifecycle operation whose schema is a closed
empty object receives exactly `{}`. For a declared lifecycle payload, send only
fields accepted by that schema.

Registration API v1 success has exactly `compiled: true`, `identity`, and
`actions: {start: <returned action>}`. Invoke that exact signed POST without
caller payload
`actions.start` through the context-binding adapter to begin execution.
Registration itself performs no journey work. A compile failure has no action;
correct its public findings before resubmitting. The runtime interpreter returns
`invoke_action` for successful v1 registration and `correct_bosl` for compile failure.
API v1 includes all implemented lifecycle behavior and performs no implicit
start during registration. Retained authoritative lifecycle envelopes remain
interpretable for saved executions and replay. API versions, authentication
identity protocols, and package release numbers are separate contracts.

The service owns progress:

- `not_started`: invoke the returned `start` without caller payload;
- `awaiting_client`: satisfy the current instruction, then use its exact
  `complete` or `failed` action;
- `client_action_required`: validate the published public `error` and separate
  closed `resolution`, resolve only `resolution.goal` through current
  discovery, respect its approval scope, then invoke
  `resolution.after_success` verbatim;
- `step_completed` and `failure_caught`: invoke the returned `step` without caller payload;
- `in_progress`: wait the exact `retry_after_seconds`, invoke the sole exact returned `state` action
  as a bodyless GET, and continue until BOS returns an instruction or terminal
  result; and
- `completed`, `failed`, and `expired`: present the authoritative terminal
  result and perform no lifecycle retry.

When an action's transport outcome is unknown and no successor was received,
repeat that exact unresolved action. Once a successor exists, use only it. A
state read observes; it never advances the graph. Never replay `start`, `step`,
or an underlying server operation while BOS reports `in_progress`.

Use `user_stopped` only through the current advertised `failed` action when the
user chooses to end the journey. It bypasses catch. Expiry is terminal and has
no resume action. A later scoped not-found result supplies no deletion inference.

For active capacity, present only returned current-user stoppable choices,
obtain the user's selection, read its exact state action, use the returned
`failed` action with `user_stopped`, then repeat the original `start` without caller payload.
Never stop work automatically. For creation rate limiting, verify HTTP
`Retry-After` equals `retry_after_seconds`, show the local eligible time, and
end the attempt. Only a later explicit user request can refresh discovery and
repeat registration.

The client never sends or stores an execution, graph, version, digest,
revision, occurrence, progress, retry, transition, action, or idempotency
identifier.


## Discovered app binding and admission errors

Legacy helper calls retain their Lead Director defaults. For another published
app, obtain an independent current directory contact, the public application key
from `getApps`, and the scoped application description. Inside the BOS-owned
helper use `application: {public_application, contact, description}` as the fourth
argument option of `buildJourneyRegistrationRequest(contract, contextHandle,
document, {application})`. The helper validates agreement and the full existing v1
schema, then copies `contract.execution.uri`; it creates no route, native alias,
new API version or authority. Pass the same tuple to required source-readiness
checks. Context headers and credentials retain their existing host boundary.

Preserve the actual constructed request and supply it as `registrationRequest`
when interpreting its response or continuing `runJourneyRecovery`. For the exact
advertised canonical commercial errors, the result is `next: declared_public_error`
with the HTTP status and unchanged safe public error, before lifecycle parsing:

- `PAID_PLAN_REQUIRED`: HTTP 403 and `retryable: false`; payment is a prerequisite.
- `MCP_ENTITLEMENT_UNAVAILABLE`: HTTP 503 and `retryable: true`; current entitlement
  evidence is unavailable.

The actual validated request descriptor must declare the exact code/status/flag.
Missing context, undeclared or mismatched errors, malformed envelopes and obsolete
HTTP 402 variants fail closed. Existing authentication and special-error rules
retain their behavior. The result contains no invented action or timing. A valid
actual Retry-After header is retained only for a retryable error; its absence
provides no retry schedule. The recovery loop returns this blocked response
without waiting, logging in, paying or reissuing registration. Resume only through
current supported service recovery or an independently authorized fresh operation;
never replay a registration whose outcome is uncertain.
