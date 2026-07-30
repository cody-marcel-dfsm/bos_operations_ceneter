---
name: icode-class-operations
description: Handle iCode class rosters, schedules, capacity, and camp-assignment scenarios through the tenant-scoped BOS MCP. Use when asked about classes, camps, rosters, attendance dates, open seats, Bright Horizons placement, or assigning students to camps.
---

# iCode Class Operations

Use `bos_icode` and follow the `bos-mcp-client` context workflow. Use Calimatic
for class/enrollment state and Calendar only as schedule evidence.
Use `bos-visual-output` for multi-class schedules, capacity, attendance, and
camp-assignment results.
Use only BOS MCP or published BOS backend APIs with the iCode organization's
plugin credentials. Browser sessions and native/local connectors provide no
authorization, evidence, or fallback.
When BOS or Calimatic reports an authentication or credential error, follow
`bos-mcp-client` authentication recovery and prompt the user to enter the API
key only through the secure BOS setup page.

## Classes and rosters

- Use the enrollment-listing tool for date-bound rosters.
- Preserve class, course, student, service date, and provider provenance.
- Never infer missing class dates or instructor assignments.

## Camp assignment

- Apply the `camp-capacity-planning` seat model and Bright Horizons rules.
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
