---
name: bos-google-review-outreach
description: Run and report Education Center Google Business Profile review outreach through tenant-scoped BOS MCP workflows. Use for Calimatic class/camp cohorts, recent review campaigns, approval, three-step SendGrid outreach, optional Twilio SMS, Google review links, Drive HTML templates, campaign advancement, completion tracking, reviewer/rating enrichment, and dependency diagnosis.
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

After client settings are current, validate the server plugin-settings
initialization epoch, required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, or the server schema changed.
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

# BOS Google Review Outreach

Use `bos-mcp-client` for context and live tool discovery. Use only authenticated
BOS MCP operations. On the BOS connection, omit
`org_id`, `app_code`, `installed_app_id`, and `delegated_role_id`; BOS derives
them from the authenticated installation.
Use `bos-visual-output` for campaign, cohort, rating, and completion reporting.

The BOS MCP key authenticates the agent installation and bounds organization,
app, role, plugin, and capability access. The Automated Outreach workflow owns
no separate credential and bypasses no authentication. Calimatic, Drive,
SendGrid, Twilio, and Google Business Profile resolve their own automated
credentials from the authorized installed-app scope.

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
3. Call `education_center_review_outreach_run` with dates, optional class type, and a
   stable `client_run_key`. The server queries Calimatic, groups one responsible
   parent/family, creates a missing Lead Director lead, moves it through the
   governed enrollment path, pins the three-step Drive sequence, and creates or
   resumes one active family campaign.
4. Present campaign counts and states. When approval is enabled, never advance
   `awaiting_approval` campaigns without user approval.
5. Call `education_center_review_campaign_approve` for an approved campaign.
6. Call `education_center_review_campaign_advance` only when the client judges the next
   communication due. Scheduling and timing intelligence remain client-side.
   Each call executes exactly one legal server-selected communication step.
7. Call `education_center_review_campaigns_list` for reporting and future scheduling.

## Fixed campaign policy

- Aim for one Google review per family for the organization/location.
- Allow one active campaign per family.
- A family with `review_campaign_status = complete` is permanently ineligible
  for later campaigns.
- A campaign contains exactly three distinct communication steps. There is no
  retry loop and no fourth message.
- Each step sends SendGrid email. It also sends Twilio SMS when the Twilio
  plugin is enabled and healthy.
- SendGrid sender, reply-to, categories, suppression behavior, tracking, and
  credentials are server configuration. Never request or supply them.
- Every enrolled family must have email or phone. Treat absence or ambiguous
  lead identity as a data-integrity error.
- Human approval is an Automated Outreach plugin setting and defaults on.

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

- Never use Gmail for delivery.
- Never use browser sessions, native connectors, or local code as provider
  authorization or data fallbacks.
- Never accept recipient lists, target states, provider credentials, Drive
  folders, template filenames, or Google locations as authority from the
  client. The server validates configured values and chooses legal transitions.
- Treat SendGrid acceptance as `accepted`; use authenticated SendGrid events
  for `delivered`.
- Keep contact details out of summaries unless the user requests the recipient
  list.
- Use neutral review language without incentives, rating conditioning, or
  sentiment-based selection.

## Output

Lead with the organization, service period, family count, campaign states,
approval needs, channel results, completed count, and next client action.
Report exact dependency/configuration blockers without substituting another
provider.
