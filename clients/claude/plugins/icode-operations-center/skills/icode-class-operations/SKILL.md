---
name: icode-class-operations
description: Handle iCode class rosters, schedules, capacity, and camp-assignment scenarios through tenant-scoped BOS data plus Care.com confirmations from Cody's connected iCode Gmail. Use when asked about classes, camps, enrollment reports, rosters, attendance dates, open seats, Bright Horizons or Care.com placement, or assigning students to camps.
---

# iCode Class Operations

Use `bos_icode` and follow the `bos-mcp-client` context workflow. Use Calimatic
for class/enrollment state and Calendar only as schedule evidence.
For Care.com Backup Care evidence addressed to
`cody.marcel@icodeschool.com`, follow `email-account-routing` and use the
regular connected Gmail plugin. Do not route that mailbox through BOS Gmail.
Use `bos-visual-output` for multi-class schedules, capacity, attendance, and
camp-assignment results.
Use BOS MCP or published BOS backend APIs with the iCode organization's plugin
credentials for every source except the exact Care.com Gmail route above.
Browser sessions provide no authorization, evidence, or fallback.
When BOS or Calimatic reports an authentication or credential error, follow
`bos-mcp-client` authentication recovery and prompt the user to enter the API
key only through the secure BOS setup page.

## Classes and rosters

- Use the enrollment-listing tool for date-bound rosters.
- Search the connected iCode Gmail mailbox for messages from
  `backupcare@marketingsolutions.care.com` in the requested date window.
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
