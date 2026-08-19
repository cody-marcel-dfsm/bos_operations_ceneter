# BOS SendGrid campaign capability contract

Discover live tool names and schemas on every task. Tool availability can
change with the installed product, role, plugin version, and provider grant.

## Semantic operations

| Operation | Minimum client input | Required server behavior |
|---|---|---|
| Resolve context | None on a packaged product route | Derive one actor, organization, application, installation, role, plugin, and capability scope |
| Query audience source | Bounded business criteria and time window | Read only the configured tenant source and return provenance plus stable record identities |
| Preview audience | Criteria or server-owned audience identity | Normalize and deduplicate contacts, apply eligibility and suppression policy, and return aggregate inclusion/exclusion counts |
| Create or update list | Approved audience identity and idempotency key | Persist the tenant-scoped list without accepting provider account authority from the client |
| Create campaign | Approved list/audience identity, content identity, delivery plan, and idempotency key | Validate server-owned sender, unsubscribe, tracking, category, and provider configuration before creating one campaign |
| Test, send, or schedule | Campaign identity, approved action, and idempotency key | Execute exactly one legal provider effect and return accepted/rejected state plus a correlation identity |
| Pause, resume, cancel, or reschedule | Campaign identity, intended transition, and idempotency key | Validate the transition against current server-owned state and reconcile provider state |
| Read campaign | Campaign identity or bounded filters | Return current lifecycle state, timestamps, audience totals, and last event reconciliation time |
| Reconcile events | Campaign identity and bounded cutoff/cursor | Verify provider events, advance the cursor atomically, and preserve event deduplication |
| Report statistics | Campaign identity, observation window, and optional dimensions | Return aggregate accepted, delivered, bounce, open, click, unsubscribe, complaint, and conversion evidence with freshness |

The observed baseline tool
`education_center_send_sendgrid_campaign` supports campaign creation or send
only to the extent declared by its live input schema. Its presence does not
prove that list management, scheduling, lifecycle transitions, provider-event
reconciliation, or statistics are available. Report missing semantic
operations precisely and continue with safe read-only or planning work.

## Audience rules

- Make source combination explicit: union, intersection, or ordered fallback.
- Normalize email addresses for comparison while retaining the server-owned
  canonical contact.
- Prefer a stable customer/family/contact identity over email alone for
  cross-source deduplication.
- Select responsible adult contacts for child-related records. Exclude child
  addresses from marketing audiences unless the server returns explicit
  eligibility for the requested communication.
- Apply the strictest current suppression across all sources. Exclude invalid,
  unsubscribed, complained, hard-bounced, do-not-email, duplicate, ambiguous,
  and policy-ineligible contacts.
- Require a server-supported eligibility basis appropriate to the campaign.
  Source membership or prior correspondence alone does not establish consent.
- Persist the query definition, source snapshot or cutoff, aggregate counts,
  exclusion reasons, and approval evidence with the server-owned campaign.

## Lifecycle and transitions

Use server-returned states as authoritative. For reporting, map them into these
display phases without changing the underlying state:

`draft -> audience_ready -> content_ready -> awaiting_approval -> approved -> scheduled|sending -> active -> completed|cancelled|failed`

`paused` may interrupt a server-supported scheduled, sending, or active phase.
Resume only from a state the live schema permits. A campaign is `completed`
when the server declares delivery processing complete for its policy; later
provider events may still update statistics and must retain their own freshness
timestamp.

## Metric definitions

Use provider- or server-returned definitions when supplied and disclose any
material difference. Otherwise calculate:

- delivery rate = delivered / accepted
- bounce rate = bounced / accepted
- unique open rate = unique human opens / delivered
- unique click rate = unique human clicks / delivered
- click-to-open rate = unique human clicks / unique human opens
- unsubscribe rate = unsubscribes / delivered
- complaint rate = complaints / delivered
- conversion rate = verified conversions / delivered, or another denominator
  explicitly requested by the user

Return numerator, denominator, window, and last reconciliation time with every
rate. Avoid rates when the denominator is zero. Keep test/internal traffic and
identified security-scanner events separate from human-performance metrics.
