# MCP tool annotation audit

Status: implemented, Oracle-approved, and deployed to staging; authenticated live descriptor capture pending

Official semantics: [OpenAI MCP tool annotations](https://developers.openai.com/plugins/build/mcp-server#tool-annotations-and-elicitation) and [plugin annotation reference](https://developers.openai.com/plugins/reference#annotations)

The BOS platform tool projection exposes 50 Education Center public tools to an
authorized Education Center installation. Commit
`1e4de4e5fe0a6c1240acf018718c98231ae4397f` implements the final annotation
contract in Lead Director.

The canonical operation registry remains authoritative for `readOnlyHint`,
`idempotentHint`, and provider-derived `openWorldHint`. The Education Center
BOS subservice projection applies a public-name overlay after aliasing:

- Every public tool receives an explicit `destructiveHint` classification.
- `bos_resume_operation` explicitly receives `openWorldHint: true` because it
  can resume the original provider operation.
- `bos_submit_feedback` explicitly receives `openWorldHint: false` because it
  remains inside the authenticated BOS installation.
- Provider-backed reads, including Gmail, Calendar, Calimatic, reputation, and
  Drive text export, remain both read-only and open-world.
- `education_center_export_drive_text` is read-only, open-world, and
  non-destructive; it retrieves Drive text and does not persist a BOS file.

The destructive-impact overlay marks these public tools `true`:

- `bos_resume_operation`
- `bos_update_plugin_settings`
- `bos_update_role_capabilities`
- `education_center_create_offline_ad_conversions`
- `education_center_execute_sendgrid_campaign`
- `education_center_initiate_agent_call`
- `education_center_modify_sendgrid_audience`
- `education_center_reconcile_sendgrid_suppressions`
- `education_center_review_campaign_advance`
- `education_center_review_campaign_approve`
- `education_center_test_sendgrid_campaign`
- `education_center_transition_sendgrid_campaign`
- `education_center_update_calendar_event`
- `education_center_update_email_draft`
- `education_center_update_lead`
- `education_center_upsert_sendgrid_audience`
- `education_center_upsert_sendgrid_template`

All other Education Center public tools receive `destructiveHint: false`.

## Validation evidence

- Focused resource-group, registry, and application tests: 40 passed.
- Repository-wide backend lint: 1,311 Python files checked; passed.
- Python compilation and `git diff --check`: passed.
- Required Vault synchronization: completed.
- Oracle review: `APPROVED` with no findings.
- Git scope: exactly three Lead Director files; local commit is clean.
- Push: not performed.
- Canonical staging convergence: completed with zero seed writes and zero
  post-apply drift.
- Container image: `backend:1e4de4e5f`, digest
  `sha256:b5d5ab12bee70e71cd28e11ed112c8d883987f8bdef1d433cfb4801cd6cd7988`.
- Cloud Run revision: `lead-director-backend-staging-01628-7lk`, ready and
  serving 100 percent of traffic.
- Runtime checks: traffic routing, Gmail Pub/Sub push configuration, plugin
  credential heartbeat, and `https://dfsm.ai/health` passed; independent health
  request returned HTTP 200.

## Deployment status

The canonical backend-only workflow deployed the approved commit from a
disposable clean `main` checkout. The governed schema/seed convergence and
post-apply drift gate completed before the container build. Cloud Run revision
`lead-director-backend-staging-01628-7lk` is ready and receives 100 percent of
traffic.

The authenticated live-contract probe confirmed the route rejects the legacy
tenant-specific BOS agent credential with HTTP 401 `invalid_token`. This is the
expected OAuth boundary: the named marketplace route accepts a current
BOS-issued OAuth access token. No current OAuth access token was stored in the
authorized Secret Manager inventory, so this run did not retain an
authenticated `tools/list` descriptor snapshot.

## Remaining runtime acceptance

1. Use a current BOS-issued OAuth access token from the reviewer connection or
   portal Scan Tools session to export authenticated `tools/list`; retain
   privacy-safe evidence that all
   50 public names expose explicit boolean `readOnlyHint`, `openWorldHint`, and
   `destructiveHint` values.
2. Run Scan Tools and compare its imported skill snapshot
   with the release bundle.
