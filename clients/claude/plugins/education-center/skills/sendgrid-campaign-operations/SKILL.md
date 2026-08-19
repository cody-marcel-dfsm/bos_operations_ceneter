---
name: sendgrid-campaign-operations
description: Build, approve, send, monitor, and report SendGrid email campaigns through tenant-scoped BOS workflows. Use when asked to create a campaign audience from Gmail, Calimatic, Lead Director, or other configured services; deduplicate and suppress contacts; create, schedule, pause, resume, cancel, or inspect a campaign; reconcile delivery events; report sends, deliveries, bounces, opens, clicks, unsubscribes, conversions, or campaign progress; or diagnose missing SendGrid lifecycle capabilities.
---

# SendGrid Campaign Operations

Use `bos-mcp-client` for authenticated context, live tool discovery, transport
recovery, and provider authorization recovery. For Education Center work, use
`education-center-service-routing` to select each configured evidence source.
Use only the matching product's authenticated BOS MCP connection for SendGrid
mutations. BOS derives organization, installation, role, plugin, provider
binding, sender, and credentials from server-owned context.

Read [references/capability-contract.md](references/capability-contract.md)
before building an audience or changing a campaign.

## Operating workflow

1. Resolve the authenticated BOS context and discover the live tool schemas.
   Confirm the authorized SendGrid capability and every configured source
   needed by the customer's query. Treat a route name as selection, never
   authority.
2. Convert the request into explicit audience criteria: sources, inclusion
   rules, exclusions, time window, relationship or enrollment status, guardian
   identity when minors are involved, and union or intersection behavior.
3. Query each source through its configured route. Use the shared local
   document-cache workflow for reusable reads. Preserve source, query, record
   identity, and freshness as evidence.
4. Normalize addresses case-insensitively, resolve one contact identity,
   deduplicate across sources, and apply server-returned consent, suppression,
   unsubscribe, hard-bounce, complaint, and do-not-contact state. A Gmail
   message, Calimatic enrollment, or other customer relationship is audience
   evidence; it does not independently prove marketing eligibility.
5. Present a privacy-safe audience preview with matched, unique, eligible, and
   excluded counts plus exclusion reasons. Keep full recipient details out of
   chat unless the user explicitly requests the list.
6. Validate subject, content or template identity, sender and reply-to state,
   physical-address/unsubscribe behavior, category, tracking, CTA links, and
   test mode from the server-returned plan. Never request or supply provider
   credentials, sender IDs, suppression-group IDs, or raw SendGrid payloads.
7. Require explicit user approval of the final audience, content, and send or
   schedule action before an external list send. Use a stable idempotency key.
   Reconcile uncertain mutation outcomes before retrying.
8. Execute only operations exposed by the discovered schema. The current
   baseline may expose `education_center_send_sendgrid_campaign`; call it only
   when its live schema supports the approved request. Report an exact
   capability gap for unavailable list, scheduling, pause, resume, cancel,
   event, or statistics operations.
9. After execution, reconcile server-owned campaign state and authenticated
   provider events. Treat SendGrid acceptance as `accepted`, and count
   `delivered` only from delivery evidence. Repeat reads until the requested
   reporting cutoff or until the server reports a terminal state.
10. Report progress and the next legal lifecycle action. Perform later
    mutations only when separately requested or already covered by the user's
    explicit campaign-management instruction.

## Safety and measurement

- Fail closed on missing or ambiguous tenant context, source account, campaign
  identity, audience eligibility, sender configuration, or authorization.
- Never use Gmail to deliver a SendGrid campaign and never treat browser state,
  local credentials, uploaded API keys, or arbitrary contact lists as BOS
  authority.
- Keep provider effects idempotent. Never replay a send whose outcome is
  uncertain.
- Exclude tests, internal seed recipients, and scanner-like activity from
  customer-facing performance metrics when the evidence identifies them.
- Count a conversion only from its owning business system. A link click is not
  a purchase, enrollment, booking, review, or reply.
- Report provider metrics with their observation window and last reconciled
  timestamp. Label unavailable or provisional metrics plainly.

## Output

Lead with campaign name, audience status, lifecycle state, and next action.
For audience work, show matched, deduplicated, eligible, excluded, and source
counts. For performance work, show accepted, delivered, bounced, unique human
opens, unique human clicks, unsubscribes, complaints, conversions, rates, and
the reporting cutoff when available. Include `Blocked:` for any required live
capability or authorization that is unavailable.
