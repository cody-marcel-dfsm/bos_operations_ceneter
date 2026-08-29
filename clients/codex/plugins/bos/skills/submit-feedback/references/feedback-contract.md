# BOS Feedback Client Contract

Use `bos_submit_feedback` through the package's static
`POST /mcp/apps/bos/platform` connection with the
existing host-managed, resource-scoped BOS OAuth grant. Both route segments
are immutable human-readable package configuration; the client never derives
them from an installation ID or customer setting. Execution scope never
appears in the request body and the client never falls back to an unnamed endpoint.
BOS derives the authorized tenant and installation from the validated grant.

## Required fields

- `client_submission_id`: UUID used unchanged for one safe retry
- `category`: `bug`, `enhancement`, `usability`, `documentation`,
  `incorrect-result`, `missing-capability`, or `other`
- `severity`: `low`, `medium`, `high`, or `blocking`
- `target`: one primary target object
- `title`: 1–200 characters
- `message`: 1–8000 characters

Target types are `package`, `skill`, `plugin`, `mcp-tool`, `installation`, and
`general`. Populate only applicable selectors: `product_name`,
`product_version`, `skill_name`, `plugin_name`, and `tool_name`.

## Optional fields

- `related_targets`: up to 20 target objects for affected package surfaces
- `expected_behavior`, `actual_behavior`, `reproduction_summary`: up to 4000
  characters each
- `client_context`: allowlisted `client_name`, `client_version`, `platform`,
  and sanitized `correlation_id`
- `session_context` for `report session`:
  - `trigger`: exactly `report-session`
  - `session_goal`: required, up to 2000 characters
  - `observed_behavior`: up to 4000 characters
  - `edits_summary`: up to 6000 characters
  - `validation_summary`: up to 2000 characters
  - `unresolved_items`: up to 4000 characters

Unknown properties are invalid. Send plain text only.

For `report session`, automatically inspect customer-owned extension manifests
matching the active customer and each affected product skill. Resolve the
customer from trusted client context and ask when it remains unresolved.
Include a plain-text summary of all typed override categories, keys, and
sanitized values in `session_context.edits_summary` or `message`. Do not add a
new payload property. Do not include absolute paths, raw manifests, tenant
identifiers, or legacy instruction bodies.

## Example

```json
{
  "client_submission_id": "00000000-0000-4000-8000-000000000003",
  "category": "enhancement",
  "severity": "medium",
  "target": {
    "type": "package",
    "product_name": "education-center",
    "product_version": "0.4.8"
  },
  "related_targets": [
    {
      "type": "skill",
      "product_name": "education-center",
      "skill_name": "education-center-class-operations"
    }
  ],
  "title": "Include session-derived feedback",
  "message": "Allow the user to submit a sanitized summary of the active task and package-owned skill edits.",
  "session_context": {
    "trigger": "report-session",
    "session_goal": "Improve package feedback capture.",
    "edits_summary": "Added a session-report workflow to the feedback skill.",
    "validation_summary": "Skill and package validation passed."
  }
}
```

## Success

Expect `status: received`, a durable `feedback_id`, `feedback_uuid`, the same
`client_submission_id`, `received_at`, a canonical `target`, and a sanitized
`correlation_id`. The service does not echo the feedback body.

## Errors

- `authentication_required / missing_bos_authentication`: run local BOS auth.
- `context_required / missing_or_ambiguous_scope`: resolve exact context.
- `forbidden / feedback_create_not_allowed`: report missing permission.
- `invalid_request / invalid_feedback_payload`: correct named fields only.
- `invalid_target / feedback_target_not_resolved`: correct the selector.
- `rate_limited / feedback_rate_limit_exceeded`: report retry time.
- `unavailable / feedback_storage_unavailable`: retry once with the same ID.
- `409 / idempotency_conflict`: stop; never create a replacement submission.
