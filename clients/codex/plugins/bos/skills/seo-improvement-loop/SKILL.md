---
name: seo-improvement-loop
description: Run recurring tenant-scoped SEO and Google Business Profile review measurement, diagnosis, proposal, reconciliation, and exit decisions through BOS MCP evidence.
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

# SEO Improvement Loop

Use BOS for configured sites, provider health, Search Console, SERP, page,
conversion, reputation, and proposal evidence. Operate in
`observe_and_propose` mode unless the user authorizes a separate mutation
workflow and its `tools/call` result confirms server authorization. A
live-discovered tool descriptor is never an authority grant; use the dynamic
domain-specific MCP service and tool surface, then treat `tools/call` as
authoritative.

## Workflow

1. Resolve BOS context, plugin settings, site timezone, and the latest validated
   report for the same server-issued scope and site.
2. Read [references/mcp-tool-map.md](references/mcp-tool-map.md), then execute
   every useful available operation. Record executed, skipped, unavailable,
   and failed operations separately.
3. Keep Search Console, SERP, public-page, conversion, and reputation evidence
   source-specific. Label missing, delayed, modeled, and partial data.
4. Paginate reputation reviews through the trailing 26-week window. Deduplicate
   by provider review ID and calculate 7-, 30-, 90-day, last-complete-week, and
   weekly counts from provider timestamps in the configured timezone.
5. Reconcile active proposals, cooldowns, evaluation windows, protected
   winners, and page/query conflicts. Apply the detectors in
   [references/action-playbook.md](references/action-playbook.md).
6. Choose one proposal, `HOLD_AND_OBSERVE`, or a partial result. Require human
   review for every proposal and include exact changes, evidence, expected
   effect, risk, validation, and evaluation date.
7. Write only beneath the configured report root, validate against
   [references/report-contract.md](references/report-contract.md), and publish
   atomically with `scripts/validate_report.py`.

Lead the report with Google review performance and a 26-week chart, followed by
review analysis, operation status, evidence, decision, completeness, and next
action. Never infer zero from missing review rows or claim that BOS implemented
an externally observed page change.
