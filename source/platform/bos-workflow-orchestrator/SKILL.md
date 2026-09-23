---
name: bos-workflow-orchestrator
description: Explain, design, or operate governed deterministic workflows across the user's installed BOS service mesh. Use when the user asks to explain an organization's automation plugin or workflow, inspect a described plugin journey, create or run a custom multi-step journey, resolve dependencies, plan approvals and recovery, or verify completion.
---

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

## Described plugin journey explanations

When the user asks to explain an organization's automation plugin, explain the
workflow advertised by that installed plugin. Start with fresh `app.describe`,
then call `plugins.list` and copy the selected plugin's exact
`service.describe` input. Select the plugin from its current name, purpose, and
compact journey. Treat provider readiness as separate from the workflow's
described behavior.

Build the explain plan from the detailed Describe response. Cover the plugin's
purpose and entry trigger, the customer's progression through the automation,
human touchpoints, automated steps, connected services, typed inputs and
outputs, node ownership, effects, approvals, success outcomes, final failure
outcomes, and bounded recovery. Domain skills may contribute terminology,
goals, constraints, and presentation; BOS Operations Center owns the complete
plan and composition.

Lead with an actual Mermaid flowchart of the automation workflow from the
plugin's perspective. Group technical steps into the meaningful interfaces a
customer or staff member experiences, such as inbound lead capture, email or
phone contact, calendar scheduling, approval, and outcomes, only when current
Describe evidence names those interfaces or services. Preserve exact described
steps and ownership in concise labels or supporting detail. Follow the visual
with the explain plan in plain language.

An application record lifecycle graph is separate evidence. Do not substitute
the Lead Director state graph, shortest path, current record position, plugin
health summary, or campaign-status report for the described automation
workflow. Include record-state effects only as supporting steps when the
selected plugin's Describe contract declares them.

An explanation is read-only. Do not author, register, start, or advance BOSL
when the user only asks to explain the installed workflow. If the required
plugin Describe contract is unavailable, identify that exact missing discovery
dependency and do not invent a workflow from generic CRM behavior.

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
the discovered registration operation. For identity-v2 deterministic HTTP,
the BOS adapter attaches the current fresh opaque handle under the discovered
`X-BOS-Context-Handle` header without changing the raw document. The explain
plan remains client-side.

After registration, follow only complete actions returned by BOS. The
customer-defined text `identity` is the sole public locator. The service owns
graph state, transition choice, server nodes, retries, receipts, reconciliation,
expiry, and idempotency. This branch never uses `bos_resume_operation`, creates
an idempotency or retry key, carries business data through `complete`, executes
an underlying server operation while `in_progress`, or constructs a lifecycle
route. Invoke every identity-v2 `start`, `complete`, `step`, `failed`, and
`state` action through the packaged context-binding adapter with the current
fresh opaque handle; keep the handle out of action payloads and dependent
products. Legacy/v1 returned actions stay header-free. For reconnection
recovery, invoke the sole exact returned `state` action and resume from its
authoritative response.

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
   connection's host-managed authorization. For identity-v2 HTTP execution,
   copy the advertised `X-BOS-Context-Handle` header name and attach the current
   opaque selected handle; add no client execution state. Treat MCP discovery as capability evidence and the API result as
   execution evidence.
7. For an ordinary non-journey operation, when authorization or configuration interrupts execution, preserve the
   server-issued continuation action. After the dependency becomes ready,
   refresh discovery and follow the exact returned action for the original
   semantic request. Supply no client operation identity, idempotency key,
   retry counter, or reconciliation decision.
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
