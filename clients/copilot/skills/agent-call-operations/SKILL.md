---
name: agent-call-operations
description: Find an Education Center lead and initiate one governed outbound Agent Call through the tenant-scoped BOS MCP. Use when an authorized adult staff member asks to call, phone, contact by voice, or start an AI or agent call to a lead, parent, guardian, trial family, or prospect, including requests that identify the lead by name or phone number.
---

# Education Center Agent Calls

Use the named `education-center` MCP connection and follow `bos-mcp-client`
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
5. Create one stable task-local idempotency key and call
   `education_center_initiate_agent_call` with only the server-owned lead
   identifier and that key. Omit organization, application, installation,
   role, plugin, action, phone, and provider identifiers.
6. If provider authorization is required, preserve the same lead and
   idempotency key, complete the BOS-hosted recovery flow, refresh the manifest,
   revalidate context, and resume once.
7. If the result is uncertain after a disconnect, reconcile by the returned
   operation identity or the original idempotency key before any replay.
8. Report the matched lead, canonical call state, and next action. State
   `accepted` or `queued` precisely; claim that a person was reached only from
   a completed provider outcome.

## Safety and scope

- Direct communications involving a minor to the authorized parent or guardian.
- Minimize phone numbers, contact data, provider IDs, transcripts, and call
  content in output.
- Use only the semantic Agent Call tool. Never invoke a generic plugin execute
  endpoint, provider passthrough, phone dialer, or client-supplied FSM action.
- Fail closed when the live tool is absent, the lead is ambiguous, the Agent
  Call action is unavailable in the lead's current state, or authority is
  incomplete.
- When the tool is absent after one manifest refresh, report
  `server_capability_unavailable` and name
  `education_center_initiate_agent_call` as the missing server contract.
