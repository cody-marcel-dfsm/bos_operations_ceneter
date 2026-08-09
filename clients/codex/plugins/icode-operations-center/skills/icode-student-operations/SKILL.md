---
name: icode-student-operations
description: Handle iCode student enrollment and progress-report workflows across tenant-scoped BOS data and Care.com confirmation emails in the configured customer mailbox. Use when asked to find students, produce or reconcile enrollment reports, compare Lead Director and Calimatic state, include Care.com Backup Care enrollments, locate progress reports, summarize progress evidence, or identify missing student-data capabilities.
---

# iCode Student Operations

This skill is for authenticated adult school staff performing legitimate
school administration. Students and minors are data subjects, never users or
operators. Retrieve only the minimum student and family fields necessary for
the requested enrollment or progress-report task. Do not publish, bulk export,
or use these records for admissions, disciplinary, eligibility, or other
high-impact decisions.

Use `bos_icode` and follow the `bos-mcp-client` context workflow. Preserve
student identity and provider provenance across every source.
Use `bos-visual-output` for enrollment cohorts, progress trends, class
distribution, and cross-source reconciliation.
Use only BOS MCP or published BOS backend APIs with the iCode organization's
plugin credentials. Browser sessions and native/local connectors provide no
authorization, evidence, or fallback.
When Gmail, Drive, or Calimatic reports an authentication error, follow
`bos-mcp-client` authentication recovery and prompt the user to complete the
service-specific secure BOS browser flow.

## Enrollment

- Use Calimatic student and enrollment tools as the enrolled-student source.
- Use Lead Director for prospect and lead state.
- Use BOS Gmail only as correspondence/source evidence.
- Load the installed product's `config/customer-settings.json`. For Care.com
  messages addressed to `mailboxes.care_com`, follow `email-account-routing`
  and use that configured Gmail account with exact sender
  `[REDACTED_EMAIL]`.
- Stop and report configuration required when `mailboxes.care_com` is absent.
- Dedupe Care.com request and confirmation notices by numeric job ID. Count only
  a confirmation with body status `Confirmed` as active enrollment; keep a
  `New` request as pending. Expand each confirmed service date to one child-day.
- Preserve child, job ID, site, date/time, estimated payment, age, parent,
  comments, and message timestamp. Exclude a child-day only when a later
  message explicitly cancels that job ID/date.
- Reconcile with stable provider IDs first, then normalized name plus another
  strong field. Keep ambiguous matches separate.

## Progress reports

- Discover the configured progress-report or student-record source.
- Use Drive for report documents and BOS Gmail for correspondence when relevant.
- Never infer academic progress from enrollment, attendance, lead, or email
  state.

## Output

State use case, date range, system of record, matched student records,
discrepancies, evidence, and action required. Exclude unnecessary contact and
opaque student identifiers.
