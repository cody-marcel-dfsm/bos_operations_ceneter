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

BOS owns platform context, installed-product discovery, service readiness,
plugin settings, enablement, connection initiation, continuation, and governance
through the BOS platform MCP. A dependent product owns its domain skills and
application operations through that owning product's MCP. Use the BOS MCP for
platform operations and the owning product's MCP for application execution.

Keep all routing application-neutral. Select applications, plugins, services,
and operations only from the current authenticated context and live discovery.
Pass only opaque server-issued selectors. Every call remains subject to
request-time server authorization.

## Workflow

1. Preserve the user's objective and requested outcome. Use `bos-mcp-client` to
   resolve and call `bos_get_context`, then select exactly one authorized
   organization and effective role.
2. Use `bos_list_plugin_services` and `bos-app-discovery` to identify the
   minimum installed products and services needed for the objective. Classify
   each dependency as ready, disabled, disconnected, awaiting authorization,
   unavailable, or outside the selected scope.
3. Build a deterministic execution map containing the owning product, semantic
   operation, prerequisites, approval point, expected evidence, and recovery
   identity for every step. Preserve the Router-to-PO-to-GO boundary for every
   mutation.
4. Resolve platform prerequisites through the narrowest supported BOS action:
   - inspect typed configuration with `bos_get_plugin_settings`;
   - prepare and apply an exact setting change through
     `bos_prepare_plugin_settings` and `bos_apply_plugin_settings`;
   - enable or disable one selected plugin through `bos_set_plugin_enabled`;
   - start one server-returned service connection through
     `bos_begin_plugin_service_connection`.
5. Obtain explicit user approval immediately before any setting, enablement, or
   connection mutation that was inferred or proposed. An unambiguous user
   instruction naming the exact target and value supplies approval for that
   bounded action. Apply the mutation-safety contract from `bos-mcp-client`.
6. Refresh context and live discovery after a platform state change. Invoke
   each domain step through its owning product MCP using the current advertised
   schema and opaque context. Treat tool discovery as capability evidence and
   the operation result as execution evidence.
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

