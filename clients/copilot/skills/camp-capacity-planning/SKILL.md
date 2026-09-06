---
name: camp-capacity-planning
description: Analyze education-center camp capacity, paid registrations, partner child-days, weekly calendars, rosters, cancellations, open seats, and source discrepancies through tenant-scoped BOS evidence.
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

# Camp Capacity Planning

Use `bos-visual-output` for the final report. Treat this as seat and attendance
planning: identify which students occupy which real camp sections on each day,
then place authorized partner child-days without exceeding daily capacity.

## Evidence and authority

1. Call `bos_get_context` and use only its server-issued context.
2. Read customer settings for timezone, source roles, provider routes, report
   labels, and capacity defaults. Package no mailbox, location, tenant, or
   timezone default.
3. Retrieve camp sections, paid enrollments, partner evidence, cancellations,
   rosters, and reconciliation through discovered BOS operations. Use a
   separately connected mailbox only when customer settings explicitly route
   that source and its authenticated identity matches.
4. Follow the shared `bos-mcp-client` cache protocol for authorized read
   evidence. Refresh uncovered intervals and commit only after every source
   page succeeds.
5. Treat missing or stale provider evidence as partial coverage, never as zero.

## Planning rules

- Paid students remain in the purchased camp and dates.
- Each partner service date is one child-day, not a full-week enrollment or a
  separate camp.
- Explicit cancellation evidence controls attendance and exposes stale source
  rows as discrepancies.
- Place partner child-days after paid seats. Prefer continuity, then the
  highest occupied active section, without exceeding daily capacity.
- Leave a child-day unassigned only when every active section is full.
- Preserve provider freshness and reconciliation status in the result.

## Default next-week report

Resolve the next Monday-through-Friday window in the configured site timezone.
Return the date range, paid and partner student/child-day totals, daily
headcount, peak, capacity, open seats, a five-day calendar image, a minimal
family contact list, one reconciliation sentence, and one recommendation only
when a placement or staffing decision is needed.

Create the image with `scripts/render_week_calendar.py` from verified JSON.
Keep guardian contacts, provider IDs, and notes out of the image. Read
[references/data-model.md](references/data-model.md) for reconciliation keys,
allocation detail, and audit output fields.
