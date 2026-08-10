---
name: icode-director-daily-planner
description: Create daily plans and weekly director summaries from tenant-scoped iCode BOS data. Use when asked for a director daily plan, opening brief, weekly summary, weekly director report, week-in-review, class or enrollment summary, family contact sheet, new-lead call list, scheduled trials, follow-ups, wins, risks, next-week priorities, or a combined iCode operating update.
---

# iCode Director Plans and Summaries

This skill is for authenticated adult school staff performing legitimate
school administration. Students and minors are data subjects, never users or
operators. Include only the minimum student or family information needed for
the requested operating plan. Do not use this workflow for admissions,
disciplinary, eligibility, or other high-impact decisions about students.

Create a concise, action-oriented daily planner or weekly director summary.
Retrieve live data through the named `icode-operations` MCP connection; never
distribute or send the result unless the user separately requests and authorizes
distribution. “For my director” identifies the report audience and never
requires the director's identity for preparation.

## Required companion guidance

Read and follow these installed skills before retrieving data:

- `bos-mcp-client` for scope resolution, live tool discovery, and provider access.
- `icode-customer-initialization` when customer settings are missing, incomplete,
  or invalid.
- `bos-visual-output` for a timeline-led, visual operating brief.
- `icode-class-operations` for date-bound class rosters.
- `icode-student-operations` for student, enrollment, and family identity handling.

Use the single user and role resolved from the configured `BOS_API_KEY` by
`bos_get_context`. BOS derives organization, installation, plugin, and
capability scope. Treat the live MCP manifest as authoritative. Never ask the
user to choose a director, organization, source, key, or role for preparation.

When any planner source reports an authentication error, follow
`bos-mcp-client` authentication recovery and prompt the user to complete that
service's secure BOS browser flow. Continue building unaffected planner
sections while authorization is pending.

## Workflow

1. Load the installed product's `config/customer-settings.json`. When it is
   absent or invalid, run `icode-customer-initialization` immediately and
   resume this request after applying the validated settings. Resolve the
   reporting period in its required `timezone`. A daily request defaults to
   today. A weekly request without dates defaults to the most recently completed
   local Monday-through-Sunday week. State the resolved period and continue
   without asking.
2. Call `bos_get_context` once through `icode-operations`. Require exactly one
   authenticated user and role and accept the server-derived iCode scope. A
   server violation is a configuration error, never a user selection question.
3. Retrieve date-bound Calimatic enrollments with the enrollment-listing
   capability. Use student/family lookup only to add contact information
   missing from the roster response. For camp dates, also follow
   `icode-class-operations` to include confirmed Care.com child-days from the
   connected Gmail account selected by `mailboxes.care_com`.
4. Retrieve active new leads from Lead Director. For a daily planner, use the
   preceding 24 hours through generation time. For a weekly summary, use the
   full resolved Monday-through-Sunday reporting period. Include leads requiring
   action; exclude duplicate, spam, closed-lost, and already-converted records
   when those statuses are explicit.
5. For scheduled-trial, confirmation, follow-up, or trial-draft requests, read and execute [references/trial-reconciliation.md](references/trial-reconciliation.md). Compose the live Lead Director, Calendar, and Gmail MCP primitives client-side; do not wait for or require a composite server tool.
6. Normalize times to the configured `timezone`, preserve provider provenance internally, deduplicate conservatively, and flag conflicts or missing fields.
7. Render a daily planner using
   [references/planner-content.md](references/planner-content.md). Render a
   weekly request using
   [references/weekly-summary-content.md](references/weekly-summary-content.md).

## Weekly director summary

For a weekly summary, retrieve and synthesize the full resolved period:

- classes held, enrollments, attendance, capacity, and material schedule changes;
- new leads, lead response, pipeline movement, and unresolved lead actions;
- trials scheduled, completed, converted, missed, and needing confirmation or follow-up;
- parent or guardian follow-ups and communication actions;
- operational wins and evidence-backed positive movement;
- risks, missing evidence, overdue actions, and capability blockers; and
- prioritized actions for the next local week.

Use every authorized iCode source needed for these sections automatically.
Never ask whether to use iCode operations, email, Calendar, Lead Director,
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

- Group enrolled students by class and class start time. Preserve a student in every class occurrence they attend.
- Include a parent or guardian name, primary phone, and primary email when BOS returns them because the planner explicitly serves family contact operations.
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
