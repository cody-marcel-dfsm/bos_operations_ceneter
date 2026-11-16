# Closed feedback-item discussion facade

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
