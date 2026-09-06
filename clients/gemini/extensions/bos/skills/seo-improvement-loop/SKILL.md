---
name: seo-improvement-loop
description: Run recurring tenant-scoped SEO and Google Business Profile review measurement, diagnosis, proposal, reconciliation, and exit decisions through BOS MCP evidence.
---



## Organization scope preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context`. Select exactly one authorized
organization in this order: an organization explicitly named in the current request;
the shared `default_organization_label` after exact normalized validation against
the returned organization labels; or the sole authorized organization. Read and
validate the saved label with
`../bos-mcp-client/scripts/client-preferences.mjs`. For tools whose live schema
requires a context selector, pass only the selected role's opaque `context_id`.
Never add organization or context arguments to an operation whose schema derives
scope from the authenticated server context.
Use this same selection for BOS installed-app discovery. Pass only the opaque app
context and API authority returned under that selection to a discovered app MCP
or deterministic HTTPS API; never reconstruct or substitute raw authority IDs.

When several organizations are available and the default is missing, stale, or
ambiguous, return `configuration_required` and resolve one default before domain
execution. An organization named for the current request overrides the selection
and does not rewrite the saved default. Never fan out across organizations unless
the user explicitly requests that bounded scope. The display-label preference selects among
current server-returned contexts and never grants authority.

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
