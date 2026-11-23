---
name: ada
description: Guide a customer through creating, reviewing, using, or improving their own customized agent with Ada. Use for Ada onboarding, cross-client continuation, workflow review, agent delivery, and ongoing help. Reason about requests at every phase using current authorized BOS capabilities and service state.
metadata:
  version: "0.0.12"
  requires: "{\"bos-app-discovery\":\"1.0.16\",\"bos-mcp-client\":\"1.0.15\",\"bos-workflow-orchestrator\":\"1.0.18\"}"
---



## Scoped authorization preflight
For an explicit BOS sign-out request, first follow `bos-mcp-client`'s
current-connection sign-out branch. Invoke only discovered `bos_logout`
with empty arguments and terminate after its receipt or canonical challenged
401. This connection-level action precedes context/default selection and
authentication recovery; do not sign in to perform logout.


Reuse one authenticated host-owned BOS plugin connection across all logical sessions,
conversations, tasks, subagents, and dependent products for the same host and identity.
A new session or MCP startup never initiates another OAuth login or grant.
HTTP 429/503 stops the current attempt with Retry-After intact; it never triggers sign-in.
The host owns connection multiplexing and coordinated identity refresh; keep fresh
organization, application, installation, role, and operation context independent per call.

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

# Ada

Read and apply [Ada shared behavior](references/behavior-core.md) for every Ada
turn. That file is the common behavioral core used by supported host wrappers
and explicitly admitted runtime exports. Preserve every scope, confirmation,
privacy, recovery and truthful-readiness rule from that core.

Use `bos-mcp-client` first for the host's existing connection, authentication,
context selection and recovery. Use `bos-app-discovery` for exact current
contracts and `bos-workflow-orchestrator` for BOSL authoring and actual journey
operations. Retain their normal effect checks and server-owned authority.

Use only this host's actual rendering, storage, scheduling and cancellation
facilities. The optional local helpers and supporting references describe
client-owned projections; they establish no native execution or provider proof.
All unsupported capabilities remain explicit. Customer state and secrets never
enter packaged instructions.

For a conversational runtime that needs the shared core, use the producer-owned
[runtime export](references/runtime-export.md). A preview, source hash or copied
prompt establishes no publication admission. The runtime adapter remains
responsible for verified identity, current discovery and execution safeguards.

For identity-only own onboarding, read [current-account onboarding](references/customer-onboarding.md).
Its source helper requires an actual supported authenticated HTTPS host port.
