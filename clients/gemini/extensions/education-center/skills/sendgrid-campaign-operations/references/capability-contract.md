# BOS SendGrid campaign capability contract

Discover live tool names and schemas on every task. Availability depends on the
installed product, authenticated role, plugin version, capability grant, and
provider readiness. Never infer one operation from another tool's presence.

## Required semantic operations

| Operation | Minimum client input | Required server behavior |
|---|---|---|
| Resolve context | None on the packaged route | Derive one actor, organization, application, installation, role, plugin, and capability scope |
| Query audience sources | Bounded criteria, source roles, and cutoff | Read configured Calimatic, Lead Director, Gmail, Calendar, camp, enrollment, inquiry, lead, and trial evidence with provenance |
| Build/preview audience | Cohort definitions, priorities, combination rule, and idempotency key | Normalize guardian identities, retain overlapping cohort tags, deduplicate, evaluate eligibility/suppressions, and persist an audience version |
| Update audience | Audience identity/version, governed recipient selectors, reason, and idempotency key | Authorize named/manual recipients, reapply policy, create a new version, and invalidate stale approval |
| Read suppressions | Audience identity/version and cutoff | Return unsubscribe, global suppression, bounce, complaint, invalid, do-not-email, and review-required state with provenance |
| Create/update draft | Audience identity/version, content/template selector, campaign dates, and idempotency key | Render exact UTF-8 HTML/plain text and validate server-owned sender, reply-to, address, category, tracking, and unsubscribe configuration |
| Approve campaign | Draft identity/hash, audience version, action, and idempotency key | Persist approval bound to the exact immutable inputs and reject stale approval |
| Test send | Approved campaign identity and stable test idempotency key | Prepare and execute exactly one governed test effect and return deterministic requested/prepared/accepted/rejected state |
| List send/schedule | Approved campaign identity and stable live idempotency key | Revalidate approval and execute exactly one legal provider effect under a lock |
| Pause, resume, cancel, or reschedule | Campaign identity, intended transition, and idempotency key | Validate current server-owned state and execute exactly one legal transition |
| Reconcile operation | Campaign/operation identity or idempotency key | Determine a prior mutation's canonical outcome before replay |
| Reconcile events | Campaign identity and bounded cutoff/cursor | Authenticate provider events, deduplicate them, and advance the cursor atomically |
| Report statistics | Campaign identity, mode, dimensions, and cutoff | Return separate test/live aggregates and freshness for every required metric |
| Upsert capability issue | Missing operation, sanitized context, attempts, completed work, impact, acceptance criteria, and stable key | Create/update one tenant-scoped issue through PO/GO orchestration and return a durable ID |

The baseline `education_center_send_sendgrid_campaign` supports only the
semantics declared by its live schema. Its presence does not prove audience,
suppression, approval, test, lifecycle, event, statistics, or issue operations.

## Mutation boundary

Every mutation must enter an authenticated router, execute through PO
orchestration, validate current scope and complete plan, acquire an operation
lock when needed, invoke tenant-scoped GO repositories, emit events/metrics,
write an audit, and return a deterministic result. The client supplies no raw
database changes, provider payload, provider account selector, or authority ID.

Provider effects use stable campaign/mode identities and idempotency keys. A
repeated accepted test or list operation returns the canonical prior result.
Unknown outcomes require reconciliation before retry.

## Audience rules

- Make source combination and cohort priority explicit. Preserve every matched
  cohort tag even when one priority determines display order.
- Prefer stable family/guardian/contact identities over email-only matching.
- Select responsible adults for child-related records and require server-owned
  marketing eligibility.
- Source membership or prior correspondence alone does not establish consent.
- Apply the strictest current status across sources. Keep overlapping exclusion
  reasons while counting each excluded address once.
- Treat manually named/internal recipients as governed additions. Require an
  authorized server selector and business reason; never pass an arbitrary raw
  address as authority.
- Persist the query, source cutoffs, provenance, cohort tags, eligibility
  reasons, aggregate counts, audience hash/version, and approval relationship.

## Issue record

After manifest refresh and bounded recovery, upsert one structured record for a
still-missing required operation. Use a stable key derived from product,
missing semantic operation, manifest fingerprint, and active workflow—not from
raw tenant identifiers. Include:

- missing semantic operation and observed tool/schema state;
- sanitized server-returned context summary and manifest fingerprint;
- recovery attempts and timestamps;
- completed workflow steps and preserved server-owned identities;
- user impact and blocked next action; and
- exact, testable acceptance criteria.

Use a discovered governed issue operation. `bos_submit_feedback` may carry the
record when its live schema supports the required structured fields and returns
a durable ID. Never create a local offline issue queue.

## Metrics

Return category and reporting cutoff with every test/live result. Include:

`requested, suppressed, prepared, accepted, rejected, delivered, bounced, unique_human_opens, unique_human_clicks, unsubscribes, complaints, conversions`

Present `unique_human_opens` as unique human opens and
`unique_human_clicks` as unique human clicks.

Treat HTTP 202 as `accepted`. Delivery requires authenticated event evidence.
Use provider/server definitions when supplied; otherwise calculate rates with
their numerator and denominator. Keep test/internal and scanner activity out of
live human-performance metrics.
