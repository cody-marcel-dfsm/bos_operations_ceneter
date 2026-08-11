# BOS Feedback Backend Service PRD

Status: Proposed
Owner: BOS backend service team
Requesting client: BOS Operations Center package
Client design: [Client Feedback Implementation Design](CLIENT_FEEDBACK_IMPLEMENTATION_DESIGN.md)

## 1. Product summary

Implement the tenant-scoped backend service and MCP capability required for a
customer to store feedback about any BOS package skill, MCP tool, plugin, or
package behavior. The requesting client will compose and sanitize the feedback;
the service validates canonical scope, persists it, and returns a durable
receipt.

The first release stores feedback for later review. A future release may expose
the records as an agent-development queue. Queue automation is outside this
release, while the storage model must preserve the fields needed to support it.

## 2. Problem

Customers encounter unclear instructions, missing workflows, incorrect
results, tool failures, and enhancement opportunities while using package
skills. Today there is no consistent path from the active client context into
BOS-managed feedback storage. Feedback can lose the affected package version,
skill or tool identity, tenant scope, reproduction details, and submission
receipt.

## 3. Goals

1. Let a user say phrases such as:
   - “Send feedback that the camp report should show Care.com separately.”
   - “Report a problem with the BOS authentication skill.”
   - “Submit feedback about the tool that just failed.”
   - “Give feedback on this package.”
   - “Report session.”
2. Resolve the affected package, skill, tool, and version when available.
3. Preserve exact authenticated BOS organization, application, installation,
   actor, and role provenance.
4. Submit a privacy-minimized record through one stable BOS MCP mutation.
5. Return a durable feedback ID and received timestamp.
6. Make retries idempotent.
7. Store records in a form suitable for a future development queue.

## 4. Non-goals

- Automatically modify skills, tools, prompts, or server behavior.
- Automatically create GitHub issues or development tasks.
- Attach files, screenshots, complete chat transcripts, or execution logs in
  the initial release.
- Store credentials, authorization headers, cookies, provider secrets, or API
  keys.
- Provide an anonymous or unauthenticated feedback channel.
- Implement queue prioritization, assignment, agent execution, or release-note
  generation.

## 5. Required service use cases

### 5.1 Explicit submission

When the user explicitly says “send,” “submit,” “record,” or “report” feedback,
the client skill:

1. Calls `bos_get_context` once.
2. Uses the product's fixed named application/group MCP connection; BOS derives
   one exact authorized execution scope from the authenticated credential.
3. Identifies the feedback target from the active skill/tool/package context.
4. Produces a concise title and feedback body faithful to the user's words.
5. Adds only the minimum sanitized reproduction context needed to understand
   the issue.
6. Presents the sanitized payload for explicit user confirmation, then calls
   `bos_submit_feedback` through the product's existing named MCP connection.
7. Shows the returned feedback ID, status, target, and timestamp.

The explicit imperative authorizes preparation of the feedback described in
that request. The client obtains confirmation immediately before submission.

### 5.2 Session-derived feedback

The service must accept a bounded, client-composed session summary when the
user invokes `report session` or an equivalent explicit command. The client
may provide:

- The session goal.
- A summary of observed behavior.
- A summary of package-owned skill/tool edits.
- Validation performed.
- Remaining unresolved items.
- A primary package/skill/tool target plus related affected targets.

The service never requires or accepts a raw transcript, raw diff, patch body,
complete file content, absolute path, or raw tool payload for this use case.
It validates the same tenant scope, field limits, idempotency, authorization,
privacy, and logging rules as every other feedback submission.

### 5.3 Ambiguous or conversational feedback

When the user expresses dissatisfaction or an idea without asking to submit
it, the skill drafts a one-paragraph feedback summary and asks whether to send
it. It performs no mutation until the user explicitly authorizes submission.

When the target is ambiguous, ask one concise question that identifies the
affected skill, tool, or package. Do not guess among materially different
targets.

### 5.4 Submission failure

- Authentication missing: follow the standard local BOS authentication flow;
  never request the credential in chat.
- Scope absent or ambiguous: fail closed and identify the missing context.
- Feedback capability absent: preserve a sanitized draft in the conversation
  and report `BOS feedback capability unavailable`.
- Transport or server failure: retain the same `client_submission_id` for one
  safe retry. Report the returned correlation ID when the retry fails.
- Never persist a local offline queue in the initial release.

## 6. Client assumptions the service must support

### 6.1 Client skill

The requesting client owns natural-language triggering, draft/confirmation
behavior, target selectors, payload sanitization, and receipt presentation.
The service must accept the resulting bounded request without depending on a
specific LLM, chat client, or package implementation. The backend owns
authentication, authorization, canonical target resolution, persistence,
idempotency, rate limits, and receipts.

### 6.2 Product identity

The client supplies its observed product, skill, plugin, tool, and version
selectors. The backend resolves them against the canonical catalog when
possible and returns the canonical target in the receipt. Client selectors
never grant authority.

### 6.3 Stable MCP contract

Add `bos_submit_feedback` to the BOS service's advertised contract tools. The
tool appears in `tools/list` for authorized endpoints and calls fail closed
until the API key and exact tenant scope are valid.

The BOS service stores feedback through its authenticated application path. It
keeps request bodies out of transport logs and derives authority from canonical
server context.

Add `bos_get_feedback_receipt` only if backend processing can change the record
after acceptance during this release. A successful synchronous create response
is sufficient for the storage-only MVP.

### 6.4 Client context accepted by the service

Allowed contextual fields:

- Product/package name and installed version.
- Skill name.
- MCP tool name and sanitized error code when relevant.
- Client name and client version when discoverable.
- User-authored expected and actual behavior.
- A short, newly composed reproduction summary.
- Server-returned correlation ID associated with the failure.

Excluded contextual fields:

- Full chat transcripts or hidden prompts.
- Credentials, API keys, tokens, cookies, or authorization headers.
- Raw email bodies, student/family data, customer contact data, or unrelated
  business records.
- Environment-variable values.
- Absolute local paths or arbitrary file contents.
- Raw MCP request/response payloads.

### 6.5 Client response

On success, return:

```text
Feedback submitted: FB-2026-000123
Target: camp-capacity-planning
Status: received
```

Do not claim that engineering work, triage, prioritization, or a product change
has started.

## 7. MCP API contract

### 7.1 Tool

`bos_submit_feedback`

Description:

> Submit sanitized customer feedback about a BOS package, skill, plugin, or
> MCP tool in exact server-returned tenant scope. Returns a durable receipt.

### 7.2 Input schema

```json
{
  "type": "object",
  "properties": {
    "delegated_role_id": { "type": "string", "minLength": 1, "maxLength": 200 },
    "client_submission_id": { "type": "string", "format": "uuid" },
    "category": {
      "type": "string",
      "enum": ["bug", "enhancement", "usability", "documentation", "incorrect-result", "missing-capability", "other"]
    },
    "severity": {
      "type": "string",
      "enum": ["low", "medium", "high", "blocking"]
    },
    "target": {
      "type": "object",
      "properties": {
        "type": { "type": "string", "enum": ["package", "skill", "plugin", "mcp-tool", "installation", "general"] },
        "product_name": { "type": "string", "maxLength": 100 },
        "product_version": { "type": "string", "maxLength": 50 },
        "skill_name": { "type": "string", "maxLength": 100 },
        "plugin_name": { "type": "string", "maxLength": 100 },
        "tool_name": { "type": "string", "maxLength": 150 }
      },
      "required": ["type"],
      "additionalProperties": false
    },
    "related_targets": {
      "type": "array",
      "maxItems": 20,
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string", "enum": ["package", "skill", "plugin", "mcp-tool", "installation"] },
          "product_name": { "type": "string", "maxLength": 100 },
          "product_version": { "type": "string", "maxLength": 50 },
          "skill_name": { "type": "string", "maxLength": 100 },
          "plugin_name": { "type": "string", "maxLength": 100 },
          "tool_name": { "type": "string", "maxLength": 150 }
        },
        "required": ["type"],
        "additionalProperties": false
      }
    },
    "title": { "type": "string", "minLength": 1, "maxLength": 200 },
    "message": { "type": "string", "minLength": 1, "maxLength": 8000 },
    "expected_behavior": { "type": "string", "maxLength": 4000 },
    "actual_behavior": { "type": "string", "maxLength": 4000 },
    "reproduction_summary": { "type": "string", "maxLength": 4000 },
    "session_context": {
      "type": "object",
      "properties": {
        "trigger": { "type": "string", "enum": ["report-session"] },
        "session_goal": { "type": "string", "maxLength": 2000 },
        "observed_behavior": { "type": "string", "maxLength": 4000 },
        "edits_summary": { "type": "string", "maxLength": 6000 },
        "validation_summary": { "type": "string", "maxLength": 2000 },
        "unresolved_items": { "type": "string", "maxLength": 4000 }
      },
      "required": ["trigger", "session_goal"],
      "additionalProperties": false
    },
    "client_context": {
      "type": "object",
      "properties": {
        "client_name": { "type": "string", "maxLength": 100 },
        "client_version": { "type": "string", "maxLength": 50 },
        "platform": { "type": "string", "maxLength": 50 },
        "correlation_id": { "type": "string", "maxLength": 200 }
      },
      "additionalProperties": false
    }
  },
  "required": [
    "delegated_role_id",
    "client_submission_id",
    "category",
    "severity",
    "target",
    "title",
    "message"
  ],
  "additionalProperties": false
}
```

### 7.3 Successful result

```json
{
  "status": "received",
  "feedback_id": "FB-2026-000123",
  "feedback_uuid": "3ea8459e-9c65-4d5f-901b-ae0566eb9a92",
  "client_submission_id": "2925e7df-b371-4b85-a317-35af1423f609",
  "received_at": "2026-08-01T18:30:00Z",
  "target": {
    "type": "skill",
    "product_name": "education-center",
    "product_version": "0.4.8",
    "skill_name": "education-center-class-operations"
  },
  "correlation_id": "req_01K1..."
}
```

The result contains no echoed feedback body or sensitive context.

### 7.4 Error contract

Use stable machine-readable reasons:

| Status | Reason | Meaning |
|---|---|---|
| `authentication_required` | `missing_bos_authentication` | Start local BOS authentication. |
| `context_required` | `missing_or_ambiguous_scope` | Resolve one canonical context. |
| `forbidden` | `feedback_create_not_allowed` | Actor or installation lacks permission. |
| `invalid_request` | `invalid_feedback_payload` | Field or size validation failed. |
| `invalid_target` | `feedback_target_not_resolved` | Target does not match the canonical catalog/installation. |
| `rate_limited` | `feedback_rate_limit_exceeded` | Retry after the returned time. |
| `unavailable` | `feedback_storage_unavailable` | Server could not persist the record. |

Every server error returns a sanitized `correlation_id`. Validation errors may
identify field names and never echo field values.

### 7.5 Idempotency

`client_submission_id` is mandatory. The server enforces uniqueness for the
authenticated actor and installation. Repeating the same submission ID returns
the original receipt without creating a duplicate. Reusing an ID with different
content returns `409 idempotency_conflict`.

## 8. Backend service requirements

### 8.1 Ownership and execution path

- Surface: application-neutral BOS platform capability.
- Capability identifier: `platform-feedback.feedback.create`.
- MCP tool: `bos_submit_feedback`.
- PO operation: `feedback.submit`.
- GO operation: tenant-scoped feedback persistence.
- Provider dependency: none.

Route the mutation MCP → BOS Router → Feedback PO → Feedback GO → database.
The MCP handler and router perform no direct persistence.

### 8.2 Authorization

1. Authenticate the actor from the BOS MCP session.
2. Derive organization, application, installation, and delegated-role scope
   from the authenticated principal. Treat the human-readable application and
   skill-group route only as application/tool-group selection, never as an
   authority or installation identifier.
3. Require an active installation and a feedback-create capability grant.
4. Record both authenticated actor identity and validated delegated execution
   role.
5. Resolve package/skill/plugin/tool identity against the server catalog when
   catalog data exists.
6. Reject cross-tenant identifiers, actor-supplied authority, inactive
   installations, and ambiguous scope.

### 8.3 Persistence model

Minimum fields:

| Field | Requirement |
|---|---|
| `id` | Internal UUID. |
| `display_id` | Human-readable immutable receipt ID. |
| `org_id` | Tenant boundary and indexed foreign key. |
| `app_code` / `installed_app_id` | Validated application scope. |
| `actor_id` / `delegated_role_id` | Submission provenance. |
| `client_submission_id` | Idempotency key. |
| `category` / `severity` | Validated enums. |
| `target_type` and canonical target IDs/names | Development routing data. |
| `related_targets` | Canonicalized affected package surfaces for multi-skill session reports. |
| `product_version` | Client-observed affected version. |
| `title` / `message` | User feedback. |
| `expected_behavior` / `actual_behavior` | Optional diagnostic detail. |
| `reproduction_summary` | Optional sanitized steps. |
| `session_context` | Optional bounded summaries for explicitly requested session reports. |
| `client_context` | Allowlisted JSON only. |
| `status` | Initially `received`. |
| `source` | `mcp`. |
| `created_at` / `updated_at` | Server timestamps. |

Recommended uniqueness constraint:

```text
(actor_id, installed_app_id, client_submission_id)
```

The schema should allow later queue fields such as triage state, priority,
assignment, linked development task, resolution, and release version without
making them writable through the initial public MCP contract.

### 8.4 Privacy and logging

- Encrypt transport with TLS and use normal database encryption controls.
- Log tool name, outcome, duration, feedback UUID/display ID, tenant-safe IDs,
  and correlation ID.
- Never log `message`, expected/actual behavior, reproduction text, credentials,
  session-context text, headers, or raw request payloads.
- Apply server-side secret-pattern detection and reject or redact suspected
  credentials before persistence. Return which field was sanitized without
  returning the matched value.
- Define retention and deletion behavior before production rollout.

### 8.5 Abuse controls

- Rate-limit by actor, organization, and installation.
- Enforce all field-size limits before orchestration.
- Store plain text and escape it on every rendered surface.
- Reject attachments and unknown JSON properties.
- Preserve an audit event for accepted and rejected submissions without
  retaining rejected sensitive content.

## 9. Acceptance criteria

### Requesting-client compatibility

1. “Submit feedback about this skill” resolves the active skill and sends one
   mutation after explicit user authorization.
2. A conversational complaint produces a draft and asks before submission.
3. A successful submission displays the durable receipt.
4. Missing authentication enters the standard BOS local handoff.
5. Missing or ambiguous scope fails closed.
6. The client never sends a transcript, secret, raw tool payload, or unrelated
   business record.
7. One retry uses the same `client_submission_id`.
8. The skill is built into every intended Codex, Claude, Copilot, and Gemini product.

### Server

1. The tool appears in the stable MCP manifest before authentication.
2. Unauthenticated calls fail with `authentication_required`.
3. Cross-tenant, inactive-installation, and unauthorized-role submissions fail.
4. A valid request persists through PO/GO and returns a receipt.
5. Identical idempotent retries return the original receipt.
6. Conflicting idempotency reuse returns `409 idempotency_conflict`.
7. Logs and traces contain no feedback body or secret values.
8. Stored target identity is canonicalized when catalog data exists.
9. The created record starts in `received` and is queryable internally for
   future queue work.
10. A session-derived submission stores bounded summaries and related targets
    while rejecting raw transcript/diff/file payloads and unknown properties.

## 10. Validation plan

### Client contract tests required for integration

- Product manifest and generated-client snapshot tests.
- Broker startup contract test for `bos_submit_feedback`.
- Broker forwarding and exact-scope tests.
- Authentication-required and ambiguous-scope tests.
- Payload allowlist and no-secret logging tests.
- Skill trigger tests for explicit, implicit, ambiguous-target, and unrelated
  feedback language.
- End-to-end staging test that submits a unique synthetic record and verifies
  the returned receipt.

### Backend tests

- MCP schema and response contract tests.
- Router capability resolution tests.
- PO authorization and idempotency tests.
- GO tenant-isolation and persistence tests.
- Negative cross-tenant and actor-supplied authority tests.
- Secret-pattern, size-limit, injection, rate-limit, and log-redaction tests.
- Database migration upgrade and rollback tests.

## 11. Dependency-ordered implementation plan

1. Backend agent approves names, enums, field limits, capability ID, and
   persistence migration.
2. Backend implements Feedback GO and tenant-isolation tests.
3. Backend implements Feedback PO authorization, target resolution,
   idempotency, and rate limiting.
4. Backend publishes `bos_submit_feedback` through the router and MCP manifest.
5. Backend publishes a staging environment and contract fixture for the
   requesting client.
6. The client repository implements the separate client design against the
   published contract.
7. Run backend checks plus the cross-repository staging submission smoke test.
8. Release behind the server capability grant, then enable it for internal test
   organizations before customer rollout.

## 12. Rollout and rollback

Rollout gates:

- Production migration applied and verified.
- Stable MCP contract deployed before the client package requiring it.
- Log-redaction and cross-tenant tests passing.
- Internal organization successfully submits and retrieves a receipt.
- Rate limits and retention policy configured.

Rollback:

- Remove or disable the server capability grant to stop new writes.
- Keep the table and accepted records intact for recovery and audit.
- The client skill reports capability unavailability and preserves only a
  conversation-local draft.
- Remove the advertised server contract in a later service release only after
  all supported clients have completed rollback.

## 13. Open decisions for the backend agent

1. Whether feedback records need a customer-visible status lookup in the MVP.
2. Retention period and customer deletion/export policy.
3. Canonical catalog identifiers available for package, skill, plugin, and MCP
   tool targets.
4. Default per-actor and per-organization rate limits.
5. Whether `severity` remains user/agent-supplied or is stored as
   `reported_severity` for later triage.
