# Sign out of the current BOS connection

Use this branch for an explicit BOS sign-out request, including a dependent
plugin's request to sign out of its shared BOS connection. BOS Service owns
revocation; the host keeps ownership of credential storage and refresh.

The packaged `scripts/logout.mjs` exports `signOutCurrentConnection` for a host
that supports injected authenticated callbacks. Supply its supported tool
discovery/call callbacks, in-memory authority reuse discard, optional managed
cache invalidation, and the exact resource-metadata URL from the registered
BOS binding. Cleanup callbacks capture this authority before revocation.
The helper returns a terminal outcome and cleanup status; report limitations.
When that callback runtime is unavailable, follow this same workflow using the
host's advertised tools directly. Never invent a callback bridge or transport.

Resolve `bos_logout` through the current BOS binding's advertised callable
inventory or supported authenticated tool discovery. The approved operation
accepts an empty object and returns `structuredContent` with
`status: signed_out` and `scope: current_connection`. Use the exact discovered
callable and its schema. Invoke it directly on the platform connection without
`bos_get_context`, organization/default selection, `bos_execute`, or a context
handle. Connection logout applies to both identity-v2 and legacy platform
grants. Its arguments contain no token, client, tenant, grant, or role selector.

An explicit sign-out request authorizes this current-connection revocation.
Invoke the operation once with empty arguments. On the exact terminal receipt,
report that this BOS connection is signed out. A canonical challenged HTTP 401
from the same protected BOS resource establishes that the connection is already
signed out; stop without initiating authentication. A missing tool alone does
not establish signed-out state. If authenticated discovery lacks logout,
report that service sign-out is unavailable on this connection. Preserve that
finding through one supported catalog refresh when the host provides it.

After confirmed sign-out, discard this authority's in-memory context handles,
discovery descriptors, pending continuations and reusable results. Use the
host's managed current-authority invalidation capability when available.
Preserve other authorities' caches, other connections, and confirmed plugin
preferences. If managed cleanup is unavailable, report that limitation and
prevent reuse of revoked-authority data. Never edit host-owned credentials or
installed plugin files to perform service logout.

End the request after logout. Do not call context, console, protected verification,
or authentication recovery afterward: those calls can trigger sign-in again.
On transport failure without a receipt or canonical challenged 401, report
logout as unconfirmed and discard reusable authority state conservatively.
Host-local CLI logout cannot establish service grant revocation.

When the user next asks for protected BOS work, make the ordinary protected
request. Its server OAuth challenge drives the host's native authentication
action; preserve and resume that new task after consent using fresh discovery.
Do not claim a host sign-out button exists without observing it. A skill
sign-out request uses the published service operation independently of that UI.
