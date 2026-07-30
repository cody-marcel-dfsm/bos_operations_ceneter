# BOS MCP Protocol Reference

## Scope contract

Call `bos_get_context` before domain tools. Choose one returned scope and pass these values without modification:

- `org_id`
- `app_code`
- `installed_app_id`
- `delegated_role_id`

Confirm the scope capability matches the requested operation. Common examples include `calimatic.students.read` and `calimatic.enrollments.read`.

## Common query patterns

### Class enrollments by date

Use the live enrollment-listing tool schema. A typical argument shape is:

```json
{
  "org_id": "<from bos_get_context>",
  "app_code": "<from bos_get_context>",
  "installed_app_id": "<from bos_get_context>",
  "delegated_role_id": "<from bos_get_context>",
  "query": {
    "start_date": "2026-07-27",
    "end_date": "2026-07-31"
  }
}
```

Optional filters may include `class_name` or `course` when exposed by the live description or schema.

Group enrollment results by `attributes.class_name` and list `attributes.student_name`. Retain separate daily class names for drop-in programs unless the user asks for a consolidated program view.

### Student or family search

Use the student-search tool for identity lookup, enrolled-family discovery, or student name matching. Do not use it as evidence for class dates or roster membership unless the returned schema includes those fields.

### Drive transcript or document text

Use `drive_search` to locate a Drive document when the file id is unknown.
Then use `drive_export_text` with the same BOS scope:

```json
{
  "org_id": "<from bos_get_context>",
  "app_code": "<from bos_get_context>",
  "installed_app_id": "<from bos_get_context>",
  "delegated_role_id": "<from bos_get_context>",
  "file_id": "<Drive file id>",
  "max_chars": 50000
}
```

Expected successful responses include returned text, truncation metadata, the
connected Drive identity, and `server_persisted=false`. BOS is returning text
through MCP, not storing a file on the server. If the source is a binary,
video, recording, or another unsupported MIME type, report the missing BOS
streaming/download-handle capability.

## Error taxonomy

| Type | Evidence | Recommended action |
|---|---|---|
| Discovery | Context exposes capability; matching tool is absent | Reconcile server tool name and client allowlist; reload the task |
| Authorization | Tool exists; scope/capability is missing or rejected | Correct installation grants or select an authorized scope |
| Contract | Live name, required argument, or returned field conflicts with configuration/docs | Align allowlist, schema, and implementation; add a contract test |
| Provider data | Call succeeds; required business fields are absent or incomplete | Extend the provider adapter or choose the correct domain endpoint |
| Transport | Timeout, connection failure, malformed MCP response | Retry safe reads once; report correlation ID and endpoint health |
| Presentation | Correct records are grouped, deduplicated, or labeled incorrectly client-side | Correct client transformation and add a representative example |

## Feedback report

Use this structure:

```yaml
title: "Concise BOS MCP issue or request"
category: "discovery | authorization | contract | provider-data | transport | presentation | enhancement"
severity: "low | medium | high | critical"
status: "prepared | submitted | submission-failed"
occurred_at: "ISO-8601 timestamp"
tool: "live MCP tool name"
capability: "required BOS capability"
scope:
  org_id: "authorized organization UUID"
  app_code: "authorized application code"
  installed_app_id: "authorized installed-app UUID"
  delegated_role_id: "authorized delegated role"
expected: "Specific expected behavior"
observed: "Specific observed behavior with sensitive data removed"
impact: "User or workflow impact"
reproduction:
  - "Minimal safe reproduction step"
correlation_id: "when returned"
recommendation: "Concrete contract, provider, or client improvement"
```

Before submitting, remove tokens, credentials, email addresses, phone numbers, and unnecessary student/customer names. Prefer record counts and field names over raw records.

## Feedback endpoint behavior

Treat feedback submission as an external write.

- Discover the live feedback tool and read its schema.
- Map the structured report into that schema without inventing fields.
- Ask for confirmation unless the user already asked to submit/file/send the feedback.
- Report the returned feedback ID or correlation ID.
- If the MCP exposes no feedback tool, label the report `prepared` and tell the user where it needs to be submitted.
