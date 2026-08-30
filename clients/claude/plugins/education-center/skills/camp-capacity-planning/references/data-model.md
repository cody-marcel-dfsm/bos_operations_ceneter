# Camp Capacity Data Model

## Source Priority

1. Calmatic paid enrollments are the source of truth for paid camp purchases.
2. Calmatic Bright Horizons rows are preferred for BH child-days when the same child/date is present in both Calmatic and Gmail.
3. Gmail Bright Horizons rows fill gaps where Calmatic has no matching BH child/date row.
4. Public Calmatic camp sections are the source of truth for scheduled camps and capacity.
5. Care.com `Backup Care Job Confirmation ID` messages from the tenant-configured
   mailbox route are the source of truth for accepted Care.com child-days.
   Paired `New Backup Care Job Request ID` messages are pending evidence only.

## Care.com Job Model

Group messages from `backupcare@marketingsolutions.care.com` by numeric job ID.

- `New Backup Care Job Request ID: <job_id>` plus status `New`: pending; count
  zero child-days.
- `Backup Care Job Confirmation ID: <job_id>` plus status `Confirmed`: active;
  create one child-day per listed service date.
- Explicit later cancellation for the same job ID/date: exclude that child-day.
  Do not infer cancellation when no cancellation message is present.

Preserve child, job ID, site, service date/time, estimated payment, age,
parent, comments, and message timestamp. Request and confirmation notices are
separate Gmail messages, so job ID is the join key.

## Bright Horizons Dedupe Key

Use a child-day key:

```text
lower(contact_email) + lower(student_or_child_name) + service_date
```

For duplicate Gmail messages for the same child-day, prefer the stronger status:

```text
Enrolled > Confirmed > Processed > Authorized > Unknown
```

When Calimatic and Gmail both have the same child-day, use Calimatic for identity/class metadata, preserve Gmail authorization/cancellation evidence, and count the matched child-day once.

## Calimatic-to-Gmail Reconciliation

Build one audit row per normalized child and service date before allocation. Preserve source evidence even after deduplication.

| Classification | Calimatic BH | Gmail authorization | Gmail cancellation | Attendance decision |
|---|---:|---:|---:|---|
| Matched active | Yes | Yes | No | Count one unassigned BH child-day |
| Cancelled | Either | Either | Yes | Exclude; flag stale Calimatic row when present |
| Calimatic only | Yes | No | No | Keep unassigned and flag for manual verification |
| Gmail only | No | Yes | No | Count one unassigned BH child-day; flag missing Calimatic row |
| Conflicting Gmail state | Either | Yes | Yes | Exclude; show authorization/cancellation conflict |

Match first on normalized child name plus service date. Use normalized contact email and care-request number to strengthen or disambiguate matches. Never let a generic Calimatic boolean status override an explicit Gmail cancellation.

Report raw source counts separately from reconciled child-days. Multiple Gmail notices for one child/date remain one attendance decision.

Forward confirmations and cancellations to
`brighthorizonsenrollments@calimatic.com`, then verify the Calimatic result.
The Bright Horizons provider message timestamp controls cancellation timing;
the location's forwarding timestamp is transport evidence only. Missing or
partial provider cancellation notices remain unresolved until authoritative
provider evidence identifies the affected child-days.

## Paid Enrollment Keys

Paid registrations are normally unique from Calmatic. Do not collapse paid rows just because family/contact names match; the same family can buy multiple children or multiple camps. Only dedupe paid rows when a stable Calmatic identifier or exact `(student_id, cart_id, class_name, start_date)` duplicate proves it is the same registration.

## Camp Section Model

A section has:

- `camp_name`
- `week_start`
- `start_date`
- `end_date`
- `capacity`
- daily seat buckets for Monday-Friday
- paid roster by day
- BH roster by day

If the public catalog has multiple sections with the same camp/week, treat them as separate capacity only when the source exposes distinct section IDs. Otherwise avoid inflating capacity.

## Allocation Details

Paid placement:

- Use `camp_name` from the normalized Calmatic record.
- Use the attendance dates returned by the authorized BOS MCP enrollment or
  reconciled camp-report operation.
- Place each paid student in that camp's daily buckets.

BH and Care.com placement:

- Each BH row or confirmed Care.com service date is one child-day, not a
  full-week student.
- Place paid students in their purchased camps first.
- Order BH students by actual Monday-morning arrival/check-in. Before Monday, use the earliest authorization/registration time as a provisional proxy and label the result provisional.
- Candidate camps are all scheduled sections active on the service date with a remaining seat.
- Prefer the child's existing weekly assignment, then the active camp with the highest current occupancy, then public-catalog order.
- Keep a BH child in the same camp across authorized days whenever it remains active and below capacity.
- Spill into another active camp only when the prior camp is inactive or full.
- Never exceed day-level section capacity.
- Leave a BH child-day unassigned only when every active camp is full.
- Never open a new section from BH demand alone.

## Useful Tables

Camp table columns:

```text
Week | Camp | Mon | Tue | Wed | Thu | Fri | Peak | Capacity | Open seats
```

Daily cells should contain both paid and BH counts, e.g. `3 P, 2 BH`. Do not include a standalone Paid column in the camp table. Show one weekly total near the week heading, e.g. `Weekly totals: 8 paid seats, 30 BH child-days`.

Canonical output:

```markdown
**Week Of YYYY-MM-DD**
Priority camp: `Exact Priority Camp Name`
Weekly totals: `N paid seat-days`, `N BH child-days`

| Camp | Mon | Tue | Wed | Thu | Fri | Peak Seats | Capacity | Open Seats |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Camp Name | 3 P, 0 BH | 3 P, 0 BH | 3 P, 0 BH | 3 P, 0 BH | 3 P, 0 BH | 3 | 10 | 7 |
```

Use weekly totals as seat-day totals: paid daily seats summed across displayed rows, plus allocated BH child-days summed across displayed rows.

Roster detail columns:

```text
Week | Camp | Date | Student | Source (Paid/BH) | Family/contact | Status | Notes
```

Move-earlier candidate columns:

```text
Family | Current week | Current camp | Student(s) | Same-camp earlier option | Other earlier option | Paid amount
```

## Common Failure Modes

- Counting BH child-days as full-week students.
- Showing Bright Horizons as a camp/class in the main camp table.
- Summing weekly child-days and comparing them to daily seat capacity.
- Leaving BH unassigned while an active camp still has capacity.
- Treating a provisional pre-Monday allocation as final arrival order.
- Losing student-level rosters and only showing aggregate counts.
- Treating a generated Markdown/report as the source of truth instead of rebuilding from Calmatic/Gmail/public sections.
- Treating Gmail as a gap-filler without comparing every Calimatic BH child-day against Gmail authorization and cancellation evidence.
