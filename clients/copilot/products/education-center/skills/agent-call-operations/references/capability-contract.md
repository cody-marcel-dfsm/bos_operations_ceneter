# BOS Agent Call capability contract

The public MCP operation is `education_center_initiate_agent_call`. It is a
single-lead action owned by the `education-center-automated-outreach` plugin and exposed
only through `/mcp/apps/leaddirector/education-center`.

## Public input

| Field | Requirement |
| --- | --- |
| `lead_id` | Required opaque identifier returned by `education_center_search_leads` in the same authorized context |
| `idempotency_key` | Required stable key for this user request, lead, and intended call |

The public schema excludes `org_id`, `app_code`, `installed_app_id`,
`delegated_role_id`, `actor_role_id`, `plugin_id`, `action_id`, phone numbers,
and provider identifiers. BOS derives execution authority from the OAuth grant
and resolves the destination from the canonical lead record.

## Server behavior

The authenticated router dispatches to a dedicated PO operation. The PO must:

1. resolve the exact installation and plugin execution role from canonical
   installed-app metadata;
2. load the lead within that scope and reject cross-tenant selectors;
3. verify the lead's current FSM state exposes the `agent_call` action;
4. validate the scoped `education-center-automated-outreach` and voice-provider readiness;
5. acquire an operation lock and enforce the supplied idempotency key;
6. invoke the existing bound Agent Call service without generic plugin
   passthrough;
7. persist audit, operation, and provider-dispatch state through PO/GO paths;
8. return a deterministic operation identity and canonical state; and
9. reconcile a repeated key without dispatching a second provider call.

Expected public states include `accepted`, `queued`, `in_progress`,
`completed`, `failed`, and `duplicate`. Sanitize provider errors and use the
existing `authorization_required` recovery envelope when direct provider
authorization is needed.

## Authorization and discovery

The server registers the canonical operation, maps it to the public tool name,
adds it to the Education Center resource-group allowlist, and advertises it only
when all of these are true:

- the OAuth grant resolves exactly one Education Center installation and role;
- that installation enables the `education-center` MCP resource group;
- `education-center-automated-outreach` is installed and enabled;
- the delegated role and plugin `run_as_role` grant the Agent Call capability;
  and
- provider health allows the operation to be advertised.

The client package needs no reusable authority and carries no provider secret.
