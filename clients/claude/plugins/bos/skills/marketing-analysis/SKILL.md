---
name: marketing-analysis
description: Organize, audit, and analyze tenant-scoped marketing campaigns across SendGrid, email, Calendar, GA4, Google Ads, attribution, contact hygiene, suppressions, and campaign artifacts.
---



## Scoped authorization preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context` to validate the exact scoped OAuth
connection. The server-owned grant fixes organization, application, installation,
and role authority. Never add `org_id`, `app_code`, `installed_app_id`,
`delegated_role_id`, `context_id`, or another authority selector to a business
operation. Invoke only the operation's live-declared business arguments.
Use the same scoped connection for BOS installed-app discovery. Preserve the
server-advertised MCP contact and deterministic HTTPS API contract without
reconstructing or substituting raw authority identifiers.

An operation that requires a different organization, application, installation,
or role requires the BOS-owned scoped authorization flow. The client never changes
authority by adding request arguments.

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

# Marketing Analysis

Treat the campaign's explicit business objective as the reporting contract.
Keep provider metrics separated until attribution is verified.

## Workflow

1. Resolve the campaign metadata: goal, ID, lifecycle, audience, channel,
   timestamp, primary KPI, required sources, and source artifacts.
2. Derive source priority from the objective. Partnership and appointment work
   requires mailbox and Calendar outcomes; announcements require delivery and
   analytics; paid ads require ad-platform and funnel evidence.
3. Route email through `email-account-routing`. Query all other providers
   through the server-issued BOS context or an explicitly authorized connector.
4. Pull current evidence before reporting current performance. Local artifacts
   identify the campaign and baseline; they do not prove live outcomes.
5. Separate sends, delivery, bounces, opens, human-filtered clicks, replies,
   bookings, sessions, events, spend, conversions, revenue, and suppressions.
   Exclude tests, internal recipients, and scanner activity by default.
6. Compare against the latest compatible snapshot when change is requested.
   Use one date window, timezone, and attribution definition.

## Output

Lead with `Bottom line`, `KPIs`, `What it means`, `Recommendation`, and `Next
action`. Use `BLOCKED: <source> access unavailable` when a required source
cannot be checked, and limit conclusions to verified facts. Create files only
when requested or when a durable source snapshot is part of the task.

For new campaigns, define the goal, KPI, audience, channel, source identifiers,
UTMs, provider categories, expected mailbox and Calendar keys, follow-up plan,
and effectiveness rule before a send. Preserve suppression fields and maintain
one person per contact row.
