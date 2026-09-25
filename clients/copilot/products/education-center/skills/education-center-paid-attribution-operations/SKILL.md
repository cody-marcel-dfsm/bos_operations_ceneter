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
required value, or an invalid value as first-run configuration. Also migrate a
missing/invalid `default_context` or missing/invalid product-specific BOS
customer preference store. Restore a confirmed valid mirror for this plugin without asking again;
confirm a new default once through the consolidated setup. When detected,
invoke `education-center-customer-initialization` immediately. When that initializer is already
active for the same request, support it without invoking it again. Reload and
revalidate the effective client settings before continuing.

For live `bos-identity-mcp/v2`, discover the requested operation first. Missing
optional plugin-profile setup tools do not block an independently advertised
ready operation with no declared dependency on that setup. Keep that profile
setup incomplete, preserve operation-specific readiness requirements and
denials, and continue the requested operation without initializer recursion.
Otherwise, after client settings are current, validate the scoped grant's live
plugin-service inventory, organization business profile initialization epoch,
required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, the server schema changed,
or the active request exposes a service-routing mismatch. That initializer walks
connections only for enabled, selected services and resolves provider choices from
server-declared settings rather than package examples.
Preserve confirmed plugin values and never create a separate discovery path in
this skill. Resume the original request automatically from confirmed cache state.

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

# Education Center Paid Attribution Operations

## Tenant terminology

Load effective customer settings and resolve the brand through
`education-center-service-routing`. Use `brand_display_name`, or the active
skill extension's `terminology.brand_display_name` override, wherever
customer-facing output names the franchise or brand. Keep technical product,
skill, route, server, environment-variable, tool, capability, authorization,
and record identifiers unchanged.

Use the authenticated BOS platform connection and follow `bos-mcp-client` for every
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
   `bos_get_context` once through the BOS platform connection.
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
   mutation, send only its semantic business inputs, and verify afterward.
   Supply no client request identity, idempotency key, attempt identity, retry
   counter, reconciliation state, or provider version field. Treat the call
   result as authoritative for capability and provider access.
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
