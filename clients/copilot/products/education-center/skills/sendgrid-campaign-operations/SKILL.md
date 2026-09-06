---
name: sendgrid-campaign-operations
description: Build, approve, test, send, recover, monitor, and report Education Center SendGrid campaigns through the tenant-scoped BOS MCP. Use for customer-family audiences from Calimatic, Lead Director, Gmail, Calendar, camp, enrollment, inquiry, lead, or trial evidence; prioritized overlapping cohorts; governed recipient additions; suppression reconciliation; exact UTF-8 content review; manifest refresh and same-task continuation; deterministic test/list sends; delivery-event statistics; or structured missing-capability issues.
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

# SendGrid Campaign Operations

Use `bos-mcp-client` for authenticated context, live tool discovery, manifest
refresh, same-task continuation, and provider authorization recovery. Use
`education-center-service-routing` for every configured evidence source. Use
only the installed BOS OAuth connection for runtime authority.
BOS derives organization, application, installation, role, plugin, SendGrid
binding, sender configuration, and credentials from the validated grant.

Read [references/client-workflow.md](references/client-workflow.md) for the
complete workflow and [references/capability-contract.md](references/capability-contract.md)
for required server semantics. Run `scripts/validate_campaign_workflow_trace.py`
against a sanitized trace when validating an end-to-end client execution.

## Required sequence

1. Resolve context and discover the live domain-specific tool schemas. Refresh
   discovery after OAuth reconnection, package/schema change,
   transport/session replacement, or permission, plugin, capability, provider,
   installation, or domain-service changes. Refresh context or operation status
   as well and let the next `tools/call` authorize execution. Preserve the
   sanitized campaign continuation envelope and resume automatically.
2. Build one server-owned audience from the requested configured sources and
   explicit cohort priorities. Preserve overlapping cohort tags, source
   provenance, eligibility reasons, and one normalized guardian identity.
3. Apply current unsubscribe, global suppression, bounce, complaint, invalid,
   do-not-email, and review-required state. Add named internal recipients only
   through the governed audience-update operation.
4. Display a privacy-safe audience preview with matched, unique, eligible,
   excluded, and suppression totals plus counts by source and cohort.
5. Display the exact UTF-8 subject, HTML, plain text, sender, reply-to, dates,
   contact information, category, unsubscribe configuration, tracking
   configuration, and physical address returned by the server-owned draft.
6. Require explicit approval bound to the exact content hash, audience version,
   and send action. Invalidate approval if any bound value changes.
7. Execute exactly one deterministic test send through BOS. Reconcile its
   result and require successful preparation/acceptance before the list send.
8. Execute the approved list send once with its stable idempotency key.
   Reconcile uncertain outcomes before any retry.
9. Report test and live results separately with category and reporting cutoff.
   Label HTTP 202 as `accepted`; count `delivered` only from authenticated
   delivery-event evidence.
10. When a required operation remains absent after bounded recovery, create or
    update the governed structured capability issue and report its durable ID.

## Safety

- Fail closed on missing or ambiguous context, source account, campaign,
  audience eligibility, sender configuration, approval, or authorization.
- Never accept tokens, credentials, `org_id`, `app_code`, `installed_app_id`,
  or `delegated_role_id` as client inputs. Never use legacy filesystem tokens,
  repository-specific sender scripts, direct database access, raw SendGrid
  calls, browser authority, native Gmail/Calendar connectors, or another
  BOS connection for this workflow.
- Keep recipient addresses out of logs, continuation envelopes, result
  displays, and local diagnostics unless explicitly requested. Use server-owned
  contact identities or salted/tenant-scoped hashes in diagnostic artifacts.
- Treat Gmail, enrollment, lead, inquiry, trial, and calendar records as
  audience evidence. Require server-returned marketing eligibility.
- Keep test/internal activity separate from live metrics. Exclude identified
  security-scanner activity from unique human opens and clicks.
- Count conversions only from their owning business source.

## Output

Lead with campaign, audience version, approval state, lifecycle state, category,
reporting cutoff, and next action. Show audience counts by source/cohort and
suppression reason. Report requested, suppressed, prepared, accepted, rejected,
delivered, bounced, unique human opens, unique human clicks, unsubscribes,
complaints, and conversions separately for test and live sends. Use `Blocked:`
with the structured issue ID when a required capability remains unavailable.
