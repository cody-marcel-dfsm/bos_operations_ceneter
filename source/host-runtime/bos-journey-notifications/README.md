# Protected journey notification host

This BOC-owned component uses the already configured BOS service connection in the
Muse companion. It is excluded from every customer skill/plugin archive. It adds
no service login, key, grant or public API. The Muse Code CLI is a separate host.

Install from the immutable published BOC release through
`scripts/install-notification-host.mjs plan|apply|verify`. Supply the fetched source
commit and a dedicated private host root. The installer verifies committed bytes,
dependency closure and modes, writes an atomic versioned installation, and keeps
prior sources and receipts. It creates no native hook or background job. A skill
sync supplies no runtime-installation proof.

Use supported Muse controls to create the returned hook path, initially disabled,
with its intended delivery and a fixed logical-continuation prompt. Set polling
to at least five seconds and a script timeout between 35 and 600 seconds. Record
the actual fresh native definition with `record-hook`, then enable, inspect and
record the enabled definition through those same controls before monitoring.
Hook observations are operator-supplied native
evidence; the installer does not impersonate a native control API.

Run the installed `muse-companion-cli.mjs monitor --root <private-root>
--credential-file <existing-configured-file>`. Supply its exact volatile JSON
input through native exec stdin: `origin`, `contextHandle`, `sourceContract`,
`identities`, `taskIntent`, `lifetimeMs`, and `intentConfirmed:true`. Obtain the context and
contract through the current legitimate BOS connection. Keep this input in
memory; do not put handles, actions or keys in files, argv, environment, logs or
review evidence. The fixed watch and intended task are confirmed for this one
registration. A different task or scope requires retirement and a fresh binding.

The credential remains inside the host process. Its existing file must be
regular, current-user owned and0600, with no symlink ancestor. The host attaches
Bearer only to the exact discovered notification GET and freshly returned state
GETs on the selected HTTPS origin. It refuses redirects and arbitrary requests.
Changes to the credential, runtime source or active registration retire the
generation. Service401/403 ends it; the ordinary connection owner handles login.

The bounded monitor uses one private lease and an explicit lifetime of at most
15minutes. It has no automatic daemon restart. Native exec background lifetime
and VM replacement survival are host observations, separate from this cap.
Restart creates new random authority/task/work references. Old queue bytes and
retired receipts are retained; old volatile authority is never reconstructed.

`muse-hook.sh` uses documented `HATCH_HOOK_RUNTIME` and terminal
`wake(reason, JSON)` or `silent`. Only fixed opaque references enter the wake.
The intended worker uses `worker-read --control <private-control>` to get fresh
authoritative state through the same current registration. After accepting the
returned current-state handoff, it calls `worker-ack --control <private-control>
--ticket <returned-ticket>`. A read or wake never acknowledges pending work.
Newer hint generations survive an older ACK. Follow returned journey actions
through the ordinary BOS workflow and approval process; this host executes no
business effects.

Before upgrade, rollback or retirement, disable the exact native hook and inspect
its disabled definition. Retire the monitor with the local `retire` operation,
wait for the lease to quiesce, then supply the fresh disabled-hook observation to
the installer. It preserves old installation bytes, queue state and credentials.
A live or unexplained process/lease is preserved and reported.

Synthetic tests prove source behavior. Actual support additionally requires the
published commit and installed byte/mode parity, a real authenticated ready/change
and reconnect/replay, observed native wake invocation, intended worker fresh-state
handoff, replacement and retirement. Silent logs and requested wake establish
none of those outcomes. Keep runtime customer data within the authorized host
interaction and keep secrets out of retained acceptance evidence.

## Protected feedback-item mode

The separately installed host also has an explicit `feedback` mode. Its source
constructor is disabled by default. Installation uses `--mode feedback` and
returns the matching fixed worker prompt and a **disabled** hook plan; it enables
no hook, monitor or socket. Existing journey mode and legacy installed metadata
retain their journey behavior. Changing mode requires the same inactive-lease,
disabled-current-hook and immutable-source lifecycle as upgrade/retirement.

After actual admitted installation and supported native hook setup, the host
entry is `discussion-monitor` with the existing root/credential-file controls.
Volatile stdin contains exactly origin, contextHandle, discovery, itemRef,
taskIntent, lifetimeMs and intentConfirmed. The current host supplies them from
its existing BOS connection. No secret/context/action is persisted or printed.
No operator or public skill receives a new login or socket/header override.

The host refreshes the authenticated feedback descriptor at its fixed existing
describe contact, binds only the selected current item, and consumes its actual
advertised feedback.get POST URI and schemas. HTTP UUID paging cursors remain
distinct from opaque WebSocket append-position cursors. The WebSocket uses only
same-service WSS, existing Authorization/context headers, strict TLS, no redirects,
no subprotocol credentials, no compression and bounded text frames. Read/schema,
scope, credential, source or registration changes retire the volatile generation.
There is no browser fallback, arbitrary network dispatcher or shell WebSocket.

The pinned MIT-licensed ws runtime is pure-JavaScript bundled under `vendor/`;
its license, registry integrity, input hashes and bundle hash accompany the same
immutable installer inventory. Optional native extensions are disabled. Rebuild
or check it with `node scripts/build-feedback-socket-runtime.mjs [--check]`.
The installed host uses no node_modules or sibling checkout dependency.

The facade's queue/cursor state is atomically stored in a fresh private authority
partition and authenticated with a process-local HMAC key. Restart preserves old
bytes and creates new authority; it never reconstructs an old grant from disk.
The native hook wakes only the fixed registered task with opaque references.
`worker-read` obtains current authenticated item detail and queued handoff tickets;
`worker-ack` consumes only the accepted exact ticket. A 35-second worker lease
bounds duplicate wakes; newer event IDs survive an older acceptance.

`worker-comment` accepts only a body and optional parent_comment_id on stdin for
the fixed item/task. Its protected local outbox records prepared, awaiting_commit,
committed or uncertain observations. Only a canonical server ACK proves committed.
Rejection before dispatch is recorded as not_submitted and inherits no prior ACK.
The registration deduplicates its exact own requests and permits at most five
distinct outbound comments, preventing unattended reply loops. It never blindly
retries an uncertain write. Neither actor equality nor text naming Muse/an owner
proves an own echo, installation, UAT authority or permission. Same-actor peer
events stay visible; the current ACK supplies no event ID, so none is invented.
The worker replies only to substantive peer intent and acknowledges ordinary
updates without automatically generating another comment.

Finite connection/replay budgets and the existing maximum 15-minute registration
lifetime remain in force. A completed connection budget retains accepted pending
work for the current native worker until retirement; no auto-restarting daemon
is installed. Source tests, including a synthetic TLS loopback, establish no real
Muse hook, service login, external socket, native wake or customer-path acceptance.

## Event-wake subscriber mode (Claude Code)

The disabled `subscriber` installer mode serves hosts whose supported facility
turns each stdout line of a long-running process into a task wake. Claude Code's
Monitor/background task is that facility. Installation uses `--mode subscriber`
and returns `subscriber_plan` (fixed argv, stdin fields and worker prompt); it plans
no native hook, keeps `hook` null and refuses `record-hook`.

Run `muse-companion-cli.mjs discussion-subscribe --root <private-root>
--credential-file <existing-protected-file>` as the host's background task. Volatile
stdin is the same as `discussion-monitor`. The bearer stays in the current-user 0600
file and is attached only to the same-origin WSS upgrade and advertised HTTPS reads
with the context header. Custody is event-driven: there is no interval describe
poll; every frame, read, send and operation rechecks it, and the service revalidates
each read and closes 1008 on access loss.

Stdout is newline-delimited JSON (`kind: bos.feedback.subscriber`): one `started`
line with the private control path, one `ready` line for the subscription snapshot
(pending count and committed cursor), then exactly one `event` line per newly
committed queued event (stream, event_id, committed cursor, occurred_at,
author_type), deduplicated on `stream:event_id`. A terminal `stopped` line names
`stopped` (with the server error code when sent), `authority_ended`,
`connection_budget_exhausted`, `lifetime_ended`, `retired` or `failed`. Lines never
contain the credential, context handle, URL or discussion body. The woken worker
uses the unchanged `worker-read`, `worker-ack` and `worker-comment` controls.

Reconnect happens only after a transport drop, a retryable `rate_limited` or
`service_unavailable` error, or a server `reconnect` frame, and resumes from the
committed cursor. The existing 15-minute registration lifetime still applies; its
end is reported as `lifetime_ended`, never as credential expiry. An ad-hoc Claude
Code Monitor watch is itself bounded (5 minutes by default, 30 at most, 10 in
non-interactive `-p`); arm it with a timeout covering the registration and start a
fresh registration only for current authorized intent. No watcher or socket restarts
itself on a timer. A session-lifetime plugin monitor is a separate host mode that
this binding does not configure. Keep the private root short: the control socket
path must fit the portable 103-byte Unix bound or the bridge refuses to start. Codex currently has
no supported facility to deliver background output into an existing idle task, so
its subscriber capability is unavailable. Synthetic loopback tests prove protocol
behavior only; live service socket availability and observed native wake remain
separate evidence.

## Identity-only onboarding mode

The disabled `onboarding` installer mode adds fixed metadata discovery and closed
read/action/state bridge operations. `onboarding-monitor` uses the existing
protected API-key file solely for authenticated metadata at the configured exact
platform audience; it reports own-work unavailable. It sends no context/session
selector and starts no login. The separate source-owned OAuth factory accepts
only an actual existing host connection with identity-only HTTPS support and
current identity-generation checks. Account authorization remains server-owned.
Current ChatGPT/Muse API-key custody supplies no eligible own-work OAuth port.
No installation, hook enablement, live account action or native UAT follows from
source tests. Existing journey and item-discussion modes retain their behavior.
