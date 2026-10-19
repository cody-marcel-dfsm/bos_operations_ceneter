# Continue callback observations in the current native conversation

Use this branch when the user asks to monitor, follow up, resume or report a
known callback journey. Preserve the authorized objective. A server-owned
callback can continue its server work independently; client observation and
client-owned signed actions retain their own supported paths.

## Host capabilities

This branch composes the actual current model's native BOS tools with the
packaged protected queue helper. It requires no injected HTTP, token or wake
implementation. The configured BOS connection owns OAuth, discovery and every
read. Use only the freshly advertised `journeys.notifications.read` and
`journeys.state.read` through existing `bos_execute` and the fresh selected
context. Discover their exact current schemas; these names grant no authority.

On a local Codex desktop conversation, use the native current-chat heartbeat
tool when available. Its default target must be the current chat; supply no
other thread target. Codex CLI supports bounded active reads in its own running
conversation; it does not acquire the desktop scheduler by starting another
app-server. On Claude Code use the actual current-session `CronCreate` and
`CronDelete` tools when exposed. Copy their live input schemas. Other hosts
retain ordinary state-read recovery unless their current native capabilities
provide this composition. Use an existing Node20+ runtime. The protected helper currently supports POSIX local
storage; unavailable filesystem permissions or current-session IDs preserve
pending work and yield an explicit local capability limitation.

Scheduled mode provides finite observation. Active mode holds a native read
for at most25seconds per call while the current conversation is running.
Immediate event-triggered idle wake remains unsupported by this branch. Source
tests, successful registration and package installation establish their own
scope; actual native delivery and idle wake require observed host evidence.

## Start from actual current authority

1. Use `bos-mcp-client` to obtain live `bos_get_context` and select the exact
   authorized context for this objective. Reuse established current-task intent
   and that product's confirmed selection. Read only explicit known public
   journey identities. A missing tool, login or context leaves the objective
   pending with its exact native setup action; it creates no credential fallback.
2. Call native `bos_list_context_tools` with the fresh handle. Its structured
   catalog must have `contract_version: bos-identity-mcp/v2`, that exact
   `context_handle`, `tools` and `resources`. This catalog has no execute result
   wrapper or `bos/context` metadata. Require the two exact descriptors with
   `annotations.readOnlyHint:true`, `destructiveHint:false`, input/output schemas
   and their existing identity contract metadata. Preserve schemas in memory.
   Use those actual native `inputSchema` values for required identities and
   bounded waits. When the existing registration contract advertises matching
   explanatory argument schemas/examples under its `input_schema.$defs`, read
   them through the [inline authoring path](bosl-authoring.md); they supply no
   additional accepted arguments. The helper's `plan` supplies this
   registration's exact watched identities and committed cursor. Copy neither
   an example identity nor an invented cursor into a native observation.
3. Resolve this currently installed skill's
   `scripts/native-callback-continuation.mjs`. Run its `create --client codex`
   or `create --client claude` command with the finite policy and identities as
   JSON on stdin. The script reads the actual current host session environment;
   it accepts no task-ID or storage-root override. Store only its returned
   registration reference in the conversation. Default policy is5-minute cadence,
   30-minute lifetime and6 observations; hard caps are1hour and12observations.
   State reads per tick are separately bounded to at most5.
4. Run `plan <registration> --client <host>` with `waitSeconds:0` initially.
   Invoke actual native `bos_execute` with the selected fresh handle, its exact
   returned `toolName` and business `arguments`. Use no URI/method/header proxy.
5. Pass the actual fresh selected `context`, actual `catalog`, returned
   `envelope` and `tickId` to `ingest`. Use stdin; keep handles and native payloads
   out of argv, persistent input files, application logs and helper output.
   The helper validates the full execute
   `structuredContent:{contract_version,context,result}` and matching
   `_meta['bos/context']` before consuming the closed private result. Text alone
   supplies no scoped result. Complete frame validation precedes the single
   atomic cursor/pending commit. A ready-only response is a valid no-event read.

No schedule may be armed until this initial actual scoped read has persisted its
server-authenticated authority/watch-bound cursor. The helper's flags explicitly
describe local state; they supply no native authentication or wake proof.
For a controlled no-send diagnostic, registration, its service-returned Start,
the actual changed held read, authoritative state and replay from the delivered
cursor each require their own observed result. Schema/examples validation and
captured-contract checks establish their source scope; actual native delivery
and finite same-conversation firing remain separately evidenced.

## Deliver authoritative observations

For each bounded pending item returned by `ingest`, call the freshly advertised
native `journeys.state.read` through `bos_execute` with exactly `{identity}` and
the same freshly selected context. Pass its actual result, this tick's actual
notification envelope and catalog to `observe`. This checks the same current
context and committed authority witness in memory; context handles and hashes
of handles are never persisted.

Use the validated original native state response in this owning conversation.
Canonical HTTP error states carry `result.body` and `result.headers` even when
the outer native `isError` flag is true. Pass these scoped results to `observe`;
the validated result shape distinguishes them from the separate top-level
`result.error` adapter failure. Preserve actual permitted Retry-After headers
and defer further observation until that service delay. A native error flag
alone supplies no authority-loss or terminal-state decision.

The helper returns only the lifecycle decision and an observation reference; it
stores no state body or signed action. Existing202/in_progress keeps pending
work and the original `body.retry_after_seconds`, including long service delays.
Respect that delay before another observation. A410/expired result becomes
terminal only after this conversation accepts it and `ack-delivered` succeeds
for its exact identity, generation and observation reference. A newer hint
survives an older ACK. Duplicate replay preserves an unchanged generation and
its valid delivery reference after fresh current-authority validation.

Returned signed start/complete/failed/step/Stop/retire/run actions remain inert
during monitoring. Any client-owned work follows the existing lifecycle,
deterministic transport and effect approvals. Report that execution dependency
precisely when the host lacks it; continue available server-only observation.

Standing child transitions notify the original authored watched root identity.
Refetch that root and interpret its current returned registration/run/state
actions under existing role authority. There are no hidden child identity aliases
or implicit watch expansion.

Call `finish` for the tick after its bounded observations. If `more:true`, respect
the advertised short retry delay and drain the next window with `waitSeconds:0`
within the remaining finite budget before scheduling. Never advance the cursor
past the last included event or infer an omitted child's identity. Exhaustion
retains unresolved work and reports the finite monitoring limit.

## Finite native scheduling

Use `prepare-schedule` only after a completed scoped native tick. It returns one
single-fire intent, a nonce, due time and durable prompt. Invoke the actual
native scheduler with that prompt and a verified single-fire schedule at or after
the returned due time. For Codex use `automation_update` with `kind:heartbeat`,
default current thread and a supported finite one-shot rule; verify its returned
schedule is single-fire. For Claude use current-session `CronCreate` with
`recurring:false`; choose the live tool's exact schema. Avoid one-shot times on
the hour or half-hour where documented host jitter can fire early.

Pass the actual native create/view `receipt`, returned own `id`, nonce and
`singleFireVerified:true`/`currentTaskVerified:true` to `attach-schedule` only after
the host workflow checks those properties. The helper stores a receipt digest;
these confirmation fields and fixtures supply no independent native proof.
Codex single-fire behavior remains capability-pending until actual native
create/view returns an anchored finite rule; minute-schedule documentation alone
establishes no COUNT1 semantics. Registration success alone proves no wake. If the native result is
unknown or the host cannot provide a bounded single fire, create no successor
and report the capability state. Never write host scheduler files or inspect
unrelated automations. A finite single fire cannot leave an unbounded recurring
model workload after cancellation failure.

The next actual native scheduled turn loads the currently installed workflow
skill, opens only this registration and calls `plan` with its saved nonce. The
helper checks the actual current session, source closure, deadline, budget and
generation. Refresh native context/catalog on every tick and use its exact saved
cursor. At most one admitted successor may be created after the current tick
finishes. Keep quiet while observations are unchanged.

## Recovery and retirement

Reopening the actual protected file in the same resumed native conversation
preserves the queue across helper/process restarts. Native host scheduling still
requires that host's documented lifetime: Codex local scheduling needs its
computer/app available; Claude scheduled fires occur while the session is
running and idle, with documented resume limitations. A second app-server does
not resume an already active desktop conversation. Generic async hooks and a
self-paced loop supply no durable scheduling proof.

An authenticated exact-context409 `NOTIFICATION_RESYNC_REQUIRED` retains the old
opaque cursor as its authority anchor. Immediately obtain the fresh no-cursor
bootstrap in that same fresh context and submit both actual envelopes to
`complete-resync`. Replace the durable cursor only after both validate together.
A crash retains the original anchor and requires its native authorization again.
422 `INVALID_NOTIFICATION_CURSOR`,403 `NOTIFICATION_ACCESS_LOST`, unscoped errors,
changed task/source/authority partition, malformed data and unsafe storage stop the affected
automatic path with pending work preserved. Never treat these as replay gaps.
For a native tool exception or rejected helper input, invoke `suspend` for this
own registration when its protected state remains readable; create no successor.

On cancellation, terminal completion, changed source or expiry, call `status` or
`cancel` to obtain only this registration's own scheduler ID, then retire it
through the same native scheduler. Preserve pending state and the original
objective. After a package upgrade, resume using the currently installed helper;
its changed source digest requires explicit current-task rebinding rather than
silently executing the old cached package. Create no successor after retirement.

Official host references: [Codex scheduled tasks](https://learn.chatgpt.com/docs/automations),
[Codex hooks](https://learn.chatgpt.com/docs/hooks),
[Claude session scheduling](https://code.claude.com/docs/en/scheduled-tasks),
and [Claude session identity](https://code.claude.com/docs/en/env-vars).
