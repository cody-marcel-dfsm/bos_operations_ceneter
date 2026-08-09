---
name: icode-director-daily-planner
description: Create an iCode director's date-specific operating planner from tenant-scoped BOS data. Use when asked for a director daily plan, opening brief, class rosters, family contact sheet, new-lead call list, scheduled trials for a day or date range, families needing trial confirmation or follow-up, appropriate parent email drafts, or a combined action plan for iCode organization.
---

# iCode Director Daily Planner

Create a concise, action-oriented planner for one local business date. Retrieve live data through `bos_icode`; never distribute or send the planner unless the user separately requests and authorizes distribution.

## Required companion guidance

Read and follow these installed skills before retrieving data:

- `bos-mcp-client` for scope resolution, live tool discovery, and provider access.
- `bos-visual-output` for a timeline-led, visual operating brief.
- `icode-class-operations` for date-bound class rosters.
- `icode-student-operations` for student, enrollment, and family identity handling.

Use the exact organization, installed app, role, plugin, and capability scope returned by `bos_get_context`. Treat the live MCP manifest as authoritative. Use only BOS MCP or a published BOS backend API.

When any planner source reports an authentication error, follow
`bos-mcp-client` authentication recovery and prompt the user to complete that
service's secure BOS browser flow. Continue building unaffected planner
sections while authorization is pending.

## Workflow

1. Load the installed product's `config/customer-settings.json`. Resolve the
   requested date in its required `timezone`. Default to today and state the
   full date. Stop when the setting is absent or invalid.
2. Call `bos_get_context` once and select the selected iCode organization `bos_icode` scope that exposes the required read capabilities.
3. Retrieve date-bound Calimatic enrollments with the enrollment-listing
   capability. Use student/family lookup only to add contact information
   missing from the roster response. For camp dates, also follow
   `icode-class-operations` to include confirmed Care.com child-days from the
   connected Gmail account selected by `mailboxes.care_com`.
4. Retrieve active new leads from Lead Director. Default the intake window to the preceding 24 hours through planner generation time. Include leads requiring an initial call; exclude duplicate, spam, closed-lost, and already-converted records when those statuses are explicit.
5. For scheduled-trial, confirmation, follow-up, or trial-draft requests, read and execute [references/trial-reconciliation.md](references/trial-reconciliation.md). Compose the live Lead Director, Calendar, and Gmail MCP primitives client-side; do not wait for or require a composite server tool.
6. Normalize times to the configured `timezone`, preserve provider provenance internally, deduplicate conservatively, and flag conflicts or missing fields.
7. Render the planner using [references/planner-content.md](references/planner-content.md).

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
