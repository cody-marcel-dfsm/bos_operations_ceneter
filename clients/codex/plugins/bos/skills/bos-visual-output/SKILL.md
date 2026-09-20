---
name: bos-visual-output
description: Present BOS operational results as polished visual-first briefs using charts, timelines, diagrams, maps, images, status markers, and compact tables when they materially improve comprehension. Use with BOS MCP results, reconciliation, rosters, schedules, pipelines, capacity, campaigns, invoices, attribution, reviews, performance summaries, daily planners, and executive operating reports.
---



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

# BOS Visual Output

Transform verified BOS results into the smallest useful visual composition.
Preserve exact values, tenant scope, source status, privacy, and operational
meaning. Use the installed `visualize` skill for inline interactive visuals and
follow its complete rendering, accessibility, and theme contract.

## Delivery floor

Return every operational record and requested field directly in the
conversation. A visual supports the result and never replaces a requested
roster, contact list, exception list, action list, or exact record table.

Never expose a local filesystem path or make a local HTML file or `visualize`
content reference the only customer-facing result. For student rosters, family
contact reports, and other personally identifiable operational lists, use
mobile-safe Markdown headings and stacked bullets or a compact table. When an
authenticated adult staff user explicitly requests a roster image, include the
minimum student names and placements needed in that image and keep guardian,
phone, email, provider IDs, and notes in direct operational text. Generate or
export a file only when the user explicitly requests one.

## Visual-first decision

Choose a visual whenever the result contains:

- three or more comparable categories, statuses, periods, or cohorts;
- a schedule, sequence, pipeline, or lifecycle;
- capacity, utilization, conversion, attribution, or trend measures;
- cross-source reconciliation with several matches, conflicts, or gaps;
- geographic data with verified coordinates or published boundaries;
- a hierarchy or relationship that is clearer as a diagram.

When one of these conditions is present, deliver an actual chart, timeline,
Mermaid diagram, map, image, or inline visualization. A Markdown table with
emoji or status icons does not satisfy this requirement by itself.

Use concise prose for a single fact or record,
a short draft, an error, or a result whose visual would add decoration without
information.

## Preferred forms

- Schedule, trials, camps, and staff coverage: chronological timeline or
  calendar lanes.
- Capacity and attendance: stacked bars, occupancy bars, or day-by-day heatmap.
- Individual journey or progress toward a goal: application-owned journey
  graph with current position and target goal emphasized.
- Agent-Driven Custom Journey: compiler-normalized graph with client and server
  ownership, current/completed labels, approvals, waits, bounded recovery and
  terminal outcomes. Use graph-authored labels only; omit seed data, attendee
  addresses, temporary artifacts, receipts containing private references,
  provider payloads, capability URIs, and internal identifiers.
- Lead pipeline and conversion: ordered funnel or stage bars with counts and
  rates.
- Reconciliation: source-to-record flow, compact match matrix, or status bars.
- Campaigns and attribution: trend or grouped bars with source and outcome.
- Invoices and billing: variance bars plus a compact exception table.
- Rosters and contact operations: compact table; add counts visually when there
  are several classes or cohorts.
- Architecture, dependencies, and causal paths: Mermaid flowchart or sequence
  diagram.
- Locations: map only from verified coordinates and published geometry.

Use source-backed photos, logos, thumbnails, or document previews when they
help identify the subject or evidence and BOS returns them. Use AI-generated
images only for an explicitly requested creative deliverable. Never expose
private student or family images without explicit authorization.

For a static schedule, pipeline, lifecycle, or reconciliation with three or
more records or states, Mermaid is the minimum visual fallback when an inline
chart is unavailable. For quantitative comparisons with three or more values,
render a bar, line, stacked, heatmap, or scatter chart.

## Composition

Lead with the primary visual. Add at most three headline metrics when they
change the decision. Put exact operational records in one compact table below
the visual when needed. Finish with a short action list containing only
decisions, exceptions, drafts, or next steps.

Direct-label important values and statuses. Use stable category ordering and
pair color with text or shape. Keep source limitations distinct from zero
results. Include a concise accessible summary for every chart or image.

Avoid repeating the same facts in prose, cards, charts, and tables. Avoid pie
charts when precise comparison matters. Avoid decorative dashboards, invented
scores, stock imagery, and charts built from fewer than three meaningful data
points.

## High-contrast chart contract

Use opaque, saturated, colorblind-conscious fills on a white or near-white
plot background. Default categorical colors to navy `#005A9C`, vermillion
`#C43B00`, and teal `#007A5E`; extend with purple `#6F42C1` and dark gold
`#9A6700` only when more series are required. Use charcoal `#1F2937` for
titles, axes, tick labels, and value labels, and light gray `#D1D5DB` for
gridlines.

- Give adjacent categories different hues and direct-label each value.
- Use solid fills at 100% opacity. Do not use cream, pale yellow, pastel,
  low-opacity, or near-background fills for primary data marks.
- Maintain at least 3:1 contrast between data marks and the plot background
  and at least 4.5:1 contrast for text.
- Preserve meaning consistently: teal for active, complete, or billable;
  vermillion for cancelled, blocked, or failed; navy for scheduled, expected,
  or neutral totals.
- Pair status colors with labels, patterns, or marker shapes so color is never
  the only status cue.

## Artifact organization

Keep every generated artifact organized. In a project repository, place final
deliverables under the existing singular
`output/<artifact-type>/<workflow>/` hierarchy. Place renders, previews,
inspection results, extracted data, builders, and other working files under
`tmp/<workflow>/`. Never write generated artifacts or support files to the
project root. Use an explicit user-selected destination or an established
operational output directory when one applies. Keep the user-facing final
directory limited to final deliverables unless the user requests supporting
files.

## Privacy and evidence

Aggregate family and student data in charts. Put personally identifiable
details only in an operational table when the request requires them. Never
encode credentials, provider IDs, private message bodies, or unrelated notes in
a visual. Label estimates, partial source coverage, and unmatched records
directly.

## Failure output

For partial or failed workflows, show a compact source-status diagram or table
when three or more sources are involved. State the affected tenant, plugin,
capability, sanitized credential state, and correlation ID in concise prose.
