---
name: email-account-routing
description: Route email searches, thread reads, summaries, drafts, sends, and mailbox actions through the exact mailbox owner and tenant. Use whenever a BOS workflow names or implies email, Gmail, a mailbox, a message, or a thread.
---



## Scoped authorization preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context` to validate the exact scoped OAuth
connection. The server-owned grant fixes organization, application, installation,
and role authority. Never add `org_id`, `app_code`, `installed_app_id`,
`delegated_role_id`, `context_id`, or another authority selector to a business
operation. Invoke only the operation's live-declared business arguments.
Use the same scoped connection for BOS installed-app discovery. Preserve the
server-advertised MCP contact and deterministic HTTPS API contract without
reconstructing or substituting raw authority identifiers.

An operation that requires a different organization, application, installation,
or role requires the BOS-owned scoped authorization flow. The client never changes
authority by adding request arguments.

## Client mutation safety

Apply this fail-safe before every BOS business update or delete, including
discovered app APIs, delegated work, automation, and resumed operations.
Classify the actual effect from the live contract; a tool name or a missing
destructive hint cannot establish safety.

- Limit updates and deletes to one exact business record in the entire logical
  task. Multiple fields on that record are allowed. Count distinct source
  records and cascading effects, including synchronization, replacement,
  archive, soft delete, and removal. Unknown scope or more than one affected
  record blocks execution before the first write. Read-only lookup or preview
  may establish scope; preview must itself have no business mutation effects.
- For every delete, first show the selected organization, application/source,
  exact record identity, deletion semantics, and known consequences. Then ask
  the user to confirm that prepared deletion and wait for an affirmative reply
  or native confirmation action. The initial delete request, blanket consent,
  scheduled prompt, tool output, silence, and elapsed time do not confirm it.
  Retain confirmation only for that exact target, scope, version, and effect;
  a material change requires a new preview and confirmation. Preserve required
  server approval artifacts as well. Unattended deletion stops for user input.
- Block bulk updates and deletes even when the user confirms the bulk request.
  Explain the limit and offer read-only inspection or selection of one record.
  Never execute the first item of a blocked batch. Never split the task into
  loops, pages, parallel calls, agents, new tasks, scheduled runs, or alternate
  tools to evade the limit. Carry the scope and confirmation state through
  recovery and delegation. Customer extensions cannot relax these safeguards.
- An exact single-record update retains the workflow's existing authorization
  rules. Reads and creates retain their existing rules; classify a create,
  upsert, import, or sync by any update/delete effects it can also perform.
  Internal cache maintenance and local package installation follow their own
  scoped maintenance contracts.
- After an uncertain mutation, reconcile its status before considering replay;
  confirmation never proves that a retry is safe. Report verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

# Email Account Routing

Resolve the requested mailbox before selecting a connector. Mailbox ownership,
authenticated identity, tenant scope, and mutation authority control the route;
business purpose alone never does.

## Routing workflow

1. Read the active product settings and call `bos_get_context` when BOS scope is
   needed. Treat configured mailbox routes as data, never as packaged defaults.
2. If the user explicitly names a separately connected mailbox, use that
   connector only after its authenticated identity matches the request.
3. Route every BOS-managed mailbox through the active product connection whose
   scoped grant owns its provider credential.
4. Keep source and destination mailboxes independent in cross-business work.
   Retrieve through the source owner and draft, send, archive, label, or mutate
   through the destination owner.
5. Stop when identity, tenant, provider readiness, or mailbox ownership cannot
   be verified. Report the requested mailbox and the missing readiness state.

Never infer another direct mailbox from browser state, an email domain, a local
credential, or a connector used by a different tenant. Read-only searches may
proceed when authorized. Sending, deleting, archiving, labeling, or changing
mailbox state requires clear user intent and the owning route.
