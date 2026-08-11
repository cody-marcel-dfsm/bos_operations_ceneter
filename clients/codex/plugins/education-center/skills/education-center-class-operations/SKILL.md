---
name: education-center-class-operations
description: Handle Education Center class rosters, schedules, capacity, camp enrollment reports, family contact rosters, and camp-assignment scenarios through tenant-scoped BOS data plus Care.com confirmations from the configured customer mailbox. Use when asked for students enrolled in a class or camp by day, family phone numbers, classes, camps, enrollment reports, rosters, attendance dates, open seats, Bright Horizons or Care.com placement, or assigning students to camps.
---

# Education Center Class Operations

## Tenant terminology

Load effective customer settings and resolve the brand through
`education-center-service-routing`. Use `brand_display_name`, or the active
skill extension's `terminology.brand_display_name` override, wherever
customer-facing output names the franchise or brand. Keep technical product,
skill, route, server, environment-variable, tool, capability, authorization,
and record identifiers unchanged.

This skill is for authenticated adult school staff performing legitimate
school administration. Students and minors are data subjects, never users or
operators. Access and display only the minimum student or family information
needed for the requested roster, capacity, attendance, or placement task. Do
not publish, export, or distribute it without a separate authorized request.

Use the named `education-center` MCP connection and follow the
`bos-mcp-client` context workflow.
Use Calimatic for class/enrollment state and Calendar only as schedule evidence.
Resolve the effective customer settings by loading the packaged settings
template and recursively overlaying the preserved customer settings file. For
Care.com Backup Care evidence, follow `source_routes.care_com`:

- `bos`: use published `education_center_search_email_evidence` and
  `education_center_get_email_thread` through the named Education Center connection.
- `connected_gmail`: invoke `email-account-routing`, select the exact
  `mailboxes.care_com` account, and use the normal Gmail connector's bounded
  search and full-thread retrieval tools.

Stop with a source-specific configuration result when the selected route or
required mailbox is unavailable. Never copy the mailbox into this packaged
skill or silently switch to another account.
Use `bos-visual-output` for multi-class schedules, capacity, attendance, and
camp-assignment results.
For a standalone class roster or family contact list, return the requested
records directly in the conversation. For a camp-enrollment report, return the
five-day roster image and separate family contact list defined below.
When the user requests Calimatic, use the packaged Education Center skill-group connection
and omit `org_id`, `app_code`, `installed_app_id`, and `delegated_role_id`; BOS
derives them from the authenticated installation. Never use a direct provider
client or browser session as a fallback for a BOS-routed domain. When BOS
reports an authentication or credential error, follow its secure handoff flow.
When `connected_gmail` reports an account error, use the Gmail connector's
native recovery for the exact configured mailbox. Never request a secret in
chat. If a required capability is unavailable, return a useful partial result
with the exact missing route, capability, scope, and freshness.

## Classes and rosters

- Use the authorized BOS enrollment-listing capability for date-bound rosters.
- Search the configured Care.com evidence source for provider notices. Use a
  bounded lookback of up to 180 days before the
  requested period through its end, then retain only child-days whose service
  date falls inside the requested period. Hydrate every relevant hit with
  the selected route's full-thread tool before interpreting confirmation or
  cancellation.
- Group Care.com messages by numeric job ID. Count a `Backup Care Job
  Confirmation ID: <job_id>` with body status `Confirmed` as active enrollment.
  Retain `New Backup Care Job Request ID: <job_id>` with status `New` as pending
  evidence and never double-count the paired notices.
- Expand each service-date line in a confirmed message into one Care.com
  child-day. Preserve child, job ID, site, date/time, estimated payment, age,
  parent, comments, message timestamp, and source.
- Let an explicit later cancellation for the same job ID/date exclude that
  child-day. Never infer cancellation from silence.
- Preserve class, course, student, service date, and provider provenance.
- Never infer missing class dates or instructor assignments.

## Camp enrollment and family contact reports

Treat requests such as “camp enrollments for next week with student names per
day and family phone numbers” as a bounded roster request. Resolve the local
date range, retrieve every camp occurrence and date-bound enrollment in that
range, and use student/family lookup when the enrollment row omits its primary
family phone. Include confirmed backup-care child-days only under the exact
camp occurrence and date supported by provider evidence.

### Cache-backed source retrieval

After `bos_get_context` validates live authority, run the shared document-cache
`begin` → source gap/delta → `commit` → `read` workflow from `bos-mcp-client`
for each reusable logical query: camp occurrences and capacities, date-bound
enrollments and attendance dates, required student/family records, Bright
Horizons evidence, and routed Care.com messages or threads. Keep the requested
date window in cache coverage rather than the stable selector.

- When `begin` returns `current`, generate from the covered cache without a
  source content query.
- When it returns gaps, query only the uncovered intervals plus changes after
  the committed cursor through the fixed refresh upper bound. Follow every
  page, commit normalized records and tombstones once, then read the covered
  cache state used for the report.
- When it returns `busy`, wait for the bounded lease and call `begin` again.
- Abort an incomplete refresh so the prior committed watermark remains valid.
  Use any still-covered cache interval and label only the uncovered source
  interval as partial.

Missing daily fields in one summary response do not prove that occurrence data
is unavailable. Continue with the discoverable camp-occurrence, enrollment,
attendance, and family lookup capabilities required to complete the cache plan.
Do not print `daily occurrence data unavailable`, report a zero, or omit paid
students until the cache read and the required source gap/delta request have
both completed or returned a source-specific failure. Never reconstruct dates
from a registration duration when neither cached nor source evidence supplies
the exact attendance dates.

Return the complete report in the first final response. Render a five-column
Monday-Friday image with `scripts/render_week_calendar.py`. Supply verified JSON
containing exactly five day objects and roster entries with both `name` and
`camp`, grouped as `paid`, `bh`, or `care_com`. The image must:

- use one column for each weekday in chronological order;
- repeat each child on every day the child is expected;
- render every line as `Student — Camp` so the placement is explicit;
- visually distinguish paid, Bright Horizons, and confirmed Care.com students;
  and
- show a daily headcount.

List family contacts immediately after the image. Include each family once,
even when multiple siblings or attendance days exist. Each family entry contains
the returned guardian, primary family phone, and associated student names.
Write `Missing in BOS — call list incomplete` for an absent phone. Keep phone
numbers out of the image. Put `Needs review` placement exceptions outside the
image when no exact camp occurrence and date is supported.

Use the recovered `Education Center Camps` card layout: navy weekday headers, white day
cards, source labels, exact student/camp lines, and a headcount footer. Request
PNG output when `rsvg-convert` is available and SVG otherwise; return the image
inline as the report visual. Never substitute Mermaid, a Markdown-only
roster, aggregate camp boxes, or a local HTML page for this camp report. The
renderer transforms only BOS-returned or explicitly routed evidence; it never
retrieves, reconciles, or calculates business data. Keep the renderer input in
the client temporary-artifact surface and remove it after the image is rendered;
never retain a second roster copy as a cache or report source.

A partial or unavailable source never suppresses the image when another source
returned exact day-level placements. Render every verified placement, identify
the visual as partial when its daily totals omit a failed source, and state the
source limitation immediately after the image. Suppress the image only when no
source or covered cache interval returned any exact day-level placement.

State a source-specific limitation where its records would appear. Report zero
camps or students only after a successful bounded source query.

## Camp assignment

- Apply the `camp-capacity-planning` seat model and Bright Horizons rules.
- Treat confirmed Care.com child-days as seat-fill demand alongside Bright
  Horizons child-days. Never display Care.com as a camp/class.
- Anchor scenarios in real Calimatic camp sections, dates, paid rosters, and
  capacity.
- Label a Bright Horizons student under a camp/day only when Calimatic or
  another published BOS record explicitly identifies Bright Horizons and
  assigns that student to the exact camp occurrence and date. Keep generic or
  unassigned Bright Horizons child-days out of camp rosters and report them as
  `Needs review` placement exceptions.
- Label a Care.com student under a camp/day only when a confirmed child-day is
  explicitly assigned to that exact camp occurrence and date. Report confirmed
  but unassigned Care.com demand as a `Needs review` placement exception.
- Treat assignment as a proposed scenario until an authorized Calimatic update
  tool is published and the user requests execution.

## Output

State the date range, class roster or capacity result, assignment scenario,
open seats, conflicts, and action required. Never represent a recommendation as
a completed provider update. Pair a camp roster image with the one-entry-per-
family contact list so every requested phone remains directly available.
