---
name: my-crm-activity-operations
description: Build authorized CRM activity timelines from connected email, calendar, note, call, document, and CRM event sources with deterministic contact matching, source provenance, and freshness evidence.
---

# My CRM Activity Operations

Use source discovery to select authorized activity providers. Query each source
independently with minimum-necessary filters and bounded time windows. Apply the
shared cache freshness policy and run sources in parallel when supported.

Match activity to a CRM record only through deterministic server-returned
identities or the product's approved identity policy. Keep ambiguous evidence
separate. Normalize activity type, timestamp, direction, subject, participants,
source, and source record reference while minimizing message bodies and private
content.

Return a chronological timeline plus per-source sections, local freshness,
coverage, source errors, and usage scope. Read-only activity evidence grants no
permission to send a message, create an event, or mutate a CRM record.
