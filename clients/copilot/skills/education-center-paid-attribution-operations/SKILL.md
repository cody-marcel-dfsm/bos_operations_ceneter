---
name: education-center-paid-attribution-operations
description: Reconcile Education Center organization paid leads and outcomes across tenant-scoped BOS Gmail, Google Calendar, Lead Director, Calimatic, and Google Ads. Use for GCLID discovery in lead emails, missing-GCLID audits, paid-lead attribution, trial or enrollment matching, offline conversion preparation or upload, Google Ads conversion updates, and diagnosing missing BOS Google Ads capabilities.
---


## Product first-run preflight

Before performing this skill's workflow, resolve the installed product root and
validate its customer-owned `config/customer-settings.json` against
`config/customer-settings.template.json`. Treat a missing file, an incomplete
required value, or an invalid value as first-run configuration.

When first-run configuration is detected, invoke `education-center-customer-initialization`
immediately. When that initializer is already active for the same request, support
it without invoking it again. Preserve the user's original request while
initialization runs.
Complete the product's host-managed BOS authentication before asking any settings
question. If direct sign-in is required, ask only for that action and resume
initialization automatically afterward. Do not perform the original workflow or
substitute generic customer values while configuration remains unresolved. After
the user accepts the consolidated recommendation and the initializer writes and
revalidates `config/customer-settings.json`, reload the effective settings and
resume the original request automatically.

# Education Center Paid Attribution Operations

## Tenant terminology

Load effective customer settings and resolve the brand through
`education-center-service-routing`. Use `brand_display_name`, or the active
skill extension's `terminology.brand_display_name` override, wherever
customer-facing output names the franchise or brand. Keep technical product,
skill, route, server, environment-variable, tool, capability, authorization,
and record identifiers unchanged.

Use `bos_education_center` and follow `bos-mcp-client` for every provider call. Treat the
live BOS context and tool manifest as authoritative. Preserve the selected Education Center organization
scope exactly and keep provider evidence separate until the lead is reconciled.
Use `bos-visual-output` for source-to-outcome flows, conversion counts, missing
GCLID cohorts, and attribution trends.
When a Google or Calimatic source reports an authentication error, follow
`bos-mcp-client` authentication recovery and prompt the user to complete the
service-specific secure BOS browser flow before retrying once.

## Workflow

1. Resolve an explicit date range using `timezone` from the installed product's
   `config/customer-settings.json` and call
   `mcp__bos_education_center__bos_get_context` once.
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
9. Execute an offline conversion or Google Ads campaign update only when the
   live BOS manifest publishes the exact mutation capability and the user has
   requested or approved the exact target and payload. Re-read the target before
   mutation, use the provider's idempotency/version fields, and verify afterward.
10. When Google Ads is absent from BOS, report
    `BLOCKED: BOS Google Ads capability unavailable`, preserve the upload-ready
    preview, and identify the missing capability. Do not route around the BOS
    tenant boundary with local credentials during a BOS workflow.

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
