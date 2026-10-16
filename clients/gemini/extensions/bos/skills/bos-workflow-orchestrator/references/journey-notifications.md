# Observe committed journey changes

Discover `journeys.notifications.subscribe` through the current plugin query
catalog, then obtain its current `api.contract.get` descriptor. Open a stream
only when the service reports readiness and the existing BOS host adapter
supports both authenticated incremental events and durable intended-task wake.
Otherwise preserve the objective and use the existing returned state actions.
A package release or a successful source test supplies no native host wake proof.

Use an explicit bounded set of known public journey identities. Copy the
advertised GET URI, repeated-query encoding, resume header, parsed-event schema,
effective limits and reconnect policy. The existing host connection owns all
credentials and current execution context. The stream carries inert change
hints; read current state before interpreting a hint or following an action.

The executable consumer in `scripts/journey-notifications.mjs` validates
incremental UTF-8 SSE framing, the exact ready watch list and state actions,
change hints and control errors. Fresh readiness atomically queues baseline
state reads with its cursor. Resumed readiness preserves the saved cursor.
Commit each hint and its cursor together before requesting host wake. Keep
pending work when wake, state reads or intended-task delivery fail. Clear only
the acknowledged generation so a concurrent hint survives an older response.
An unaccepted wake returns `host_wake_unavailable` to the supervisor after the
durable commit. Retain the saved cursor and pending generations; the supported
host scheduling policy owns the next wake attempt. Resumed pending work requires
an accepted wake before another connection opens. A delayed wake leaves that
same durable work intact.

`runNotificationConnection` performs one bounded connection and returns its
next recovery action and delay to the existing host supervisor. Respect
advertised jitter/backoff and Retry-After. A replay gap clears the resume cursor
while retaining pending work and requires a fresh baseline. Authority loss,
logout or task-context change stops monitoring; rediscover with current access.
A removed or expired journey requires an explicit remaining watch set and fresh
bootstrap. Reconnect never replays a business mutation.
The existing authenticated adapter classifies transient open/read network loss
and returns bounded advertised reconnect jitter using the committed cursor.
Declared retryable `RATE_LIMITED` stream errors use that same bounded reconnect
policy; permission/access-loss control errors stop monitoring.
Cancellation stops the connection. Lost authority, malformed protocol, invalid
host behavior and durable-storage errors remain terminal and distinct from
transient connection loss; recovery never starts a second authentication flow.

Use `drainNotificationQueue` to read fresh state actions and validate the usual
journey envelope before delivering it to the intended task. Continue through
the existing lifecycle interpreter and approval rules. The host owns protected
persistent storage, authority/connection partitioning, task bindings, wake and
reconnect scheduling. The packaged skill receives no storage-root selector,
credential, private authority key or host task-constructor authority.
After accepted delivery of completed, failed, expired or unavailable state,
return the identity for removal only when its generation was acknowledged.
A newer racing hint remains pending and prevents that old observation from
removing its identity. The host explicitly selects the remaining watch set,
opens its fresh authority/filter partition and bootstraps its current states;
an empty remaining set ends monitoring.

The notification foundation creates no `agent-stream` callback source or
destination. Use only callback sources and waits explicitly declared by current
discovery and BOSL schema.
