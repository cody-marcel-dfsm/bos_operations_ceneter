---
name: education-center-parent-communications
description: Handle Education Center parent communication workflows through customer-configured evidence routes and the tenant-scoped BOS MCP. Use for business-hours calls, after-hours calls, email evidence, text messages, reviews, communication follow-up, transcript or outcome retrieval, response drafting, escalation, and missing communications capability diagnosis.
---

# Education Center Parent Communications

## Tenant terminology

Load effective customer settings and resolve the brand through
`education-center-service-routing`. Use `brand_display_name`, or the active
skill extension's `terminology.brand_display_name` override, wherever
customer-facing output names the franchise or brand. Keep technical product,
skill, route, server, environment-variable, tool, capability, authorization,
and record identifiers unchanged.

This skill is for authenticated adult school staff performing legitimate
school administration. Communications involving a minor must be directed to
the authorized parent or guardian unless an approved school policy and
capability explicitly provides otherwise. Minimize contact and transcript data
and never expose it outside the selected tenant and requested workflow.

Use the named `education-center` MCP connection and follow the `bos-mcp-client`
context workflow for every BOS-routed domain. Resolve effective customer
settings from the packaged template plus the preserved customer overlay.
For email correspondence evidence, follow
`source_routes.parent_communications`:

- `bos`: use the published Education Center email search and full-thread evidence tools.
- `connected_gmail`: invoke `email-account-routing`, select exactly
  `mailboxes.parent_communications`, and use the normal Gmail connector's
  bounded search and full-thread tools.

The external Gmail route supplies read-only correspondence evidence. Select
the communication channel's configured BOS plugin for calls, SMS, reviews, and
delivery; never substitute Gmail for those channels.
Use `bos-visual-output` for multi-family contact queues, channel outcomes,
response status, and follow-up timelines.
For a BOS-routed provider authentication error, follow `bos-mcp-client`
recovery. For `connected_gmail`, use the Gmail connector's native account
recovery for the exact configured mailbox. Never treat either route as a
fallback for the other or as authority to send a message.

## Email evidence and follow-up

- Search from 30 days before the requested operating period through its end,
  then retain only correspondence relevant to the requested families and dates.
- Hydrate every relevant result with the selected route's full-thread tool
  before interpreting attendance, schedule, pickup, accommodation, or follow-up
  facts.
- Preserve mailbox and provider provenance internally. Omit message bodies and
  unrelated family details from the output.
- Drafting or sending remains a separately authorized action through a
  published tool for the requested channel.

## Calls during business hours

- Use the configured telephony/voice plugin for tasks, transcripts, outcomes,
  and follow-up state.
- Preserve received time, business-hours classification in `timezone` from the
   effective customer `timezone`, and
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
- Use the configured reviews/reputation plugin and the Education Center composite
  review-outreach action when published. Keep all template reads, rendering,
  SendGrid delivery, provider-event reconciliation, and state tracking
  server-side through BOS MCP. Never use Gmail to deliver review outreach.
- Retrieve and summarize reviews through read tools. Prepare or publish a
  response only through the exact supported workflow and required approval.

## Output

State channel, date range, communication records, status, follow-up or
escalation required, and capability gaps. Minimize phone numbers, contact data,
and transcript content.
