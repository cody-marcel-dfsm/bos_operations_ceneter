---
name: education-center-paid-attribution-operations
description: Reconcile Education Center organization paid leads and outcomes across tenant-scoped BOS Gmail, Google Calendar, Lead Director, Calimatic, and Google Ads. Use for GCLID discovery in lead emails, missing-GCLID audits, paid-lead attribution, trial or enrollment matching, offline conversion preparation or upload, Google Ads conversion updates, and diagnosing missing BOS Google Ads capabilities.
---




## Product initialization preflight

Before performing this skill's workflow, preserve the pending request and
complete the product's host-managed BOS authentication. Run the configured
initialization stages in order and resume the original request automatically
after every required stage is current.

First validate the customer-owned `config/customer-settings.json` against
`config/customer-settings.template.json`. Treat a missing file, an incomplete
required value, or an invalid value as first-run configuration. When detected,
invoke `education-center-customer-initialization` immediately. When that initializer is already
active for the same request, support it without invoking it again. Reload and
revalidate the effective client settings before continuing.

After client settings are current, validate the selected organization's live
plugin-service inventory, organization business profile initialization epoch,
required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, the server schema changed,
or the active request exposes a service-routing mismatch. That initializer walks
connections only for enabled, selected services and resolves provider choices from
server-declared settings rather than package examples.
Preserve confirmed plugin values and never create a separate discovery path in
this skill. Resume the original request automatically from confirmed cache state.

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

# Education Center Paid Attribution Operations

## Tenant terminology

Load effective customer settings and resolve the brand through
`education-center-service-routing`. Use `brand_display_name`, or the active
skill extension's `terminology.brand_display_name` override, wherever
customer-facing output names the franchise or brand. Keep technical product,
skill, route, server, environment-variable, tool, capability, authorization,
and record identifiers unchanged.

Use the authenticated BOS connection and follow `bos-mcp-client` for every
provider call. Treat the live BOS context and operation result as authoritative
for access, and live discovery as the current domain-specific service and schema
surface.
Preserve the selected Education Center organization scope exactly and keep
provider evidence separate until the lead is reconciled.
Use `bos-visual-output` for source-to-outcome flows, conversion counts, missing
GCLID cohorts, and attribution trends.
When a Google or Calimatic source reports an authentication error, follow
`bos-mcp-client` request interception: activate the server-returned secure
browser handoff, poll readiness, and resume the pending operation once.

## Workflow

1. Resolve an explicit date range using `timezone` from the installed product's
   `config/customer-settings.json` and call
   `bos_get_context` once through the BOS connection.
2. Confirm the live capabilities needed for Gmail, Calendar, Lead Director,
   Calimatic, and Google Ads. Read
   [references/integration-contract.md](references/integration-contract.md).
3. Search BOS Gmail for the lead-notification patterns in the integration
   contract. Fetch the full thread or message when the search result omits the
   body or hidden fields.
4. Extract only valid GCLIDs. Ignore GCLIDs copied into forwarded or replied
   messages unless the original provider notification is present and its
   timestamp and lead identity are intact. Use
   `scripts/validate_gclid.py` for deterministic format screening.
5. Build one evidence row per logical lead. Match related form and appointment
   notifications using normalized email plus appointment time, or phone plus
   appointment time. Preserve every source message ID.
6. Search Calendar for trial/appointment evidence and Lead Director for lead
   status. Search Calimatic only when enrollment or paid-registration evidence
   is required. Never infer an enrollment from a Gmail notification or Calendar
   event alone.
7. Classify each lead as `ready`, `covered`, `missing_gclid`, `already_recorded`,
   `conflict`, or `not_ads_attributable` using the integration contract.
8. Produce a preview with counts, proposed conversion action, conversion time,
   value, currency, dedupe key, and source evidence before any provider update.
9. Execute an offline conversion or Google Ads campaign update only when live
   domain-specific tool discovery contains the exact mutation schema and the user has
   requested or approved the exact target and payload. Re-read the target before
   mutation, use the provider's idempotency/version fields, and verify afterward.
   Treat the call result as authoritative for capability and provider access.
10. When the operation returns an authorization or capability denial, report
    `BLOCKED: BOS Google Ads capability unavailable`, preserve the upload-ready
    preview, and identify the server-returned missing capability or provider
    recovery. Do not route around the BOS tenant boundary with local credentials
    during a BOS workflow.

## Conversion rules

- Use the original lead/form timestamp for a lead conversion.
- Use the confirmed Calendar appointment time for a scheduled-trial conversion.
- Use verified Lead Director or Calimatic evidence for an enrollment conversion.
- Require conversion time to follow the ad click and fall inside the provider's
  accepted attribution window.
- Dedupe on provider conversion action plus GCLID plus conversion timestamp.
- Mask GCLIDs in chat; show a short prefix and suffix only.
- Keep lead, scheduled-trial, and enrollment actions distinct. Never upload the
  same business event under multiple synonymous actions.
- Treat Google Ads upload acceptance as provider receipt. Verify conversion
  status later when the provider exposes processing state.

## Campaign changes

GCLID conversion uploads and campaign optimization are separate mutation types.
For budgets, status, keywords, targeting, or ads, show the customer, campaign,
current value, proposed value, reason, and rollback before execution. Apply only
the approved changes and return provider IDs plus verification results.

## Output

Lead with the reconciled result: scanned leads, valid GCLIDs, missing GCLIDs,
covered duplicates, matched trials, verified enrollments, upload-ready events,
and provider-blocked events. Then give exceptions and one concrete next action.
Exclude full email addresses, phone numbers, GCLIDs, tokens, and raw message
bodies unless the user explicitly requires a specific record.
