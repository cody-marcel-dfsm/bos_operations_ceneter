---
name: sendgrid-campaigns
description: Prepare, validate, send, and reconcile permission-based, tenant-scoped SendGrid campaigns using deterministic tooling, suppression hygiene, tracking verification, and durable result artifacts.
---



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
