# iCode Operations Access Patterns

## Scope

Use `bos_icode` for every workflow in this reference. Resolve selected iCode organization
through `bos_get_context`, then preserve the returned org, app, installation,
role, plugin, and capability scope. Do not encode employee names, location
assignments, or individual ownership in this capability reference.

## Access pattern

For every request:

1. Classify the work category and use case from the matrix below.
2. Inspect the live `bos_icode` context and tool manifest.
3. Use the system of record for primary state and other plugins as evidence.
4. Search and reconcile with read tools by default.
5. Use create or update only when the user requests the change, the exact BOS
   tool is published, and both client and server permissions allow it.
6. Preserve CRU-only behavior. Never delete, send Gmail, or invent an
   unsupported provider mutation.
7. If the required plugin is absent, report the exact capability gap. Never
   substitute Gmail, another tenant, or a semantically different source.

Load the associated local skill for domain behavior:

| Category | Local skill |
|---|---|
| Instructors | `icode-instructor-operations` |
| Invoices | `icode-invoice-operations` |
| Students | `icode-student-operations` |
| Classes | `icode-class-operations` |
| Parents | `icode-parent-communications` |

## Work matrix

| Category | Use case | Primary BOS source | Supporting evidence and actions |
|---|---|---|---|
| Instructors | Hiring | Discover the configured recruiting/people source; use Lead Director only when candidates are represented there | BOS Gmail for candidate correspondence, Drive for resumes/forms, Calendar for interviews |
| Instructors | Onboarding | Discover the configured people/onboarding source | Drive for onboarding documents, Gmail for correspondence/drafts, Calendar for scheduled steps |
| Instructors | Teaching | Calimatic for classes/rosters when the returned data explicitly includes instructor or class fields | Drive for curriculum, Calendar for schedules, Gmail for related correspondence |
| Instructors | Offboarding | Discover the configured people source and return a checklist/evidence report | Update only through a published lifecycle tool; never simulate offboarding through deletion |
| Invoices | Bright Horizons | Invoice/accounting plugin when configured | Reconcile Gmail invoice/authorization evidence, Drive invoice files, and Calimatic child-day/service evidence; follow the BH cancellation workflow when cancellations affect billing |
| Invoices | Calimatic | Calimatic billing/invoice capability when configured | Current student/enrollment tools prove attendance or enrollment only; do not label them invoice records |
| Invoices | Care.com | Care.com plugin when configured | If absent, report `Care.com provider capability unavailable`; do not infer Care.com state from Gmail alone |
| Students | Enrollment | Calimatic student and enrollment tools | Lead Director for prospect/lead state, Gmail for source evidence; retain provider provenance during reconciliation |
| Students | Progress reports | Discover the configured progress-report or student-record source | Drive for report documents and Gmail for correspondence; never infer progress from enrollment status |
| Classes | Camp assignment | Calimatic enrollment/class data | Use the camp-capacity/BH rules for assignment scenarios; Calendar can provide schedule evidence |
| Parents | Calls during business hours | Configured BOS telephony/voice plugin | Return call tasks, transcripts, or outcomes only when the live source provides them |
| Parents | Calls after hours | Configured BOS telephony/voice plugin and after-hours workflow | Preserve time zone, received time, and escalation state |
| Parents | Text messages | Configured BOS SMS/comms plugin | Draft or update only through published tools; do not replace SMS with Gmail |
| Parents | Reviews | Configured BOS reviews/reputation plugin | Prepare responses when supported; publish only through an explicitly authorized write tool |

## Reconciliation rules

- Distinguish the system of record from supporting evidence in every result.
- Match people conservatively using stable provider IDs first, then normalized
  name plus another strong field such as date, family, or care-request number.
- Preserve conflicting evidence and classify it for manual review.
- State the exact date range and time zone for calls, classes, enrollments,
  invoices, and reconciliation reports.
- Do not expose phone numbers, email addresses, invoice documents, student
  identifiers, or full message bodies unless required by the requested task.

## Camp assignment

Treat camp assignment as a scenario until a supported Calimatic update tool is
published and the user explicitly requests execution. Anchor real camp sections
and rosters in Calimatic. Keep Bright Horizons child-days unassigned by default,
then recommend eligible paid-anchored camps with capacity. Never represent a
recommendation as a completed Calimatic assignment.

## Response shape

Lead with the operational result. Then include:

1. Category, use case, organization, and date range.
2. Primary records from the system of record.
3. Supporting evidence and reconciliation status.
4. Action-required items.
5. Capability gaps that prevent completion.

For a broad `show ops work` request, group results in this order: Instructors,
Invoices, Students, Classes, Parents. For a specific request, return only the
relevant category and its dependent evidence.
