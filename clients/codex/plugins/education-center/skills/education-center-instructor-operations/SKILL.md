---
name: education-center-instructor-operations
description: Handle Education Center instructor hiring, onboarding, teaching operations, and offboarding through the tenant-scoped BOS MCP. Use when asked to find candidates, reconcile instructor communications or documents, schedule interviews or onboarding, inspect teaching schedules and rosters, prepare lifecycle checklists, or identify missing instructor-management capabilities.
---


## Product initialization preflight

Before performing this skill's workflow, preserve the pending request and
complete the product's host-managed BOS authentication. Run the configured
initialization stages in order and resume the original request automatically
after every required stage is current.

First validate the customer-owned `config/customer-settings.json` against
`config/customer-settings.template.json`. Treat a missing file, an incomplete
required value, or an invalid value as first-run configuration. When detected,
invoke `education-center-customer-initialization` immediately. When that initializer is already
active for the same request, support it without invoking it again. Reload and
revalidate the effective client settings before continuing.

After client settings are current, validate the server plugin-settings
initialization epoch, required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, or the server schema changed.
Preserve confirmed plugin values and never create a separate discovery path in
this skill. Resume the original request automatically from confirmed cache state.

# Education Center Instructor Operations

## Tenant terminology

Load effective customer settings and resolve the brand through
`education-center-service-routing`. Use `brand_display_name`, or the active
skill extension's `terminology.brand_display_name` override, wherever
customer-facing output names the franchise or brand. Keep technical product,
skill, route, server, environment-variable, tool, capability, authorization,
and record identifiers unchanged.

Use `bos_education_center` and follow the `bos-mcp-client` context workflow. Keep hiring,
onboarding, teaching, and offboarding as distinct lifecycle use cases.
Use `bos-visual-output` for candidate pipelines, onboarding progress, teaching
coverage, and lifecycle timelines.
Use only BOS MCP or published BOS backend APIs with the Education Center organization's
plugin credentials. Browser sessions and native/local connectors provide no
authorization, evidence, or fallback.
When Gmail, Calendar, Drive, or Calimatic reports an authentication error,
follow `bos-mcp-client` request interception, activate the server-returned
secure browser handoff, poll readiness, and resume the pending operation once.

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
