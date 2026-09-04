---
name: my-crm-activity-operations
description: Build authorized CRM activity timelines from connected email, calendar, note, call, document, and CRM event sources with deterministic contact matching, source provenance, and freshness evidence.
---

# My CRM Activity Operations

Discover the app-owned provider-neutral CRM activity service. Query it once with
minimum-necessary filters and bounded time windows. Omit source selection for
all enabled and authorized sources, or use only opaque handles returned by the
current service discovery. The server owns source fan-out and concurrency.
Apply the shared client-cache freshness policy to the complete returned dataset.

Present activity-to-record relationships only when the service returns them.
Preserve ambiguous evidence as separate server-returned results. Present the
server-normalized activity type, timestamp, direction, subject, participants,
source, and opaque source record handle while minimizing message bodies and
private content. Never correlate records or normalize provider vocabulary in
the client.

Return a chronological timeline plus per-source sections, local freshness,
coverage, source errors, and usage scope. Read-only activity evidence grants no
permission to send a message, create an event, or mutate a CRM record.
