---
name: education-center-student-operations
description: Handle Education Center student enrollment and progress-report workflows across tenant-scoped BOS data and Care.com confirmation emails in the configured customer mailbox. Use when asked to find students, produce or reconcile enrollment reports, compare Lead Director and Calimatic state, include Care.com Backup Care enrollments, locate progress reports, summarize progress evidence, or identify missing student-data capabilities.
---

# Education Center Student Operations

## Tenant terminology

Load effective customer settings and resolve the brand through
`education-center-service-routing`. Use `brand_display_name`, or the active
skill extension's `terminology.brand_display_name` override, wherever
customer-facing output names the franchise or brand. Keep technical product,
skill, route, server, environment-variable, tool, capability, authorization,
and record identifiers unchanged.

This skill is for authenticated adult school staff performing legitimate
school administration. Students and minors are data subjects, never users or
operators. Retrieve only the minimum student and family fields necessary for
the requested enrollment or progress-report task. Do not publish, bulk export,
or use these records for admissions, disciplinary, eligibility, or other
high-impact decisions.

Use the authenticated BOS MCP connection and follow the `bos-mcp-client`
context workflow. BOS resolves the Education Center subservice for each tool. Preserve
student identity and provider provenance across every source.
Use `bos-visual-output` for enrollment cohorts, progress trends, class
distribution, and cross-source reconciliation.
Use BOS for every domain whose effective customer route is `bos`. A configured
`connected_gmail` route may supply Care.com correspondence evidence through the
normal Gmail connector and exact customer mailbox; it grants no BOS authority
and cannot perform Education Center mutations.
For a BOS-routed Gmail, Drive, or Calimatic authentication error, follow
`bos-mcp-client` recovery. For `connected_gmail`, use the Gmail connector's
native account recovery for the exact configured mailbox.

## Enrollment

- Use Calimatic student and enrollment tools as the enrolled-student source.
- Use Lead Director for prospect and lead state.
- Use published `education_center_search_email_evidence` and `education_center_get_email_thread`
  through the same BOS connection only as correspondence/source evidence.
- Resolve the packaged settings defaults plus the preserved customer overlay.
  Follow `source_routes.care_com`: use published Education Center email evidence tools for
  `bos`, or invoke `email-account-routing` and the normal Gmail connector for
  `connected_gmail`. Select only the exact `mailboxes.care_com` account.
- Stop and report configuration required when the selected route is unavailable
  or a connected-Gmail route lacks `mailboxes.care_com`.
- Use a bounded lookback of up to 180 days before the requested period through
  its end for Care.com notices, then retain only child-days whose service date
  falls inside the requested period.
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
