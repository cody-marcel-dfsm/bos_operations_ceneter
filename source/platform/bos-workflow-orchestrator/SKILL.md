---
name: bos-workflow-orchestrator
description: Turn an authorized operational objective into a governed deterministic workflow across the user's installed federated service mesh. Use for cross-service workflow readiness, platform dependency resolution, execution planning, approval routing, recovery, and evidence-backed completion through BOS.
---

# BOS Workflow Orchestrator

Turn the user's authorized operational objective into a deterministic workflow
across the installed federated agentic service mesh. Resolve platform
dependencies, preserve required approvals, and return evidence for the work
that actually completed.

## Product boundary

BOS owns platform authentication, its scoped connection, continuation, and
governance through the BOS platform MCP. A dependent product owns its domain skills and
host-managed connection to an application-scoped discovery MCP. Use the BOS MCP
for platform discovery and OS operations. Use the selected application MCP to
discover its semantic operation and exact deterministic HTTPS API contract, then
use that API for application execution.

Keep all routing application-neutral. Select applications, plugins, services,
and operations only from the current authenticated context and live discovery.
Pass only live-declared business arguments. Every call remains subject to
request-time server authorization from the connection's scoped grant.

## Workflow

1. Preserve the user's objective and requested outcome. Use `bos-mcp-client` to
   resolve and call `bos_get_context`, then validate its exact scoped grant.
2. Use current live tool and resource discovery on each installed product's
   authenticated connection to identify the minimum services needed for the objective. Classify
   each dependency as ready, disabled, disconnected, awaiting authorization,
   unavailable, or outside the selected scope.
3. Build a deterministic execution map containing the owning product, semantic
   operation, prerequisites, approval point, expected evidence, and recovery
   identity for every step. Preserve the Router-to-PO-to-GO boundary for every
   mutation.
4. Resolve platform prerequisites through current live-declared BOS operations.
5. Obtain explicit user approval immediately before any setting, enablement, or
   connection mutation that was inferred or proposed. An unambiguous user
   instruction naming the exact target and value supplies approval for that
   bounded action. Apply the mutation-safety contract from `bos-mcp-client`.
6. Refresh context and live discovery after a platform state change. Resolve
   each domain step through its application MCP, then invoke the exact advertised
   deterministic HTTPS method and path using the current schema and the
   connection's host-managed authorization. Treat MCP discovery as capability evidence and the API result as
   execution evidence.
7. When authorization or configuration interrupts execution, preserve the
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
