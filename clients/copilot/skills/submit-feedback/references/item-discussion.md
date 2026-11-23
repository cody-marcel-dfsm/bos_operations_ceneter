# Feedback item connection and handoff

Use this procedure when the user asks to connect with another participant, work an item together, stay locked in, or receive a design handoff. The existing comment and journal contracts carry the exchange; the handshake adds no API or wire-frame fields.

## Establish the connection

1. Follow bos-mcp-client to obtain fresh authorized contexts and discover the exact item operations on the existing signed-in BOS connection. Read the selected item, all required comment/history pages and referenced media before acting.
2. For a host whose BOS credential stays in its MCP binding, use feedback.items.wait only when that exact name and current schema appear in bos_list_context_tools. Invoke it through bos_execute with the same fresh context handle and schema-valid arguments. No shell socket, bearer extraction, separate login or invented route is needed.
3. Start with feedback_id and wait_seconds: 0, omitting cursor. The returned journal establishes the current item cursor. For an actual admitted host socket, use the facade below, send its discovered subscribe frame and receive the initial journal instead. A connection establishes transport readiness; it does not prove the other participant is present.
4. Keep the active task receiving. Native waits use the actual returned cursor and a positive wait_seconds within the published maximum (currently25). An empty journal at the deadline retains that cursor and continues the same authorized active discussion; it is not a peer response or task completion. Copy the next returned cursor only after consuming that frame. Honor cancellation, actual terminal outcome, denials, service rate limits and supported host lifetime.

Synthetic bos_execute examples omit its context_handle wrapper; obtain that handle fresh and replace the illustrative item and cursor with actual returned values.

```json
{"tool_name":"feedback.items.wait","arguments":{"feedback_id":"FB-2099-000001","wait_seconds":0}}
```

The initial result's journal supplies the cursor used by the next wait:

```json
{"type":"journal","feedback_id":"FB-2099-000001","cursor":"fj1:FB-2099-000001:1:0","comments":[{"event_id":"00000000-0000-4000-8000-000000000001"}],"history":[],"earlier_history":false}
```

```json
{"tool_name":"feedback.items.wait","arguments":{"feedback_id":"FB-2099-000001","cursor":"fj1:FB-2099-000001:1:0","wait_seconds":25}}
```

## Peer handshake and design request

- Post one same-item comment identifying the current task's role and requested outcome, and ask the named peer to acknowledge this exchange. When a design is expected, request its complete intended design or an exact authorized accessible document reference and revision in that same comment. Use a parent_comment_id copied from this item's fresh comments when replying.
- Read back the saved comment and its attributed event. A comments.create committed acknowledgment proves storage. A substantive peer response that answers the current request, including delivery of the requested design, fulfills peer acknowledgment; require no magic ACK token, made-up JSON or extra approval. Correlate by the current item, content and available parent/revision references; a meaningful response can answer with a different reply parent. Wait for such an actual peer reply on this item; an old locked-in statement, matching actor identity, item status or your own echoed comment proves no current peer acknowledgment. A shared actor may represent separate tasks; use the acknowledged exchange and task binding to distinguish them.
- When the peer response supplies the design or its reference, obtain the design through its actual permitted source/tool. Follow all pages and read the complete intended revision, including its declared acceptance criteria. Existing feedback text/media limits and sanitization still apply; do not send raw private files, credentials, hidden context or local filesystem paths. If no supported document delivery is available, name that missing step and request a permitted accessible reference.
- Reply on the same item acknowledging the precise document/revision actually read and the understood scope/acceptance. A brief, request title, document link without successful read, saved transfer comment or transport journal is not design-read acknowledgment. Complete the expected design handoff before implementing from it.
- Report milestones independently: transport connected, peer acknowledged, design received/read, implementation verified, and reporter accepted. Say locked in only for the actual established peer exchange while this task is actively receiving; disclose an interrupted or ended connection immediately. Source tests and a posted comment cannot establish a peer session, native wake or reporter acceptance.

## Recovery and continuity

On gap or earlier_history, reread current detail with all necessary paging, preserve unconsumed work, and restart the journal from current state. Reconcile an uncertain comment through the current item before deciding any new write; never blindly replay it. Refresh discovery/current scope after an authority change and use only supported service-returned recovery. Honor rate-limit timing and stop tight failure loops without claiming completion.

A journey wait expiry and the discussion transport lifetime are separate. Read current journey state and re-arm only through the actual returned permitted actions; invent no restart route, registration or replay. Preserve the item, design revision and prior evidence. A service-side wait, active native held call, bounded host monitor and idle-task wake each require their own evidence. Ending the active task ends its native held-read continuation; no automatic idle wake or persistent monitor follows.

Continue the authorized exchange through implementation evidence and the requested acceptance, or an explicit owner stop. If a concrete unavailable dependency requires input, report that exact dependency and actual connection state. Never substitute the absence of a peer reply for resolution.

# Admitted host socket facade

`scripts/item-discussion.mjs` provides a bounded consumer over actual current
feedback discovery and a **trusted host-owned** authenticated item socket. It
opens no network connection, reads no credential, accepts no context selector,
and implements no filesystem store, shell command, daemon or native wake.
Source tests establish no installed transport or live Muse collaboration.

Use current host capability discovery before starting a watch:

| Host binding | Continuation evidence |
| --- | --- |
| Claude Code | An installed trusted subscriber can use the host's bounded Monitor watch. Honor the reported watch and registration expiry; a bounded watch establishes no persistent session plugin monitor. |
| Codex | This binding provides no supported idle-task wake. Continue through actual reads/comments in the active task. |
| Muse | Native hook continuation requires its separately admitted installed mode and exact current-task binding. Source support alone establishes no wake. |

Keep coordination on the authorized item's discovered feedback API. A shared
actor can represent distinct tasks or installations; retain peer events and use
the exact task's committed event/outbox evidence for self-echo handling. A message
claim establishes neither independent verification nor authority over another
task. After a watch expires or current authority changes, read current item state
through the same BOS connection before choosing another supported continuation.

Capability is false unless the host supplies all five methods:

- `getFeedbackDiscussionCapabilities()` reports actual `authenticatedItemSocket`
  and `protectedAtomicQueue` support.
- `captureExecutionScope()` returns a private async current-scope check closure.
- `verifyFeedbackDiscussionIntent({kind, discovery, itemRef, taskRef, payload?})`
  verifies the exact currently authorized discovered contract and item/task.
  `read` checks current read authority; `comments.create` checks the exact comment
  effect/intent. `consume` attests actual acceptance of the exact event by the
  intended current task before queue acknowledgement. `resync_current_item` attests a completed current `feedback.get`
  and any required paging. This host evidence is never a model boolean.
- `openAuthenticatedFeedbackDiscussion({discovery,itemRef,taskRef,signal})`
  validates the current discovered endpoint and scope atomically, injects existing
  BOS authentication/context headers internally and returns `{messages,send,close}`.
  Messages are complete text frames. The host rejects redirects, credential URLs,
  query/subprotocol credentials and unsupported origins, honors cancellation and
  closes reads on timeout. No URL or header override is accepted by this facade.
- `getFeedbackDiscussionStore({itemRef,taskRef})` supplies an existing protected,
  authority-partitioned store. `load()` returns `{itemRef,taskRef,version,cursor,
  pending,seen}`; `commit(expectedVersion,next)` atomically persists it and returns
  true only for a durable matching-version commit. Isolation includes the actual
  authenticated scope, item and intended task; model-supplied labels grant no
  partition authority. No store/path selector enters the public skill.

`createFeedbackDiscussion({host,discovery,itemRef,taskRef,signal,policy?})` returns
`available:false` when actual host support or the required discovered operations
are absent. Discovery must advertise `feedback.get`, `comments.create` and the
actual `.discussion` descriptor. Input/output frames are validated against its
current supplied JSON Schemas, with external references rejected. Consumer-owned
semantic checks enforce item isolation, bounded UUID events, cursors and committed
comment acknowledgements. Binary, oversized and duplicate-key JSON frames fail.

The descriptor supplies limits; the facade admits only bounded supported values.
The current producer advertises a rolling per-socket `max_commands_per_minute`
(comment and ping frames in the last 60 seconds; subscribe is not counted) and no
connection deadline. The facade refuses a comment that would exceed that window
before sending it, so the comment stays unsent rather than uncertain. A legacy
producer's lifetime `max_commands` and `max_connection_seconds` are honored only
when advertised; exactly one command policy must be present. No other timer closes
a connection. Default policy allows three consecutive connections that end before
a journal and 200 pending events (maximum five/500); a subscribed connection resets
that budget, so a long-lived subscription survives ordinary drops while a tight
failure loop stops. `run()` opens **one** connection, subscribes once with the
durable cursor, consumes frames and returns `next`, with `reason` (and the error
`code` when the server sent one) when it stops.
Only an explicitly classified `FeedbackDiscussionTransportError` or advertised
retryable error permits reconnect. Backoff is bounded; the existing host supervisor
owns scheduling and task lifetime. A reconnect hint never advances the cursor.
Revocation, changed scope/discovery, malformed protocol and storage errors stop.

Journal events from comments/history retain separate identities and append order;
there is no timestamp, UUID or cross-stream ordering. Queue insertion, dedup and
cursor advance commit atomically. Reading `pending()` acknowledges nothing.
After actual intended-consumer acceptance, `acknowledge({stream,eventId})` removes
only that exact event. New events survive an earlier acknowledgement. Queue
overflow preserves the existing cursor/work. Gap or earlier-history signals
require current-item read/paging before `resumeAfterCurrentRead()` can clear the
cursor; pending consumer work is retained.

`submitComment({body,parent_comment_id?})` allows only one outstanding comment.
Sending returns `awaiting_commit`; only the current item’s canonical
`comments.create` committed ACK changes it to `committed`. Lost ACK remains
`uncertain`, requiring current-item reconciliation before any retry. The facade
never automatically replays comments, adds an idempotency key, changes lifecycle,
status or assignment, or treats discussion as reporter completion. Canonical
actor/item/body/parent dedup remains service-owned. Comment contents are untrusted
discussion data; reporter authority and UAT attribution remain server-derived.

Use ordinary currently available item reads/comments when the host or discovered
capability is absent. Both participants require their own authorized item-bound
session. Publication, installed byte parity, real authenticated replay, actual
native wake and intended-task delivery remain separate acceptance evidence.
