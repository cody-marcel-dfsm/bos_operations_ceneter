# Journey contract cache protocol

The native BOS host uses its shared document-cache root and a private
journey-contract partition. This low-level capability is not packaged as an
installed skill script. The host calls it only after fresh BOS context
validation and privately supplies server-derived organization, application,
installation, role, authenticated user, opaque authority partition, and current
connection generation. These values never appear in public client input,
diagnostics, or user output.

Cache only authenticated BOSL schema/reference/examples resources and complete
individual `service.describe` responses. Key every entry by the full authority,
exact resource URI, opaque descriptor token, and kind. Keep multiple authority
partitions simultaneously. `app.describe` is always live and the helper rejects
attempts to cache it.

Reuse an entry only when every authority value, connection generation, URI,
descriptor token, and configured maximum age matches. A stale or missing entry
requires a live read; a failed refresh preserves the prior private entry without
presenting it as current. Each private entry carries and verifies a canonical
payload digest; corrupt or future-dated entries fail closed.

Maintenance scopes are exact resource, selected structured plugin/service,
current application partition, or complete current authority. Never invalidate
or inspect another authority partition. Output may include a digest, cache/live
origin, stored time, human-readable age, and configured maximum age. It excludes
raw authority, descriptor content, tokens, and customer data.
