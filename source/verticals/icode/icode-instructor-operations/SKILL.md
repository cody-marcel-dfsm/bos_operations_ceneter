---
name: icode-instructor-operations
description: Handle iCode instructor hiring, onboarding, teaching operations, and offboarding through the tenant-scoped BOS MCP. Use when asked to find candidates, reconcile instructor communications or documents, schedule interviews or onboarding, inspect teaching schedules and rosters, prepare lifecycle checklists, or identify missing instructor-management capabilities.
---

# iCode Instructor Operations

Use `bos_icode` and follow the `bos-mcp-client` context workflow. Keep hiring,
onboarding, teaching, and offboarding as distinct lifecycle use cases.
Use `bos-visual-output` for candidate pipelines, onboarding progress, teaching
coverage, and lifecycle timelines.
Use only BOS MCP or published BOS backend APIs with the iCode organization's
plugin credentials. Browser sessions and native/local connectors provide no
authorization, evidence, or fallback.
When Gmail, Calendar, Drive, or Calimatic reports an authentication error,
follow `bos-mcp-client` authentication recovery and prompt the user to complete
the service-specific secure BOS browser flow.

## Hiring

- Discover the configured recruiting or people source before querying.
- Use BOS Gmail for candidate correspondence, Drive for resumes/forms, and
  Calendar for interviews.
- Use Lead Director only when the candidate is explicitly represented there.

## Onboarding

- Build the onboarding state from the configured people source.
- Use Drive documents, Gmail correspondence or drafts, and Calendar milestones
  as supporting evidence.
- Separate completed, pending, blocked, and missing-source steps.

## Teaching

- Use Calimatic for classes and rosters when returned records contain the
  required instructor/class fields.
- Use Calendar for schedules and Drive for curriculum or teaching documents.
- Never infer instructor assignment from class enrollment alone.

## Offboarding

- Discover the configured people source and produce a lifecycle checklist.
- Execute an update only through a published, authorized lifecycle tool.
- Never use deletion as offboarding and never claim revocation or removal from
  evidence-only sources.

## Output

State use case, date range, primary source, supporting evidence, current state,
and actions required. Report missing recruiting/people capabilities precisely.
