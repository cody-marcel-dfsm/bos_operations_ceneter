---
name: icode-parent-communications
description: Handle iCode parent communication workflows through the tenant-scoped BOS MCP. Use for business-hours calls, after-hours calls, text messages, reviews, communication follow-up, transcript or outcome retrieval, response drafting, escalation, and missing telephony/SMS/review capability diagnosis.
---

# iCode Parent Communications

Use `bos_icode` and follow the `bos-mcp-client` context workflow. Select the
communication channel's configured BOS plugin; never substitute Gmail for
calls, SMS, or reviews.
Use `bos-visual-output` for multi-family contact queues, channel outcomes,
response status, and follow-up timelines.
Use only BOS MCP or published BOS backend APIs with the iCode organization's
plugin credentials. Browser sessions and native/local connectors provide no
authorization, evidence, delivery path, or fallback.
When a communications provider reports an authentication error, follow
`bos-mcp-client` authentication recovery and prompt the user to complete the
service-specific secure BOS browser flow before retrying once.

## Calls during business hours

- Use the configured telephony/voice plugin for tasks, transcripts, outcomes,
  and follow-up state.
- Preserve received time, `America/Denver` business-hours classification, and
  escalation state.

## Calls after hours

- Use the configured telephony/voice and after-hours workflow.
- Separate answered, missed, escalated, and pending-follow-up calls based on
  explicit provider fields.

## Text messages

- Use the configured SMS/comms plugin.
- Draft or update only through published tools. Never claim a text was sent
  without an authorized send capability and explicit user request.

## Reviews

- Use `bos-google-review-outreach` for review requests, Drive-hosted HTML
  templates, reviewer discovery, canonical review links, eligibility,
  recipient plans, SendGrid delivery, reconciliation, and follow-ups.
- Use the configured reviews/reputation plugin and the iCode composite
  review-outreach action when published. Keep all template reads, rendering,
  SendGrid delivery, provider-event reconciliation, and state tracking
  server-side through BOS MCP. Never use Gmail to deliver review outreach.
- Retrieve and summarize reviews through read tools. Prepare or publish a
  response only through the exact supported workflow and required approval.

## Output

State channel, date range, communication records, status, follow-up or
escalation required, and capability gaps. Minimize phone numbers, contact data,
and transcript content.
