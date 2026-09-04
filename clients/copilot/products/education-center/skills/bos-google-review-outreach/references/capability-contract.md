# BOS review outreach capability contract

Discover the live schemas. Expected semantic tools:

| Tool | Client inputs | Server behavior |
|---|---|---|
| `education_center_review_outreach_run` | BOS scope, dates, optional `class_type`, `client_run_key` | Query Calimatic, resolve/create/enroll leads, pin Drive manifest/templates, create/resume campaigns |
| `education_center_review_campaigns_list` | BOS scope, optional states and limit | Return latest state per campaign |
| `education_center_review_campaign_approve` | BOS scope and campaign ID | Release an awaiting-approval campaign to communication 1 |
| `education_center_review_campaign_advance` | Selected opaque context and campaign ID | Execute exactly the next legal server-selected communication step |
| `reputation_search_profiles` | BOS scope and bounded query | Return verified profile and provider-issued write-review URL |
| `reputation_search_reviews` | BOS scope and profile ID | Return recent public reviews and ratings |

All calls require the validated resource-scoped OAuth grant and current plugin
capability grant.
The server derives `run_as_role` from installed-app FSM metadata.

Google Business Profile customer onboarding uses the shared BOS Google Cloud
project described in
`../../bos-mcp-client/references/google-business-profile-onboarding.md`.
Project ID and project number are non-secret identifiers. Each organization
still authorizes its own Google account and receives a separate tenant-scoped
credential and verified provider binding.

The client never supplies sender configuration, credentials, recipients, Drive
folder, template filenames, target campaign state, Google location authority,
or provider payloads.

Campaign states:

`candidate -> identity_resolved -> eligible -> outreach_planned ->
awaiting_approval|communication_1_queued -> communication_1_sent ->
waiting_after_1 -> communication_2_due -> communication_2_sent ->
waiting_after_2 -> communication_3_due -> communication_3_sent ->
closed_no_review`

Human confirmation may transition any eligible outreach/wait/closed state to
`complete`. `complete` permanently excludes the family from future runs.

The organization business profile owns the eligible channel and service plan.
The client supplies no provider choice and never maps a channel to a service.
Provider effects use deterministic campaign/step/channel identities. Repeating
an accepted effect never resends it.
