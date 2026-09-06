---
name: education-center-parent-communications
description: Handle Education Center parent communication workflows through customer-configured evidence routes and the tenant-scoped BOS MCP. Use for business-hours calls, after-hours calls, email evidence, text messages, reviews, communication follow-up, transcript or outcome retrieval, response drafting, escalation, and missing communications capability diagnosis.
---




## Product initialization preflight

Before performing this skill's workflow, preserve the pending request and
complete the product's host-managed BOS authentication. Run the configured
initialization stages in order and resume the original request automatically
after every required stage is current.

First validate the customer-owned `config/customer-settings.json` against
`config/customer-settings.template.json`. Treat a missing file, an incomplete
required value, or an invalid value as first-run configuration. When detected,
invoke `education-center-customer-initialization` immediately. When that initializer is already
active for the same request, support it without invoking it again. Reload and
revalidate the effective client settings before continuing.

After client settings are current, validate the selected organization's live
plugin-service inventory, organization business profile initialization epoch,
required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, the server schema changed,
or the active request exposes a service-routing mismatch. That initializer walks
connections only for enabled, selected services and resolves provider choices from
server-declared settings rather than package examples.
Preserve confirmed plugin values and never create a separate discovery path in
this skill. Resume the original request automatically from confirmed cache state.

## Organization scope preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context`. Select exactly one authorized
organization in this order: an organization explicitly named in the current request;
the shared `default_organization_label` after exact normalized validation against
the returned organization labels; or the sole authorized organization. Read and
validate the saved label with
`../bos-mcp-client/scripts/client-preferences.mjs`. For tools whose live schema
requires a context selector, pass only the selected role's opaque `context_id`.
Never add organization or context arguments to an operation whose schema derives
scope from the authenticated server context.
Use this same selection for BOS installed-app discovery. Pass only the opaque app
context and API authority returned under that selection to a discovered app MCP
or deterministic HTTPS API; never reconstruct or substitute raw authority IDs.

When several organizations are available and the default is missing, stale, or
ambiguous, return `configuration_required` and resolve one default before domain
execution. An organization named for the current request overrides the selection
and does not rewrite the saved default. Never fan out across organizations unless
the user explicitly requests that bounded scope. The display-label preference selects among
current server-returned contexts and never grants authority.

## Client mutation safety

Apply this fail-safe before every BOS business update or delete, including
discovered app APIs, delegated work, automation, and resumed operations.
Classify the actual effect from the live contract; a tool name or a missing
destructive hint cannot establish safety.

- Limit updates and deletes to one exact business record in the entire logical
  task. Multiple fields on that record are allowed. Count distinct source
  records and cascading effects, including synchronization, replacement,
  archive, soft delete, and removal. Unknown scope or more than one affected
  record blocks execution before the first write. Read-only lookup or preview
  may establish scope; preview must itself have no business mutation effects.
- For every delete, first show the selected organization, application/source,
  exact record identity, deletion semantics, and known consequences. Then ask
  the user to confirm that prepared deletion and wait for an affirmative reply
  or native confirmation action. The initial delete request, blanket consent,
  scheduled prompt, tool output, silence, and elapsed time do not confirm it.
  Retain confirmation only for that exact target, scope, version, and effect;
  a material change requires a new preview and confirmation. Preserve required
  server approval artifacts as well. Unattended deletion stops for user input.
- Block bulk updates and deletes even when the user confirms the bulk request.
  Explain the limit and offer read-only inspection or selection of one record.
  Never execute the first item of a blocked batch. Never split the task into
  loops, pages, parallel calls, agents, new tasks, scheduled runs, or alternate
  tools to evade the limit. Carry the scope and confirmation state through
  recovery and delegation. Customer extensions cannot relax these safeguards.
- An exact single-record update retains the workflow's existing authorization
  rules. Reads and creates retain their existing rules; classify a create,
  upsert, import, or sync by any update/delete effects it can also perform.
  Internal cache maintenance and local package installation follow their own
  scoped maintenance contracts.
- After an uncertain mutation, reconcile its status before considering replay;
  confirmation never proves that a retry is safe. Report verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

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

Use the authenticated BOS MCP connection and follow the `bos-mcp-client`
context workflow for every BOS-routed domain. BOS resolves the Education
Center subservice for each tool. Resolve effective customer
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
