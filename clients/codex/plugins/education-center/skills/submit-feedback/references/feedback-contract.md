# BOS Feedback Client Contract

Use `bos_submit_feedback` through the package's static
`POST /mcp/apps/bos/platform` connection with the
existing host-managed, resource-scoped BOS OAuth grant. Both route segments
are immutable human-readable package configuration; the client never derives
them from an installation ID or customer setting. Execution scope never
appears in the request body and the client never falls back to an unnamed endpoint.
BOS derives the authorized tenant and installation from the validated grant.

## Required fields

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

Unknown properties are invalid. Text fields remain plain text.

- `attachments`: up to five screenshots. Each object contains only `mime_type`
  (`image/png`, `image/jpeg`, or `image/webp`), `data_base64` (strict standard
  base64, at most 6,990,508 characters), and `sanitized: true`. Each decoded image
  is at most 5 MiB (5,242,880 bytes), with at most 16 million pixels; the submission
  total is at most 20 MiB before and after metadata removal. Animation is
  rejected. The host sanitizes the screenshot before encoding it. The server
  validates the actual format, rerasterizes it to remove embedded metadata, and
  enforces the size limit again. Visible sensitive content must already be
  redacted. Public URLs, credentials, filesystem paths and remote image fetching
  are excluded. Image bytes remain in private feedback storage.

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

Expect `status: received`, a durable `feedback_id`, `feedback_uuid`,
`received_at`, a canonical `target`, and a sanitized
`correlation_id`. The service does not echo the feedback body.

The receipt also returns `attachments`: `attachment_id` (SHA-256 of the stored
sanitized bytes), `mime_type`, and `size_bytes`. It retains `status: received`;
tracking starts at `open`. Historical received-only submissions are presented as
`open` until triaged; the original receipt and submission remain unchanged.

## Private tracking and discussion

Discover these tools on the same BOS platform connection. Every call revalidates
current membership, role, installation and exact operation grants.

| Tool | Arguments | Result |
| --- | --- | --- |
| `bos_list_feedback` | Optional `status`, `limit` (1–100; default 20) | Reporter's own summaries, newest first |
| `bos_get_feedback` | `feedback_id` | Private full record, status, attributed `history`, `comments`, attachment metadata and MCP image content blocks |
| `bos_add_feedback_comment` | `feedback_id`, `body` (1–4000 characters) | Updated private record with server-attributed comment; identical normalized comments by the same actor on one record are deduplicated |
| `bos_update_feedback` | `feedback_id`, `status`, `expected_status` | Authorized assignee transition |
| `bos_triage_feedback` | `feedback_id`, `status`, `expected_status`; optional `assigned_to` (current member UUID or null) | Authorized team transition/assignment |

The lifecycle is `open → acknowledged → in_progress → resolved → verified → closed`.
Open, acknowledged, in-progress and reopened issues may move to `wontfix`.
Resolved, verified, closed and wontfix issues may move to `reopened`; reopened
issues return to acknowledged or in-progress. `expected_status` prevents
overwriting concurrent triage. Team assignment may retain the current status.

Records are private to the reporter, currently authorized assigned participants,
and authorized team members in the exact organization and installation.
Assignment grants no authority. Reporters with read/comment permission observe
status and cannot transition it. Lists always contain only the caller's own
submissions, including for team members. History and comments contain
server-derived actor IDs, agent-installation IDs, timestamps and event IDs.
Reads exclude notification delivery state and provider secrets. Comments follow
the same sanitization rules and feedback rate limits. A record holds at most 100
comments and 1,000 lifecycle events. Screenshot bytes appear once as MCP image
content blocks in the order of returned attachment metadata; structured and text
results carry metadata only. Missing and inaccessible
IDs return the same denial.

Create and resolve events retain notification intent for a configured authorized
team recipient. Notices contain the feedback ID and event only; the recipient
signs in to read the report. A receipt does not prove notification delivery.
Polling supports v1 tracking. Issues, discussion and screenshots remain private;
only separately authorized code patches may become public.

## Errors

- `authentication_required`: run local BOS auth.
- `context_required`: resolve exact context.
- `authorization_denied`: report missing permission.
- `invalid_request`: correct named fields only.
- `invalid_target`: correct the selector.
- `rate_limited`: report retry time.
- `service_unavailable`: follow an exact returned state
  action when supplied; otherwise report the temporary service failure.
- `conflict`: stop and report the service-owned conflict.

Consume only the exact string in the BOS response's `error.code`. Do not infer
a classification from HTTP status, inspect a secondary reason as an alias, or
translate a code into a client-owned vocabulary.

The client supplies no request identity, idempotency key, attempt identity,
retry counter, reconciliation state, or execution state. BOS Service derives
request identity and owns idempotency, bounded retries, and uncertain-outcome
reconciliation.
