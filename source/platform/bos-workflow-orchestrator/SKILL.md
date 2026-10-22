---
name: bos-workflow-orchestrator
description: Explain, compose, or operate governed deterministic workflows across the user's installed BOS service mesh, including ad hoc dynamic workflows created for the current objective. Use for multi-step or cross-service outcomes, custom journeys, requests to explain an organization's automation plugin, dependency resolution, approvals, recovery, and completion verification.
metadata:
  version: "1.0.6"
  requires: "{\"bos-mcp-client\":\"1.0.6\",\"bos-visual-output\":\"1.0.6\"}"
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
exact schemas and advertised API contracts. Preserve each operation's selected,
server-authorized application, organization, installation and role for every step.

Keep all routing application-neutral. Select applications, plugins, services,
and operations only from the current authenticated context and live discovery.
Pass only live-declared business arguments. Every call remains subject to
request-time server authorization of the identity and selected operation context.

## Described plugin journey explanations

When the user asks to explain an organization's automation plugin, explain the
workflow advertised by that installed plugin. Start with fresh `app.describe`,
then call `plugins.list` and copy the selected plugin's exact
`service.describe` input. Select the plugin from its current name, purpose, and
compact journey. For an automation-plugin explanation, select the top-level
plugin whose descriptor identifies the requested automation behavior. A
provider dependency, campaign operation, record-lifecycle graph, or similarly
named nested capability is never a substitute. If the requested plugin is
absent, report that exact discovery defect and stop the explanation path.
Treat provider readiness as separate from the workflow's described behavior.
For a validated `catalog_only` plugin, present its returned purpose, enablement,
configuration and readiness, and state that discovery publishes no workflow
graph for it. Keep the plugin visible. A separately discovered operation retains
its own execution contract and authority checks; catalog visibility supplies no
executable workflow.

Build the explain plan from the detailed Describe response. When Describe
returns `behavior`, treat its `entry`, ordered states, branch successors,
interfaces, and terminal outcomes as the primary automation workflow. This is
the authoritative explanation graph for event-driven plugins. A returned
`journey` is the composable executable plan for callable operations. Cover the
plugin's purpose and entry trigger, the customer's progression through the
automation, human touchpoints, automated steps, connected services, typed
inputs and outputs when present, node ownership, effects, approvals, success
outcomes, final failure outcomes, and bounded recovery. Domain skills may
contribute terminology, goals, constraints, and presentation; BOS Operations
Center owns the complete plan and composition.

Lead with an actual flowchart of the automation workflow from the plugin's
perspective, rendered through the installed `bos-visual-output` native renderer
selection: an advertised native inline visualization tool takes priority, and
Mermaid is allowed only with established host rendering support. Group
technical steps into the meaningful interfaces a customer or staff member
experiences, such as inbound lead capture, email or phone contact, calendar
scheduling, approval, and outcomes, only when current Describe evidence names
those interfaces or services. Preserve exact described
steps and ownership in concise labels or supporting detail. Follow the visual
with the explain plan in plain language.

For an event-driven automation behavior, begin the diagram at the described
trigger and end each branch at its described customer-facing outreach or
outcome. Render parallel automated call, text, and email branches when those
branches appear in `behavior`; do not replace them with the implementation
details of one delivery provider. Use current configuration or status only to
annotate a branch as enabled, disabled, or needing setup. Configuration never
changes the described topology.

An application record lifecycle graph is separate evidence. Do not substitute
the Lead Director state graph, shortest path, current record position, plugin
health summary, or campaign-status report for the described automation
workflow. Include record-state effects only as supporting steps when the
selected plugin's Describe contract declares them.

An explanation is read-only. Do not author, register, start, or advance BOSL
when the user only asks to explain the installed workflow. If the selected
plugin lacks both a behavior graph and a journey outside the declared
`catalog_only` presentation, identify that exact missing
Describe dependency. Do not select a different plugin to produce a plausible
graph and do not invent a workflow from generic CRM behavior.

## Agent-Driven Custom Journeys

First select a complete applicable focused workflow when one covers the
objective. Select ad hoc composition only when no complete fixed workflow
covers the objective or the user explicitly requests custom composition. In
that branch, treat an objective as an ad hoc dynamic workflow candidate when
it requires multiple dependent steps, spans skills or services, or needs
durable handoffs or recovery. The user does not need to say "BOSL", "custom
journey", or "workflow". Domain skills contribute goals,
constraints, evidence requirements, presentation, and client-owned work. Live
`service.describe.journey` and `api.contract.get` results contribute eligible
server-executable nodes. BOS Operations Center owns composition; BOS Service
owns the finite-state machine after registration.

When the user asks to create, run, resume, stop, explain, or inspect such a
multi-step journey, use the dedicated Agent-Driven Custom Journey branch. Read:

- [BOSL authoring](references/bosl-authoring.md) before planning or registering;
- [journey lifecycle](references/journey-lifecycle.md) before invoking any
  returned journey action;
- [structured client instructions](references/client-instructions.md) when BOS
  returns `awaiting_client` or `client_action_required`; and
- [the canonical walkthrough](references/canonical-walkthrough.md) only when
  the recent-meeting campaign sequence or its acceptance fixture is relevant.

Start with fresh `bos_get_context` and `bos_list_context_tools` for the selected
context, then resolve `app.describe` from that catalog. Read its exact BOSL
schema, language reference, and examples through the host resource reader when
available. For a host without resource reads, follow the existing registration
contract link and the [inline authoring path](references/bosl-authoring.md);
consume complete schemas and examples only where freshly advertised. Use
`plugins.list` and copy each required `service.describe` input exactly. Keep
accessibility and readiness separate.
Build a concise explain plan from the discovered contracts, author raw BOSL,
run the packaged local structural checks, and submit that same JSON document to
the discovered registration operation. For identity-v2 deterministic HTTP,
the BOS adapter attaches the current fresh opaque handle under the discovered
`X-BOS-Context-Handle` header without changing the raw document. The explain
plan remains client-side.

For the advertised `lead-director-journey-registration/v1`, validate registration
as `compiled: true`, `identity`, and `actions.start`; callback submissions also
return their discovered `callback_report`. Show its usage, limits and material
adjustments before invoking the explicit start. Invoke the returned signed POST `actions.start` with no caller
payload; the BOS transport frames it as exactly `{}` with JSON content type to begin
execution; registration itself runs no journey work. For compile failure, correct
the public findings before resubmitting. After start, follow only complete actions
returned by BOS. API v1 contains the complete compile, explicit start, and
lifecycle behavior; registration performs no implicit start. Consume its exact
freshly discovered `/api/v1/` route and full response schema. Capability
availability is independent of API version, and API version changes require the
human user's explicit request. The
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

For callback bootstrap, standing workflows, organization-visible definitions,
role-specific controls or callback waits, read
[callback journeys](references/callback-journeys.md). Use the freshly discovered
v1 callback source and wait contracts. The existing journey runtime owns all
server progress, event capture and originating-author authority.

When planning failure handling, retries, parked waits or irreversible steps,
read [the journey failure model](references/journey-failure-model.md). Use the
discovered lifecycle and preserve receipt-based recovery and effect approvals.

## Workflow

1. Preserve the user's objective and requested outcome. Use `bos-mcp-client` to
   resolve and call `bos_get_context`, then match and validate the requested/default context.
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

For requested callback monitoring, follow-up or continuation in Codex or Claude,
read [native callback continuation](references/native-callback-continuation.md).
Use the actual current BOS native tools with the packaged protected queue helper
and finite current-conversation scheduling or active held reads. Begin with an
authenticated scoped cursor before arming a successor. Preserve pending work and
report exact unavailable host capabilities. For an existing incremental SSE host
adapter, read [journey notifications](references/journey-notifications.md).
Refetch authoritative state before delivering hints; signed lifecycle actions
retain their existing transport and authority.
