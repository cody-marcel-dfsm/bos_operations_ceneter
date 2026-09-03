---
name: agent-call-operations
description: Find an Education Center lead and initiate one governed outbound Agent Call through the tenant-scoped BOS MCP. Use when an authorized adult staff member asks to call, phone, contact by voice, or start an AI or agent call to a lead, parent, guardian, trial family, or prospect, including requests that identify the lead by name or phone number.
---

# Education Center Agent Calls

Use the authenticated BOS MCP connection and follow `bos-mcp-client`
for context validation, manifest refresh, transport recovery, and provider
authorization recovery. Resolve source routing and customer-facing terminology
through `education-center-service-routing`.

Read [references/capability-contract.md](references/capability-contract.md)
before invoking the call mutation.

## Workflow

1. Call `bos_get_context` once and require one server-derived Education Center
   organization, installation, delegated role, and Agent Call capability.
2. Search with `education_center_search_leads` using the identifying information
   supplied by the user. Normalize a phone number only for matching; keep the
   full value out of the final response unless the user requests it.
3. Resolve exactly one lead. Ask for one distinguishing value when several
   records remain. Return `lead_not_found` without a mutation when none match.
4. Confirm from live server state that the lead exposes the Agent Call action.
   Treat the user's explicit request to initiate the call as authorization for
   that single lead and single call. Never expand it into a campaign or queue.
5. Treat each explicit user request to initiate a call as a new dispatch
   request. Create a fresh idempotency key for that request, including when it
   targets the same lead in the same conversation, and call
   `education_center_initiate_agent_call` with the exact `lead_id` from the
   matched record's `attributes.available_actions[]` entry whose `action_id`
   is `agent_call` and whose `tool` is
   `education_center_initiate_agent_call`. Never pass the top-level federated
   `record_ref` (`bos:person:...`) as `lead_id`. If that exact action or its
   `arguments.lead_id` is absent or ambiguous, return `lead_not_found` without
   a mutation.
   Omit organization, application, installation, role, plugin, action, phone,
   and provider identifiers.
6. Reuse that key only for a transport retry, provider-authorization recovery,
   or reconciliation of this exact dispatch request. If provider authorization
   is required, preserve the same lead and idempotency key, complete the
   BOS-hosted recovery flow, refresh context and operation status, and retry the
   same `tools/call` once.
7. If the result is uncertain after a disconnect, call
   `education_center_get_agent_call_status` with the same lead and the returned
   call-log or provider-call reference. This is the only operation used for
   call outcome reconciliation; never replay the mutation to read status.
8. When the first result is `accepted`, `queued`, or `in_progress`, keep the
   task active for a bounded status follow-up. Call
   `education_center_get_agent_call_status` at short intervals for up to 60
   seconds, stopping when it becomes terminal or a blocker requires user
   action. Reuse the original lead and call reference throughout; never create
   a second call.
9. Treat follow-up questions about status, statistics, outcome, duration,
   summary, transcript availability, or the call log as read-only. Answer them
   with `education_center_get_agent_call_status`; never invoke the call mutation
   and never count mutation replay as a call statistic.
10. Report the matched lead, what the evidence proves happened, what remains
    unconfirmed, and the next action. Apply the reporting contract below.

## User-facing reporting contract

Lead with one plain-language result that answers whether the requested call
actually completed:

- `completed`: **Call completed.** Include the provider-reported outcome and
  duration when returned. State that the person answered only when the
  completed outcome says so.
- `in_progress`: **Call in progress.** State whether provider dispatch and call
  start are confirmed, then give the latest status-check time.
- `accepted` or `queued`: **Call requested; completion not confirmed.** Explain
  that BOS accepted or queued the request. State provider dispatch, call start,
  answer, and completion as unconfirmed unless the result explicitly proves
  each event.
- `failed` or rejected: **Call failed.** State the sanitized reason and whether
  the evidence confirms that no provider call was placed. If dispatch may have
  occurred, say that clearly instead of claiming no call was placed.
- `duplicate`: Describe it as reconciliation of the original request. Report
  the original operation's canonical state; never present duplicate prevention
  as evidence that the call completed.
- missing or contradictory state: **Call status unverified.** State exactly
  which facts are confirmed and that the basic request cannot yet be confirmed
  complete.

Keep the response to a compact result plus only the useful details: lead,
confirmed events, outcome or unresolved state, and next action. For every new
dispatch, include the BOS operation reference, provider call reference when
available, and call-log ID. Omit internal counters, CRM status, and
reconciliation mechanics unless they explain a failure. Never say `dispatched`
from `accepted`, `queued`, an operation ID, or a duplicate response alone. If
bounded follow-up ends without a terminal result, include how long status was
checked and say that no second call was placed.

### Screenshot-ready errors

When a dispatch or status request fails, make the response useful to the person
reporting the problem. Lead with **Call failed — send this screenshot to BOS
support.** Then show one compact, screenshot-ready error block containing:

- `Error:` the exact sanitized public error message returned by BOS;
- `Error code:` the returned public error code;
- `Support reference:` the returned correlation ID, request ID, BOS operation
  reference, or call-log ID, in that order of preference;
- `Call placement:` `not placed`, `may have been placed`, or `unknown`, based
  only on returned evidence; and
- `Next action:` `Send a screenshot of this complete error to the BOS
  maintainer. Do not retry the call until they confirm whether it was placed.`
  whenever placement is not proven false.

Use `Not returned by BOS` for any missing error field. If BOS returns no usable
error code, message, or support reference, state `BOS returned an invalid error
response` as the error and include the failed public tool name and timestamp so
the screenshot still identifies the incident. Preserve sanitized error text
verbatim; never replace it with a generic phrase such as `indeterminate server
error`.

Do not expose stack traces, credentials, raw authority identifiers, phone
numbers, or provider payloads. Do not infer a root cause, claim a manifest or
provider defect, or instruct the end user to publish or repair server tools
unless the server response or live discovery proves that exact condition. Keep
developer repair instructions out of the user-facing error.

## Safety and scope

- Direct communications involving a minor to the authorized parent or guardian.
- Minimize phone numbers, contact data, provider IDs, transcripts, and call
  content in output.
- Use only the semantic Agent Call tool. Never invoke a generic plugin execute
  endpoint, provider passthrough, phone dialer, or client-supplied FSM action.
- Fail closed when the live tool is absent, the lead is ambiguous, the Agent
  Call action is unavailable in the lead's current state, or authority is
  incomplete.
- When the live context advertises Agent Call but the current callable manifest
  omits `education_center_initiate_agent_call`, preserve the matched lead and
  stable idempotency key and invoke the host's same-task continuation controls.
  Refresh the root BOS MCP server schema, rediscover tools, call
  `bos_get_context`, and resume the pending mutation once. Do not end the task
  by asking the user to reconnect, retry, resend, or start another task.
- Report `server_capability_unavailable` only after the refreshed same-task
  continuation also omits `education_center_initiate_agent_call`. State that no
  call was dispatched and identify MCP tool publication as the
  required repair.
