---
name: bos-visual-output
description: Present BOS operational results as polished visual-first briefs using charts, timelines, diagrams, maps, images, status markers, and compact tables when they materially improve comprehension. Use with BOS MCP results, reconciliation, rosters, schedules, pipelines, capacity, campaigns, invoices, attribution, reviews, performance summaries, daily planners, and executive operating reports.
---

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

For any lead or contact detail request, including a single requested field,
profile, or status, invoke the installed
`my-crm-customer-journey` skill and lead with its native graph, including for
one record. A stage label, detail table, or history list alone is incomplete.
Keep the current node, the explicit or application-owned goal, exact connecting
node paths, and known
gates or blockers visible on the diagram. Show each lead state as a distinct
node, emphasize the current-to-goal route, and use concise transition labels
and clearly differentiated completed, pending, and blocked states. Follow the
journey skill's layout and accessible status styling. Obtain application-owned graph and
path evidence before drawing transitions; explicitly report unavailable graph
evidence without inventing a path. When independently verified current-state
facts are available, use the journey skill's partial-evidence diagram only after
its discovery and read sequence cannot supply a path. State that the path result
is incomplete and identify the specific missing evidence.

Return requested fields and relevant profile details below the graph. The user
may omit a goal; apply the journey skill's application-owned goal resolution and
show paths to the resolved goal or labeled alternatives. Missing completion
history or available actions never suppresses verified structural paths. Honor
an explicit user format preference.

Use concise prose for a single fact or record unrelated to lead/contact details,
a short draft, an error, or a result whose visual would add decoration without
information.

## Preferred forms

- Schedule, trials, camps, and staff coverage: chronological timeline or
  calendar lanes.
- Capacity and attendance: stacked bars, occupancy bars, or day-by-day heatmap.
- Individual journey or progress toward a goal: application-owned journey
  graph with current position and target goal emphasized.
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
