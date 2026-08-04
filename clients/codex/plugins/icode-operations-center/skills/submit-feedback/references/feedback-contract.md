# BOS Feedback Client Contract

Use `bos_submit_feedback` only after selecting one exact scope returned by
`bos_get_context`.

## Required fields

- `org_id`, `app_code`, `installed_app_id`, `delegated_role_id`
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

## Example

```json
{
  "org_id": "00000000-0000-4000-8000-000000000001",
  "app_code": "icode",
  "installed_app_id": "00000000-0000-4000-8000-000000000002",
  "delegated_role_id": "operations-director",
  "client_submission_id": "00000000-0000-4000-8000-000000000003",
  "category": "enhancement",
  "severity": "medium",
  "target": {
    "type": "package",
    "product_name": "icode-operations-center",
    "product_version": "0.4.8"
  },
  "related_targets": [
    {
      "type": "skill",
      "product_name": "icode-operations-center",
      "skill_name": "icode-class-operations"
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
