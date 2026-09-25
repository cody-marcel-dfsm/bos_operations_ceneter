---
name: education-center-trial-reconciliation
description: Reconcile Education Center organization scheduled trials across BOS Lead Director, Google Calendar, and Gmail, identify families needing confirmation or scheduling follow-up, and create appropriate Gmail drafts. Use for requests such as “show every trial during the next seven days,” “which trial families need confirmation or follow-up,” “find Testy’s trial,” “reconcile upcoming trials,” or “prepare trial confirmation/follow-up drafts.”
---




## Product initialization preflight

Before performing this skill's workflow, preserve the pending request and
complete the product's host-managed BOS authentication. Run the configured
initialization stages in order and resume the original request automatically
after every required stage is current.

First validate the customer-owned `config/customer-settings.json` against
`config/customer-settings.template.json`. Treat a missing file, an incomplete
required value, or an invalid value as first-run configuration. Also migrate a
missing/invalid `default_context` or missing/invalid product-specific BOS
customer preference store. Restore a confirmed valid mirror for this plugin without asking again;
confirm a new default once through the consolidated setup. When detected,
invoke `education-center-customer-initialization` immediately. When that initializer is already
active for the same request, support it without invoking it again. Reload and
revalidate the effective client settings before continuing.

For live `bos-identity-mcp/v2`, discover the requested operation first. Missing
optional plugin-profile setup tools do not block an independently advertised
ready operation with no declared dependency on that setup. Keep that profile
setup incomplete, preserve operation-specific readiness requirements and
denials, and continue the requested operation without initializer recursion.
Otherwise, after client settings are current, validate the scoped grant's live
plugin-service inventory, organization business profile initialization epoch,
required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, the server schema changed,
or the active request exposes a service-routing mismatch. That initializer walks
connections only for enabled, selected services and resolves provider choices from
server-declared settings rather than package examples.
Preserve confirmed plugin values and never create a separate discovery path in
this skill. Resume the original request automatically from confirmed cache state.

## Scoped authorization preflight

First apply the versioned identity-context workflow in `bos-mcp-client`.
For live `bos-identity-mcp/v2`, resolve explicit request scope or the saved
customer default against fresh authorized contexts, discover tools for the
selected handle, and execute with that same handle. This branch governs
context selection throughout this skill, including older scoped-grant wording.
A missing operation never permits changing organization or role to find it.
The following single-context rules apply only to legacy scoped-grant discovery.

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

- Limit updates and deletes to one exact conceptual business record in the
  entire logical task. Multiple fields on that record are allowed. That record
  may resolve to one through five explicit source-record targets in one
  discovered service request. Count distinct conceptual records and cascading
  effects, including synchronization, replacement, archive, soft delete, and
  removal. Unknown scope, more than five source targets, or more than one
  conceptual record blocks execution before the first write. Read-only lookup
  or preview may establish scope; preview must itself have no business mutation
  effects.
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
- An exact one-conceptual-record update retains the workflow's existing
  authorization rules. Reads and creates retain their existing rules; classify
  a create, upsert, import, or sync by any update/delete effects it can also
  perform. Internal cache maintenance and local package installation follow
  their own scoped maintenance contracts.
- After an uncertain mutation, invoke only the exact service-returned bodyless
  state action and service-declared timing. Never replay the mutation or
  construct a status route, selector, retry schedule, or reconciliation
  request. Confirmation never proves that another mutation is safe. Report
  verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

# Education Center Trial Reconciliation

## Tenant terminology

Load effective customer settings and resolve the brand through
`education-center-service-routing`. Use `brand_display_name`, or the active
skill extension's `terminology.brand_display_name` override, wherever
customer-facing output names the franchise or brand. Keep technical product,
skill, route, server, environment-variable, tool, capability, authorization,
and record identifiers unchanged.

This skill is for authenticated adult school staff performing legitimate
school administration. Students and minors are data subjects, never users or
operators. Use family identity only to reconcile a user-requested trial and
minimize it in output. Draft communications to the authorized parent or
guardian and never send them without an explicit authorized request.

Use the authenticated BOS platform connection exclusively. The MCP provides tenant-scoped primitives; perform
query planning, identity expansion, cross-source matching, classification, and
reporting in the GPT client.
When Gmail or Calendar reports an authentication error, follow
`bos-mcp-client` authentication recovery and prompt the user to complete Google
authorization through the secure BOS setup page. After readiness, follow only
the exact service-returned continuation action; never replay the failed business
request on the client's own schedule.
Use `bos-visual-output` for the final result. Prefer a chronological trial
timeline with direct status labels, then a compact family action table and
draft list.
When three or more families or trial states are present, render an actual
timeline or Mermaid status flow before the table; status emoji alone does not
count as the visual.

## Mandatory workflow

1. Resolve the requested window using `timezone` from the installed product's
   `config/customer-settings.json` and state it. Interpret
   “next seven days” as now through the same local time seven days later; for
   date-based primitives, search from today's local date through the local date
   containing that endpoint.
2. Call `bos_get_context` once. Use the BOS connection's grant-bound Lead Director scope and
   verify Lead Director, Gmail, and Google Calendar read capabilities are healthy.
3. Search Calendar across the full window without a text filter. Use
   `start_date`, `end_date`, and `time_zone`.
4. Search Lead Director for:
   - records whose trial date falls in the window;
   - active trial candidates using supported status, node type, date, and
     identity filters.
5. Search Gmail with the primitive's `q` field for trial inquiries, bookings,
   confirmations, reminder requests, reschedules, and cancellations relevant to
   the window. Use bounded Gmail-native queries, including `after:`/`before:`
   dates and terms such as `{trial "Book a Free Trial Class" "trial class"}`,
   then run narrower booking/confirmation/cancellation searches when needed.
   Do not use `query`; the current Gmail primitive reads `q`.
   Gmail is a required candidate source even when Lead Director and broad
   Calendar return zero records.
6. Call `gmail_get_thread` for every relevant Gmail search result. Determine
   relevance from the bounded query and returned metadata; do not hydrate an
   unbounded mailbox listing. Search
   returns message/thread identifiers and mailbox identity; the thread payload
   supplies the subject, sender/recipient, snippet, and body needed to extract
   the family identity. Decode and inspect the message content.
7. Extract each candidate’s exact email, normalized full name, phone, student
   name, requested class, and provider IDs from every returned source.
8. For every Gmail or Lead Director candidate without an exact Calendar match,
   run targeted searches before classification:
   - Calendar `q` with exact email;
   - Calendar `q` with exact full name;
   - Calendar `q` with student name or another source-backed strong identity;
   - Lead Director with exact email, phone, and name as needed.
9. Merge records using this evidence order: stable provider/booking ID, exact
   email, exact phone, then exact full family name plus compatible date or
   student. Keep weak or conflicting matches separate.
10. Classify:
   - `Scheduled`: exact-matched, non-cancelled Calendar/booking event in range.
   - `Needs confirmation`: scheduled with no completed confirmation evidence.
   - `Needs scheduling follow-up`: qualified inquiry plus completed targeted
     searches and no scheduled event.
   - `Needs review`: weak or conflicting identity evidence.
   - `Source incomplete`: any required source or exact-identity search failed.
11. When drafts are requested, create:
    - a confirmation draft only from a source-backed scheduled date/time/class;
    - a scheduling draft only after the full targeted-search loop finds no event.
    Create no draft for `Needs review` or `Source incomplete`. Never send Gmail.

## Completion gates

Before answering, verify all of these:

- Gmail search completed and its candidates were reconciled.
- Every relevant Gmail search hit was hydrated with `gmail_get_thread`.
- Every unmatched candidate received identity-targeted Calendar searches.
- Every scheduled record includes an exact identity match and stable event ID.
- Every follow-up record includes a completed targeted-search trace.
- Counts equal the displayed family records.
- Source failures are reported separately from genuine zero results.

Do not state “Calendar confirmed zero,” “no families need follow-up,” or “no
trials are scheduled” from broad Calendar and Lead Director searches alone.
An empty broad result is the start of candidate expansion, not family-level
absence evidence.

Treat first-name-only, last-name-only, and narrative-word matches as weak.
For example, do not match the family name `Patience` from an unrelated use of
the word “patience.” Gmail language requesting a trial reminder proves inquiry
and communication intent; it does not independently prove an appointment.

If any completion gate fails, continue searching when the primitive is
available. Otherwise report `Source incomplete` with the exact tenant, plugin,
capability, sanitized credential state, and correlation ID.
