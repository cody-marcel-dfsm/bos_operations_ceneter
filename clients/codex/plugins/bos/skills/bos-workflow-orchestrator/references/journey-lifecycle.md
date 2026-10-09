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

For `payload_schema: null`, send no body and omit `Content-Type`. JSON `null`
and `{}` are bodies and are invalid. A non-lifecycle operation whose schema is
a closed empty object receives exactly `{}`. For a declared lifecycle payload,
send only fields accepted by that schema.

Registration contract v2 success has exactly `compiled: true`, `identity`, and
`actions: {start: <returned action>}`. Invoke that exact signed bodyless POST
`actions.start` through the context-binding adapter to begin execution.
Registration itself performs no journey work. A compile failure has no action;
correct its public findings before resubmitting. The runtime interpreter returns
`invoke_action` for successful v2 registration and `correct_bosl` for compile failure.
Registration contract v1 retains register-and-start and returns its authoritative
lifecycle envelope directly. Follow that envelope without replaying start; cached
v1 contracts remain compatible. Registration version and authentication identity
version are separate contracts.

The service owns progress:

- `not_started`: invoke the returned bodyless `start`;
- `awaiting_client`: satisfy the current instruction, then use its exact
  `complete` or `failed` action;
- `client_action_required`: validate the published public `error` and separate
  closed `resolution`, resolve only `resolution.goal` through current
  discovery, respect its approval scope, then invoke
  `resolution.after_success` verbatim;
- `step_completed` and `failure_caught`: invoke the returned bodyless `step`;
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
`failed` action with `user_stopped`, then repeat the original bodyless `start`.
Never stop work automatically. For creation rate limiting, verify HTTP
`Retry-After` equals `retry_after_seconds`, show the local eligible time, and
end the attempt. Only a later explicit user request can refresh discovery and
repeat registration.

The client never sends or stores an execution, graph, version, digest,
revision, occurrence, progress, retry, transition, action, or idempotency
identifier.
