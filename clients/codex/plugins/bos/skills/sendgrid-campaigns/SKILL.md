---
name: sendgrid-campaigns
description: Prepare, validate, send, and reconcile permission-based, tenant-scoped SendGrid campaigns using deterministic tooling, suppression hygiene, tracking verification, and durable result artifacts.
---



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

# SendGrid Campaigns

Treat tenant, provider credential, sender, reply-to, physical address,
suppression group, category, audience, template, CTA domain, and artifacts as
one execution boundary.

Use only organization-owned audiences where every external recipient has
documented marketing permission for the campaign's sender, purpose, and
content. Never use purchased, rented, scraped, harvested, or inferred addresses.
Source membership or prior correspondence alone does not establish consent.
Never bypass or evade unsubscribe, suppression, complaint, bounce,
do-not-email, frequency, or provider controls. Exclude any recipient whose
permission is missing, ambiguous, withdrawn, or incompatible with the campaign.

## Workflow

1. Resolve the campaign through `marketing-analysis` and verify the owning BOS
   context and SendGrid provider readiness.
2. Inspect the HTML for hosted HTTPS images, valid CTA URLs, UTMs, unsubscribe
   behavior, sender identity, address, and mobile-safe rendering.
3. Validate the recipient source for email shape, duplicates, bounces,
   suppression status, unsubscribe evidence, and tenant ownership.
4. Use a reviewed deterministic send entrypoint for dry run, test, and list
   sends. Require a category, tracking configuration, attribution arguments,
   recipient mode, and result path in the prepared payload.
5. Send a test through the same entrypoint. Record acceptance, message ID,
   recipient, subject, category, template identity, and timestamp without
   exposing credentials or full lists.
6. Require explicit authorization before a list send. Save the result CSV and
   summary under the campaign's established `send_results/` directory.
7. For metrics, query current SendGrid activity, exclude test/internal activity
   and scanner clicks, and keep clicks distinct from bookings or purchases.

Stop on any tenant mismatch, missing suppression check, broken link, local
image, missing category, unverified sender, or unavailable deterministic send
path. Never substitute another ESP or account. A calendar-link click is a CTA
click; a booking requires Calendar, confirmation, or booking-system evidence.
