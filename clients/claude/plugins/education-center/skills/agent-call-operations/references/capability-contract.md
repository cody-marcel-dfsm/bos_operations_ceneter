# BOS Agent Call capability contract

The public MCP operations are `education_center_initiate_agent_call` and the
read-only `education_center_get_agent_call_status`. They are owned by the
`education-center-automated-outreach` plugin and exposed only through
`/mcp/apps/bos/platform`.

## Public input

| Field | Requirement |
| --- | --- |
| `lead_id` | Required UUID copied exactly from the matched search record's `attributes.available_actions[].arguments.lead_id` for the `agent_call` action; never use the top-level federated `record_ref` |
| `idempotency_key` | Required stable key for this user request, lead, and intended call |

The status operation requires `lead_id` and accepts either `call_log_id` or
`call_id` to select an exact call. When both call selectors are omitted it
returns the latest persisted call for that lead. It never dispatches or retries
a provider call.

The public schema excludes `org_id`, `app_code`, `installed_app_id`,
`delegated_role_id`, `actor_role_id`, `plugin_id`, `action_id`, phone numbers,
and provider identifiers. BOS derives execution authority from the OAuth grant
and resolves the destination from the canonical lead record.

## Server behavior

The authenticated router dispatches to a dedicated PO operation. The PO must:

1. resolve the exact installation, authenticated `actor_user_id`, and
   server-selected actor role from the current OAuth context and membership;
2. load the lead within that scope and reject cross-tenant selectors;
3. verify the lead's current FSM state exposes the `agent_call` action;
4. validate scoped `education-center-automated-outreach` and voice-provider
   readiness for dispatch;
5. acquire an operation lock and enforce the supplied idempotency key;
6. invoke the existing bound Agent Call service without generic plugin
   passthrough;
7. persist audit, operation, and provider-dispatch state through PO/GO paths;
8. return a deterministic operation identity and canonical state; and
9. reconcile a repeated key without dispatching a second provider call.

The read operation uses the same authenticated tenant, installation, role, and
lead scope. It returns persisted BOS evidence including call-log and provider
references, dispatch/provider state, timestamps, duration, outcome, bounded
summary and sentiment, transcript availability, and the sanitized public log
URL when available. Status discovery remains read-only when the selected voice
service is disconnected.

Expected public states include `accepted`, `queued`, `in_progress`,
`completed`, `failed`, and `duplicate`. Sanitize provider errors and use the
existing `authorization_required` recovery envelope when direct provider
authorization is needed.

## Authorization and discovery

The server registers the canonical operation, maps it to the public tool name,
adds it to the Education Center resource-group allowlist, and advertises it only
when all of these are true:

- the OAuth grant resolves exactly one Education Center installation and role;
- that installation enables the Education Center subservice and requested tool;
- `education-center-automated-outreach` is installed and enabled; and
- the authenticated actor's server-selected role and immutable OAuth ceiling
  grant the requested capability.

Interactive MCP execution uses the authenticated actor and server-selected
actor role. Metadata `run_as_role` applies only to autonomous callbacks and
background work. Dispatch discovery additionally requires the healthy,
exactly-scoped voice-service binding selected by the organization's canonical
business profile. Durable status discovery depends on persisted BOS data and
remains advertised when the selected voice service is disconnected. Provider
labels and adapters remain server-owned data; the client contract contains no
provider-selection rule.

The client package needs no reusable authority and carries no provider secret.
