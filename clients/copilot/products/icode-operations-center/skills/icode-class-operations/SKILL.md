---
name: icode-class-operations
description: Handle iCode class rosters, schedules, capacity, and camp-assignment scenarios through tenant-scoped BOS data plus Care.com confirmations from [REDACTED_NAME] connected iCode Gmail. Use when asked about classes, camps, enrollment reports, rosters, attendance dates, open seats, Bright Horizons or Care.com placement, or assigning students to camps.
---

# iCode Class Operations

Use the tenant-neutral `bos` MCP and follow the `use-bos` context workflow.
Use Calimatic for class/enrollment state and Calendar only as schedule evidence.
For Care.com Backup Care evidence addressed to
`[REDACTED_NAME]@icodeschool.com`, follow `email-account-routing` and use the
regular connected Gmail plugin. Do not route that mailbox through BOS Gmail.
Use `bos-visual-output` for multi-class schedules, capacity, attendance, and
camp-assignment results.
When the user requests Calimatic, select the authorized BOS context exposing
the Calimatic capability and copy `org_id`, `app_code`, `installed_app_id`, and
`delegated_role_id` exactly into the call. Never use a direct provider client or
browser session as a fallback. When BOS reports an authentication or credential
error, follow its secure handoff flow and never request a secret in chat. If a
required capability is unavailable, return a useful partial result from other
authorized BOS capabilities and the exact missing capability, scope, and source
freshness.

## Classes and rosters

- Use the authorized BOS enrollment-listing capability for date-bound rosters.
- Search the connected iCode Gmail mailbox for messages from
  `[REDACTED_EMAIL]` in the requested date window.
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

## Camp assignment

- Apply the `camp-capacity-planning` seat model and Bright Horizons rules.
- Treat confirmed Care.com child-days as seat-fill demand alongside Bright
  Horizons child-days. Never display Care.com as a camp/class.
- Anchor scenarios in real Calimatic camp sections, dates, paid rosters, and
  capacity.
- Keep Bright Horizons child-days unassigned until the user requests a scenario
  or confirms placement.
- Treat assignment as a proposed scenario until an authorized Calimatic update
  tool is published and the user requests execution.

## Output

State the date range, class roster or capacity result, assignment scenario,
open seats, conflicts, and action required. Never represent a recommendation as
a completed provider update.
