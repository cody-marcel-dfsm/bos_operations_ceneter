---
name: bos-external-dependency-adapter
description: Provide the installed BOS product's authenticated dependency seam to external BOS-family plugins without giving those plugins tokens, context handles, authority selectors, or a second connection.
---



## Scoped authorization preflight

First apply the versioned identity-context workflow in `bos-mcp-client`.
For live `bos-identity-mcp/v2`, resolve explicit request scope or the saved
customer default against fresh authorized contexts, discover tools for the
selected handle, and execute with that same handle. This branch governs
context selection throughout this skill, including older scoped-grant wording.
A missing operation never permits changing organization or role to find it.
The following single-context rules apply only to legacy scoped-grant discovery.

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

- Limit updates and deletes to one exact conceptual business record in the
  entire logical task. Multiple fields on that record are allowed. That record
  may resolve to one through five explicit source-record targets in one
  discovered service request. Count distinct conceptual records and cascading
  effects, including synchronization, replacement, archive, soft delete, and
  removal. Unknown scope, more than five source targets, or more than one
  conceptual record blocks execution before the first write. Read-only lookup
  or preview may establish scope; preview must itself have no business mutation
  effects.
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
- An exact one-conceptual-record update retains the workflow's existing
  authorization rules. Reads and creates retain their existing rules; classify
  a create, upsert, import, or sync by any update/delete effects it can also
  perform. Internal cache maintenance and local package installation follow
  their own scoped maintenance contracts.
- After an uncertain mutation, invoke only the exact service-returned bodyless
  state action and service-declared timing. Never replay the mutation or
  construct a status route, selector, retry schedule, or reconciliation
  request. Confirmation never proves that another mutation is safe. Report
  verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

# BOS External Dependency Adapter

Use this BOS-owned adapter whenever a separately installed product delegates
authentication recovery, invokes an operation advertised by Describe, or
invokes a BOS-returned journey action. The adapter
uses the already installed host-managed BOS connection, its exact discovered
protected resource, and a fresh versioned BOS context provider. It never
creates a product connection or accepts a token, grant,
authority selector, context handle, retry key, or journey state from the
dependent product.

Read [the dependency adapter contract](references/dependency-adapter.md) before
integrating an external product. Use
[`external-dependency-adapter.mjs`](scripts/external-dependency-adapter.mjs) as
the executable reference implementation.

The public dependency seam is exactly:

- `recoverAuthentication({ resource, condition, host_correlation? })`;
- `waitForAuthentication({ resource, condition, host_correlation? })`;
- `invokeDiscoveredOperation(contact, payload?)`;
- `invokeReturnedAction(action, payload?)`; and
- `invokeStateAction(action)`.

`action` remains the exact server-returned
`{ verb, method, href, payload_schema }` envelope. The adapter validates the
envelope and payload, obtains the current fresh context internally, attaches
the identity-v2 context handle under the static header name published by
Describe only inside the host transport request, and
returns a sanitized service response. Legacy/v1 calls remain header-free.

`contact` is the complete current operation descriptor returned by Describe.
The adapter validates its described deterministic HTTPS execution and input
schema, validates the payload, privately obtains the current context, and calls
the advertised method and URI. The dependent product never constructs the
route or receives a context handle.

Authentication recovery is bounded to one BOS recovery cycle and one resumed
transport invocation. This bound applies only to authentication readiness.
BOS Service continues to own business idempotency, retries, reconciliation,
and journey state.
