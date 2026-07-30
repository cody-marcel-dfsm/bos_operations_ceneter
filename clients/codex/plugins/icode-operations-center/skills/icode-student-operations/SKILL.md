---
name: icode-student-operations
description: Handle iCode student enrollment and progress-report workflows through the tenant-scoped BOS MCP. Use when asked to find students, inspect or reconcile enrollments, compare Lead Director and Calimatic state, locate progress reports, summarize progress evidence, or identify missing student-data capabilities.
---

# iCode Student Operations

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
