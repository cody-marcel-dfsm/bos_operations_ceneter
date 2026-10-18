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
