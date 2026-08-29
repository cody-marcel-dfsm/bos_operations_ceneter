---
name: education-center-director-daily-planner
description: Create daily plans and multi-area weekly director summaries from tenant-scoped Education Center BOS data. Use when asked for a director daily plan, opening brief, weekly summary, weekly director report, week-in-review, new-lead call list, scheduled trials, follow-ups, wins, risks, next-week priorities, or a combined Education Center operating update. Use Education Center Class Operations for a standalone class or camp roster, enrollment report, or family contact list.
---

# Education Center Director Plans and Summaries

## Tenant terminology

Load effective customer settings and resolve the brand through
`education-center-service-routing`. Use `brand_display_name`, or the active
skill extension's `terminology.brand_display_name` override, wherever
customer-facing output names the franchise or brand. Keep technical product,
skill, route, server, environment-variable, tool, capability, authorization,
and record identifiers unchanged.

This skill is for authenticated adult school staff performing legitimate
school administration. Students and minors are data subjects, never users or
operators. Include only the minimum student or family information needed for
the requested operating plan. Do not use this workflow for admissions,
disciplinary, eligibility, or other high-impact decisions about students.

Create a concise, action-oriented daily planner or weekly director summary.
Retrieve BOS-routed live data through the authenticated BOS MCP connection and
separately connected read-only evidence through the effective
customer source route. Never distribute or send the result unless the user
separately requests and authorizes distribution. “For my director” identifies
the report audience and never requires the director's identity for preparation.

## Routing boundary

When the request asks only for a class or camp roster, enrollments by day, or
family contact details, execute `education-center-class-operations` and return its direct
mobile-safe roster. Do not expand the request into a daily planner, weekly
director summary, lead review, Calendar review, parent-communication review, or
visual report. Continue with this skill only when the user requests a director
plan, director summary, or multiple operating areas.

## Required companion guidance

Read and follow these installed skills before retrieving data:

- `bos-mcp-client` for scope resolution, live tool discovery, and provider access.
- `education-center-customer-initialization` when customer settings are missing, incomplete,
  or invalid.
- `bos-visual-output` for a visual operating brief.
- `education-center-class-operations` for date-bound class rosters.
- `education-center-student-operations` for student, enrollment, and family identity handling.

Use the single user and role resolved by `bos_get_context` from the authorized
BOS connection. Claude and ChatGPT/Codex use the host-managed BOS OAuth
grant; another client uses only its generated product adapter. BOS derives
organization, installation, plugin, and capability scope. Treat the live MCP
manifest as authoritative. Never ask the user to choose a director, organization, source, key, or role for preparation.

When a BOS-routed planner source reports an authentication error, follow
`bos-mcp-client` authentication recovery. When a separately connected client
source reports an authentication error, follow that connector's native account
recovery for the exact configured account. Continue building unaffected planner
sections while authorization is pending.

## Workflow

1. Load the installed product's settings template, then recursively overlay the
   preserved customer-owned `config/customer-settings.json`. Never place a
   customer mailbox or source selection in this packaged skill. When the overlay is
   absent or invalid, run `education-center-customer-initialization` immediately and
   resume this request after applying the validated settings. Resolve the
   reporting period in its required `timezone`. A daily request defaults to
   today. A weekly request without dates defaults to the current local
   Monday-through-Sunday week, including remaining upcoming days. Resolve
   “next week,” “last week,” or an explicitly supplied date from that local
   week calendar. State the resolved period and continue without asking.
2. Call `bos_get_context` once through BOS. Require exactly one
   authenticated user and role and accept the server-derived Education Center scope. A
   server violation is a configuration error, never a user selection question.
3. Retrieve every camp occurrence in the resolved reporting window before
   gathering general operating metrics: the selected day for a daily planner,
   or every day in the resolved week for a weekly summary. Build each camp's roster from
   date-bound Calimatic enrollments and confirmed, camp-assigned Care.com or
   Bright Horizons backup-care child-days available through the effective
   customer source routes. Care.com evidence follows
   `source_routes.care_com`: use the published Education Center email tools for `bos`, or
   invoke `email-account-routing` and the normal Gmail connector using exactly
   `mailboxes.care_com` for `connected_gmail`. Use
   student/family lookup to add the primary family phone and guardian name when
   the roster omits them. Label each student-day exactly `Paid enrollment`,
   `Care.com`, `Bright Horizons`, or `Needs review` from source evidence; never
   infer the payer, collapse backup-care programs into paid enrollment, or put
   an unassigned backup-care child-day into a camp roster. Report confirmed but
   unassigned backup-care demand as a `Needs review` placement exception.
4. For each camp family, search bounded parent communications relevant to the
   resolved day or week. Search from 30 days before the reporting-period start
   through its end so earlier messages affecting current service are included.
   Follow `source_routes.parent_communications` and hydrate each relevant hit
   with that route's full-thread tool. A `connected_gmail` route uses exactly
   `mailboxes.parent_communications`.
   Extract only operational facts that affect attendance, schedule, contact,
   pickup, accommodation, or an action the director must take. Omit message
   bodies and unrelated family details.
5. Retrieve Calendar events for the reporting window. For a daily planner,
   include the selected day plus material events in the following 48 hours.
   For a weekly summary, include the resolved week plus material events in the
   immediately following local week. Highlight events requiring staffing,
   preparation, family communication, space, or schedule coordination.
6. Retrieve active new leads from Lead Director. For a daily planner, use the
   preceding 24 hours through generation time. For a weekly summary, use the
   full resolved Monday-through-Sunday reporting period. Include leads requiring
   action; exclude duplicate, spam, closed-lost, and already-converted records
   when those statuses are explicit.
7. For scheduled-trial, confirmation, follow-up, or trial-draft requests, read and execute [references/trial-reconciliation.md](references/trial-reconciliation.md). Compose the live Lead Director, Calendar, and Gmail MCP primitives client-side; do not wait for or require a composite server tool.
8. Normalize times to the configured `timezone`, preserve provider provenance internally, deduplicate conservatively, and flag conflicts or missing fields.
9. Before rendering either report, read and apply the mobile-first visual
   contract in [references/mobile-visual.md](references/mobile-visual.md).
   Render a daily planner using
   [references/planner-content.md](references/planner-content.md). Render a
   weekly request using
   [references/weekly-summary-content.md](references/weekly-summary-content.md).

## Daily director planner

For a daily planner, use the same camp-first operating hierarchy at finer
day-level detail:

- today's camps in chronological order, with exact time and preparation state;
- every expected student, guardian, primary family phone, enrollment source,
  attendance or arrival state, and operational parent note;
- missing confirmations, attendance changes, pickup issues, and family calls
  the director must make today;
- today's Calendar timeline and material events in the following 48 hours;
- other classes, trials, and new-lead calls after camp delivery needs; and
- source-specific data gaps that make a roster or call list incomplete.

Do not let general business commentary displace today's camp rosters, family
contacts, and time-critical preparation.

## Weekly director summary

For a weekly summary, make camps and the family call plan the primary content.
Retrieve and synthesize the full resolved period in this priority order:

- every camp, its scheduled days, and its student roster by day;
- each rostered student's guardian, primary family phone, and evidence-backed
  enrollment source: paid, Care.com, or Bright Horizons;
- parent communication notes and follow-up actions that affect this week's camps;
- upcoming Calendar events that affect staffing, preparation, or families;
- other classes, enrollments, attendance, capacity, and material schedule changes;
- new leads, lead response, pipeline movement, and unresolved lead actions;
- trials scheduled, completed, converted, missed, and needing confirmation or follow-up;
- parent or guardian follow-ups and communication actions;
- operational wins and evidence-backed positive movement;
- risks, missing evidence, overdue actions, and capability blockers; and
- prioritized actions for the next local week.

Do not let general financial, transaction, marketing, ownership-transfer, or
pipeline commentary displace the camp rosters and family call plan. Include
those topics only as concise secondary context when they create an immediate
director action or the user explicitly requests them.

Use every authorized Education Center source needed for these sections automatically.
Never ask whether to use Education Center operations, email, Calendar, Lead Director,
Calimatic, or user-provided data. Report a source-specific partial result only
after live discovery or retrieval proves that source unavailable. Never convert
unavailable data into zero.

## Trial reconciliation hard gate

For every trial request, complete all three source reads: Lead Director,
Calendar, and Gmail. Search Gmail with bounded Gmail-native syntax in `q`, then
hydrate every relevant hit with `gmail_get_thread`; Gmail search results alone
contain identifiers and mailbox identity rather than the family message.

Build candidate identities from the hydrated Gmail messages and Lead Director.
For each unmatched candidate, search Calendar with `q` by exact email, full
name, and another source-backed identity before classifying. Never state that
there are zero scheduled trials, zero follow-ups, or zero confirmations until
this loop completes. If it cannot complete, report `Source incomplete`.

## Data rules

- Group camp students by camp and scheduled day. Preserve a student on every
  day they are expected to attend, including day-specific Care.com and Bright
  Horizons reservations.
- Include a parent or guardian name, primary phone, and primary email when BOS returns them because the planner explicitly serves family contact operations.
- Mark each weekly camp student-day `Paid enrollment`, `Care.com`, `Bright
  Horizons`, or `Needs review` using provider evidence. Preserve multiple
  evidence-backed labels when sources conflict and flag the record for review.
- Mark absent values as `Missing in BOS`; never infer contact details, class times, ages, trial times, or statuses.
- Keep siblings connected to the same family while retaining each student's class or trial record.
- Label uncertain cross-system matches `Needs review` and keep both source records visible.
- Never use an empty broad Calendar search as family-level proof when Gmail or Lead Director returns an unmatched trial candidate. Complete the identity query-expansion loop first.
- Show only operationally relevant personal data. Omit provider IDs, internal opaque identifiers, credentials, message bodies, and unrelated family notes.
- Sort scheduled items chronologically. Sort call tasks by urgency, then lead received time.

## Completeness handling

Return a useful partial planner when one source is unavailable. State the affected section, required capability, exact tenant and installed-app scope, sanitized credential state, and whether the issue is discovery, authorization, contract, provider data, or transport. Never replace a missing BOS capability with browser state or another connector.

## Scope boundary

Prepare and present the planner content only. Do not email, text, print, upload, schedule, or publish it during this phase. Treat future distribution as a separate workflow with explicit destination, audience, timing, privacy, and authorization requirements.
