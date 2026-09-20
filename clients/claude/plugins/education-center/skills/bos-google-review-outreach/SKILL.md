---
name: bos-google-review-outreach
description: Prepare, approve, send, and report Google Business Profile review requests to documented-consent families with an existing Education Center service relationship through tenant-scoped BOS MCP workflows. Use for eligible Calimatic class and camp families, Google review links, Drive templates, bounded follow-up, completion tracking, reviewer and rating enrichment, and dependency diagnosis.
---




## Product initialization preflight

Before performing this skill's workflow, preserve the pending request and
complete the product's host-managed BOS authentication. Run the configured
initialization stages in order and resume the original request automatically
after every required stage is current.

First validate the customer-owned `config/customer-settings.json` against
`config/customer-settings.template.json`. Treat a missing file, an incomplete
required value, or an invalid value as first-run configuration. Also migrate a
missing/invalid `default_context` or missing/invalid shared BOS customer
preference store. Restore a confirmed valid mirror without asking again;
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

# BOS Google Review Outreach

Use `bos-mcp-client` for context and live tool discovery. Use only authenticated
BOS platform MCP operations. On the BOS connection, omit
`org_id`, `app_code`, `installed_app_id`, and `delegated_role_id`; BOS derives
them from the authenticated installation.
Use `bos-visual-output` for campaign, cohort, rating, and completion reporting.

The host-managed BOS OAuth grant authenticates the user. BOS derives and
revalidates organization, app, installation, role, plugin, capability,
operation, and provider scope. The Automated Outreach workflow owns no separate
credential and bypasses no authentication. Each selected service resolves its
own automated credential from the authorized installed-app scope.

## Eligibility and permission boundary

Use this workflow only for the authenticated tenant's existing families after a
class, camp, or other Education Center service. Every recipient must have
documented permission evidence compatible with the review request and selected
communication channel, plus server-returned evidence of that service
relationship. Enrollment, attendance, source membership, prior correspondence,
possession of an email address or phone number, or a public record does not
establish consent.

Exclude recipients whose permission is missing, ambiguous, withdrawn, expired,
or incompatible with the request. Never accept or import arbitrary recipient
lists, or use purchased, rented, scraped, harvested, inferred, or public-data
addresses or phone numbers. Never bypass or evade opt-out, unsubscribe,
suppression, complaint, bounce, do-not-contact, wrong-recipient, frequency, or
provider controls. The default result before the server confirms an eligible
audience and the user gives any required approval is a preview with zero sends.

Read [references/capability-contract.md](references/capability-contract.md) for
tool semantics and [references/drive-html-template-workflow.md](references/drive-html-template-workflow.md)
for Drive requirements.
For customer Google Business Profile setup, API-access forms, shared Google
Cloud project questions, or provider authorization recovery, read and follow
`../bos-mcp-client/references/google-business-profile-onboarding.md` and
`bos-mcp-client` authentication recovery before running the campaign workflow.

## Run workflow

1. Resolve BOS context and confirm `education-center-automated-outreach` is enabled. When
   Google Business Profile is unconfigured, provide the standard BOS project
   information and initiate the secure BOS authorization flow defined by the
   onboarding reference.
2. Resolve explicit inclusive dates for relative requests. An omitted
   `class_type` means every Calimatic class/camp type.
3. Call `education_center_review_outreach_run` with dates, optional class type,
   and a stable `client_run_key`. The server queries Calimatic, groups one
   responsible parent per family, verifies service relationship and documented
   channel permission, applies suppression controls, creates a missing Lead
   Director lead, moves it through the governed enrollment path, pins the
   three-step Drive sequence, and creates or resumes one active family campaign.
   If the result does not establish eligibility and permission, stop with zero
   sends.
4. Present campaign counts, exclusions, and states. When approval is enabled,
   never advance `awaiting_approval` campaigns without user approval.
5. Call `education_center_review_campaign_approve` for an approved campaign.
6. Call `education_center_review_campaign_advance` only when the client judges
   the next communication due and the server reconfirms permission and
   suppression eligibility. Scheduling and timing intelligence remain
   client-side. Each call executes exactly one legal server-selected
   communication step.
7. Call `education_center_review_campaigns_list` for reporting and future scheduling.

## Fixed campaign policy

- Aim for one Google review per family for the organization/location.
- Allow one active campaign per family.
- A family with `review_campaign_status = complete` is permanently ineligible
  for later campaigns.
- A campaign contains exactly three distinct communication steps. There is no
  retry loop and no fourth message.
- The server-owned organization business profile selects the channels and
  services eligible for each step. The client uses the returned communication
  plan and never maps a channel to a provider.
- Sender, reply-to, categories, suppression behavior, tracking, templates, and
  credentials are server configuration. Never request or supply them.
- Contact availability never establishes eligibility. An eligible family must
  have at least one channel with documented compatible permission. Treat
  absence or ambiguous lead identity as a data-integrity error.
- Human approval is an Automated Outreach plugin setting and defaults on.
- Stop immediately on opt-out, unsubscribe, do-not-contact request, complaint,
  invalid address or number, wrong-recipient report, or completed review flow.

## Completion

Every message uses the campaign’s BOS confirmation URL. A GET displays the
confirmation page and performs no campaign mutation. A deliberate button POST
marks the campaign and lead complete, records completion time, stops future
outreach, and redirects to the provider-issued Google write-a-review URL.
Security scanners and link prefetchers cannot complete campaigns.

Google review rating is nullable enrichment on the lead. Completion depends on
the deliberate confirmation, because public Google reviews do not contain the
BOS token or customer email. Never map every public review to a family.

## Safety

- Never substitute a delivery service or channel for the current
  server-selected communication plan.
- Never use browser sessions, native connectors, or local code as provider
  authorization or delivery fallbacks.
- Never accept recipient lists, target states, provider credentials, Drive
  folders, template filenames, or Google locations as authority from the
  client. The server validates configured values and chooses legal transitions.
- Never override permission, suppression, opt-out, unsubscribe, complaint,
  bounce, do-not-contact, wrong-recipient, frequency, or provider controls.
- Treat provider acceptance as `accepted`; report `delivered` only from the
  authenticated delivery evidence returned by BOS.
- Keep contact details out of summaries unless the user requests the recipient
  list.
- Use neutral review language without incentives, rating conditioning, or
  sentiment-based selection.

## Output

Lead with the organization, service period, family count, campaign states,
approval needs, channel results, completed count, and next client action.
Report exact dependency/configuration blockers without substituting another
provider.
