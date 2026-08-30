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

After client settings are current, validate the server plugin-settings
initialization epoch, required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, or the server schema changed.
Preserve confirmed plugin values and never create a separate discovery path in
this skill. Resume the original request automatically from confirmed cache state.

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
