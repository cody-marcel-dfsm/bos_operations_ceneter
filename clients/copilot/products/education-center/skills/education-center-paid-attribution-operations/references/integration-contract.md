# Paid Attribution Integration Contract

## Source responsibilities

| Source | Evidence | Allowed conclusion |
|---|---|---|
| BOS Gmail | Original form and booking notifications, message/thread IDs, timestamps, hidden fields | Lead notification and candidate GCLID |
| BOS Calendar | Live appointment/trial event, time, attendee, event version | Scheduled trial or appointment |
| BOS Lead Director | Canonical lead identity, status, source, version | Lead pipeline state |
| BOS Calimatic | Student/family match and enrollment records | Verified registration or enrollment |
| BOS Google Ads | Campaign state, conversion actions, upload/mutation results | Ads performance and provider update state |

Search Gmail for a bounded date range using these known selected Education Center organization patterns:

- `subject:"Book a Free Trial Class"`
- `subject:"New submission from Contact Us"`
- `subject:"just booked an appointment"`
- `"Appointment Details:"`
- `"Hidden Field"`

The Website Conversions label is a search hint, not a completeness boundary.

## GCLID screening

A candidate must be 40 or more characters, contain only ASCII letters, digits,
underscore, or hyphen, and resemble a Google click ID. The reviewed local
prototype accepts the common prefixes `EAIa`, `Cj0`, and `Cjw`. Format screening
reduces parser errors; it does not prove that Google Ads will accept the ID.

Prefer the named Gravity Forms `Hidden Field`. For appointment notifications,
scan the original normalized body. Reject email addresses, domains, shortened
fragments, and values appearing only in forwarded/replied content.

## Logical-lead reconciliation

Use stable provider IDs when available. Otherwise relate messages with:

1. normalized email plus appointment timestamp;
2. normalized phone plus appointment timestamp;
3. Lead Director external ID;
4. Calendar external event ID.

Classifications:

- `ready`: original lead evidence contains a valid GCLID and the outcome is verified.
- `covered`: a sibling message for the same booking already supplies the GCLID.
- `missing_gclid`: a real lead/outcome exists and no related original message supplies a valid GCLID.
- `already_recorded`: the same conversion-action/GCLID/time dedupe key already succeeded.
- `conflict`: source identities, times, or statuses disagree materially.
- `not_ads_attributable`: evidence supports the business outcome but no valid ad-click identifier exists.

## Current reviewed project behavior

The local project at `an optional local marketing-analysis workspace`
contains a working reference implementation in `upload_conversions.py`,
`app/routes/conversions.py`, and `tools/connectors/google_ads_connector.py`.
It searches Gmail, parses Gravity Forms and appointment emails, validates
GCLIDs, records captured/missing/uploaded states in SQLite, supports dry runs,
creates or locates upload-click conversion actions, and submits partial-failure
Google Ads batches.

Use that code as behavioral evidence and a migration reference. BOS remains the
integration boundary for skill execution. The project also contains direct
campaign pause mutations; those require a separate target/change preview and
must never be implied by a conversion-upload request.

## Capability reporting

selected Education Center organization has successfully executed the BOS
`education_center_create_offline_ad_conversions` mutation. Treat that provider-confirmed
execution as evidence that the workflow is implemented. Recheck live context
and tool discovery every task because installed plugins and capabilities can
change.

The canonical capability is
`education-center-offline-ad-conversions.conversions.create`. The legacy capability
`education-center-offline-ad-conversions.action.sync` may appear during a rolling
deployment and must resolve to the same dependency-health check.

If BOS reports the source as `unsupported` while declaring either capability,
or omits the tool after a successful prior execution, classify the result as a
capability-resolution/tool-discovery regression. Do not classify the workflow
as unimplemented. Preserve the prior provider result and report the exact
current manifest mismatch.

Minimum useful Google Ads capabilities are:

- campaign and conversion-action read;
- click-conversion create/upload with partial-failure details;
- conversion upload/status read;
- campaign, ad-group, keyword, and budget update when campaign optimization is desired.

When absent, prepare the exact upload or mutation payload and report the gap.
Do not claim that Google Ads was updated.

## Education Center offline conversion MCP action

When the live `bos_education_center` manifest publishes
`education_center_create_offline_ad_conversions`, prefer it for the complete bounded
Gmail-to-Google-Ads workflow. The client instruction can be:

> Sync Education Center offline ad conversions from 2026-07-01 through 2026-07-21.

Use the canonical BOS Create envelope. Pass the exact BOS `org_id`, `app_code`,
`installed_app_id`, and `delegated_role_id`; set `source_type` to `google_ads`,
`source_identity` to `offline_conversions`, and provide a stable
`idempotency_key`. Put ISO `start_date`, ISO `end_date`, optional `dry_run`,
and optional `max_results` inside `changes`. Never pass Gmail credentials,
Google OAuth tokens, Google Ads customer IDs, developer tokens, or
conversion-action resources; the server resolves those from the installed
`gmail` and `google-ads` dependencies.

Use `dry_run: true` for a preview. A call with `dry_run: false` is an external
Google Ads mutation and requires the user's request or approval for that exact
date range. Report masked GCLIDs and preserve the returned partial-failure
states.
