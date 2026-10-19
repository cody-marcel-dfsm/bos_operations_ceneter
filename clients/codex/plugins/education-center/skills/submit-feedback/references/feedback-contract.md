# BOS Feedback Client Contract

Use `bos_submit_feedback` through the package's static
`POST /mcp/apps/bos/platform` connection with the
host-supported BOS identity proof: OAuth or Muse's private identity API key.
Both use current selected-context authorization. Both route segments are immutable
human-readable package configuration; the client never derives them from an
installation ID or customer setting. Use the current advertised context boundary
and preserve each operation's argument shape, including legacy direct tools.
Execution authority fields never appear in the business request body; the client
never falls back to an unnamed endpoint. BOS validates the identity and current
selected organization, installation, eligible role, permissions and consent.

## Current capability discovery

Read the exact signed `bos-feedback-contract` resource advertised by the current
authenticated context catalog or resource listing. Follow its HTTPS Describe
contact and copy the authorized operation schemas, effects, limits and exact
POST contacts. Preserve the existing bearer/context boundary; business bodies
contain no actor, organization or execution-context selectors.

The six currently advertised native feedback tools retain their compatibility
role. Extended replies, video and reporter completion depend on actual current
schemas, independent of package version. Keep images and flat comments usable
on an older producer. Offer no unsupported fields or guessed routes.
`feedback.resolve` exists only through its discovered HTTPS contact, with no
native `bos_execute` equivalent. A compatible consumer may publish before that
capability is deployed; use begins after the producer advertises it.

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

- `attachments`: up to five sanitized media files. Each object contains only `mime_type`
  (`image/png`, `image/jpeg`, `image/webp`, and, when declared, `video/mp4` or
  `video/webm`), `data_base64` (strict standard
  base64, at most 6,990,508 characters), and `sanitized: true`. Each decoded image
  is at most 5 MiB (5,242,880 bytes), with at most 16 million pixels; the submission
  total is at most 20 MiB before and after processing. Images retain the
  16-million-pixel limit and animated images are rejected. Accepted video is
  bounded to 30 seconds, 900 decoded frames and 1280×720 in either orientation;
  the service normalizes it to silent, metadata-stripped H264 MP4.
  The client visibly removes sensitive pixels before encoding and asserting
  `sanitized: true`. Server rasterization, audio removal and metadata stripping
  preserve visible content requiring sanitization. Public URLs, credentials,
  filesystem paths and remote fetching are excluded. Media remains private.

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
| `bos_add_feedback_comment` | `feedback_id`, `body` (1–4000 characters); declared optional `parent_comment_id` | Updated private record with server-attributed comment/reply; identical normalized body, parent and actor on one record are deduplicated |
| `bos_update_feedback` | `feedback_id`, `status`, `expected_status` | Authorized assignee transition |
| `bos_triage_feedback` | `feedback_id`, `status`, `expected_status`; optional `assigned_to` (current member UUID or null) | Authorized team transition/assignment |
| Discovered HTTPS `feedback.resolve` | Only `feedback_id`, `expected_status` | Canonical reporter completion from any tracked state; closes atomically and records `resolution: reporter_confirmed` on the closure history event |

The ordinary transitions are:

| Current state | Allowed next state |
| --- | --- |
| open | acknowledged, wontfix |
| acknowledged | in_progress, wontfix |
| in_progress | resolved, wontfix |
| resolved | verified, reopened |
| verified | closed, reopened |
| closed or wontfix | reopened |
| reopened | acknowledged, in_progress, wontfix |

Same-state triage requires an explicit changed assignment under current team
authority. Read fresh uncached detail before update, triage or reporter
completion and use its status as `expected_status`. Assignment also requires an
active member and grants no authority. Implementation update requires current
update/read permission and permitted assignee/team participation.

`verified` is an implementation state, independent of reporter satisfaction.
Only the canonical reporter may use `feedback.resolve`, even when an assignee
or team member can implement or triage. Supply no resolution, actor or context
field in its business body. Ordinary closure supplies no reporter-confirmation
proof; an explicitly requested reporter completion is still valid from closed.
The service owns idempotent replay of an already reporter-completed closure,
including a previously valid expected_status, without another completion event.

HTTPS success wraps detail at `result`, with `result.feedback_id`,
`result.status`, history, comments and existing metadata; full bytes appear once
at top-level `media[{attachment_id,mime_type,data_base64}]`. There is no current
`result.resolution` field. History entries require `event_id`, `actor_id`,
`occurred_at`, and target `status`; optional fields include
`agent_installation_id`, `assigned_to`, and `resolution`. History has no sequence
or ordering guarantee. A `closed` history entry marked `reporter_confirmed`
proves that historical event; never infer current closure provenance from an
old event after reopening or ordinary reclosing. An actual successful current
`feedback.resolve` response is the reporter-completion receipt.

Replies select a UUID parent from the same record's fresh comments; replies can
receive replies. Returned comments contain `event_id`, `actor_id`,
`occurred_at`, `body`, server `author_type: reporter|service`, and optional
`agent_installation_id` and `parent_comment_id`. Preserve inert plain text and
returned attribution. Identical body/actor under a different parent is a
distinct reply. Current schema availability governs the optional parent field.

Records are private to the reporter, currently authorized assigned participants,
and authorized same-installation triage participants, with each current
operation's permissions also required.
Assignment grants no authority. Read/comment participation alone permits no
ordinary implementation transition; the canonical reporter's separately
discovered completion operation retains its own rules. Lists contain only the caller's own
submissions, including for team members. History and comments contain
server-derived actor IDs, agent-installation IDs, timestamps and event IDs.
Reads exclude notification delivery state and provider secrets. Comments follow
the same sanitization rules and feedback rate limits. A record holds at most 100
comments and 1,000 lifecycle events. Native MCP image bytes appear once as image
blocks, and video as an embedded resource blob; structured/text receipts carry
metadata only. HTTPS media bytes belong only to the top-level media array.
Match returned attachment metadata, display unknown formats as safe metadata,
and keep bytes/data URLs/public links out of logs. Missing and inaccessible
IDs return the same denial.

Create and resolve events retain notification intent for a configured authorized
team recipient. Notices contain the feedback ID and event only; the recipient
signs in to read the report. A receipt does not prove notification delivery.
There is no feedback push subscription. Polling supports v1 tracking when
requested. Issues, discussion and media remain private;
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
- `conflict`: refresh the current record and reconsider the requested change.

For HTTP 409 with `error.code: conflict`, perform a fresh detail read and
reconsider the requested change using current history/discussion/status.
`error.reason: feedback_status_conflict` is diagnostic text, never a second
machine code. An uncertain mutation also requires observation before another
write decision. A 403 missing/inaccessible response preserves the service's
concealed record boundary. Honor actual Retry-After/retry_after on rate limits;
dependency unavailability supplies no retry permission.

Consume only the exact string in the BOS response's `error.code`. Do not infer
a classification from HTTP status, inspect a secondary reason as an alias, or
translate a code into a client-owned vocabulary.

The client supplies no request identity, idempotency key, attempt identity,
retry counter, reconciliation state, or execution state. BOS Service derives
request identity and owns idempotency, bounded retries, and uncertain-outcome
reconciliation.
