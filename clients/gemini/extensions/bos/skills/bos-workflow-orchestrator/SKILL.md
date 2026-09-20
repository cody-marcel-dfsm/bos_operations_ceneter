---
name: bos-workflow-orchestrator
description: Turn an authorized operational objective into a governed deterministic workflow across the user's installed federated service mesh. Use for cross-service workflow readiness, platform dependency resolution, execution planning, approval routing, recovery, and evidence-backed completion through BOS.
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

# BOS Workflow Orchestrator

Turn the user's authorized operational objective into a deterministic workflow
across the installed federated agentic service mesh. Resolve platform
dependencies, preserve required approvals, and return evidence for the work
that actually completed.

## Product boundary

BOS owns platform authentication and the shared host-managed connection.
Dependent products own their domain skills and requirements. Use the BOS
connection to discover and execute server-authorized operations with their
exact schemas and advertised API contracts. Preserve the grant-bound
application, organization, installation and role for every step.

Keep all routing application-neutral. Select applications, plugins, services,
and operations only from the current authenticated context and live discovery.
Pass only live-declared business arguments. Every call remains subject to
request-time server authorization from the connection's scoped grant.

## Agent-Driven Custom Journeys

When the user asks to create, run, resume, stop, explain, or inspect a custom
multi-step journey, use the dedicated Agent-Driven Custom Journey branch. Read:

- [BOSL authoring](references/bosl-authoring.md) before planning or registering;
- [journey lifecycle](references/journey-lifecycle.md) before invoking any
  returned journey action;
- [structured client instructions](references/client-instructions.md) when BOS
  returns `awaiting_client` or `client_action_required`; and
- [the canonical walkthrough](references/canonical-walkthrough.md) only when
  the recent-meeting campaign sequence or its acceptance fixture is relevant.

Start with fresh `app.describe`, then read its exact BOSL schema, language
reference, and examples resource URIs. Use `plugins.list` and copy each required
`service.describe` input exactly. Keep accessibility and readiness separate.
Build a concise explain plan from the discovered contracts, author raw BOSL,
run the packaged local structural checks, and submit that same JSON document to
the discovered registration operation. The explain plan remains client-side.

After registration, follow only complete actions returned by BOS. The
customer-defined text `identity` is the sole public locator. The service owns
graph state, transition choice, server nodes, retries, receipts, reconciliation,
expiry, and idempotency. This branch never uses `bos_resume_operation`, creates
an idempotency or retry key, carries business data through `complete`, executes
an underlying server operation while `in_progress`, or constructs a lifecycle
route. For reconnection recovery, invoke the sole exact returned `state` action
and resume from its authoritative response.

## Workflow

1. Preserve the user's objective and requested outcome. Use `bos-mcp-client` to
   resolve and call `bos_get_context`, then validate its exact scoped grant.
2. Use current live tool and resource discovery on the BOS
   connection to identify the minimum services needed for the objective. Classify
   each dependency as ready, disabled, disconnected, awaiting authorization,
   unavailable, or outside the selected scope.
3. For an ordinary non-journey workflow, build a deterministic execution map containing the owning product, semantic
   operation, prerequisites, approval point, expected evidence, and recovery
   identity for every step. Preserve the Router-to-PO-to-GO boundary for every
   mutation.
4. Resolve platform prerequisites through current live-declared BOS operations.
5. Obtain explicit user approval immediately before any setting, enablement, or
   connection mutation that was inferred or proposed. An unambiguous user
   instruction naming the exact target and value supplies approval for that
   bounded action. Apply the mutation-safety contract from `bos-mcp-client`.
6. Refresh context and live discovery after a platform state change. Resolve
   each domain step through live BOS discovery, then invoke the exact advertised
   deterministic HTTPS method and path using the current schema and the
   connection's host-managed authorization. Treat MCP discovery as capability evidence and the API result as
   execution evidence.
7. For an ordinary non-journey operation, when authorization or configuration interrupts execution, preserve the
   server-issued continuation state. After the dependency becomes ready, call
   `bos_resume_operation` with the original operation identity and stable
   idempotency key. Reconcile an uncertain mutation before any retry.
8. Return an evidence-backed result that separates completed steps, pending
   steps, approvals, source observations, failures, and next actions. Claim
   completion only from structured operation success.

## Failure behavior

Stop the affected path when organization context, ownership, scope, current
schema, or authorization is missing or ambiguous. Preserve independently
completed work and the pending objective. A domain request whose owning product
is unavailable returns the exact readiness state and required product action.
An authorization denial remains terminal for that authority and never permits
route switching.

Keep credentials, tokens, raw authority identifiers, provider payloads, and
customer records out of plans, continuation envelopes, logs, and summaries.
