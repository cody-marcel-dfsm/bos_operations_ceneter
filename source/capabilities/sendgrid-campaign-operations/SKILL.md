---
name: sendgrid-campaign-operations
description: Build, approve, test, send, recover, monitor, and report Education Center SendGrid campaigns through the tenant-scoped BOS MCP. Use for customer-family audiences from Calimatic, Lead Director, Gmail, Calendar, camp, enrollment, inquiry, lead, or trial evidence; prioritized overlapping cohorts; governed recipient additions; suppression reconciliation; exact UTF-8 content review; manifest refresh and same-task continuation; deterministic test/list sends; delivery-event statistics; or structured missing-capability issues.
---

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

1. Resolve context and discover current tool schemas. Refresh immediately after
   any OAuth, permission, plugin, or capability change. Preserve the sanitized
   campaign continuation envelope and resume automatically.
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
