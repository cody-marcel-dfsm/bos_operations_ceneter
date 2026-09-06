---
name: campaign-offer-marketing-sales
description: Build and revise campaign offers, qualification, funnels, VSLs, ads, hooks, applications, setter and closer scripts, GHL copy, and sales assets while preserving the active tenant's canonical offer.
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

# Campaign Offer Marketing Sales

Resolve the active campaign and canonical offer before creating any asset.
Treat tenant identity, provider configuration, sender identity, audience,
suppression state, CTA domain, and result artifacts as one execution boundary.

## Workflow

1. Identify the campaign from the request, BOS plugin settings, or authorized
   campaign records. Require an explicit goal, audience, offer, qualification
   rule, primary CTA, and success metric.
2. Preserve the canonical promise, price, terms, guarantee, mechanism, and
   eligibility unless the user explicitly asks to revise them.
3. Use language and operational pains from the active vertical. Never import
   another campaign's claims, thresholds, proof, or creative merely because it
   is available.
4. Match the asset to its funnel step. Applications should be short and
   high-signal; ads should make one credible promise; scripts should separate
   spoken language from operator notes.
5. For landing pages, apply `landing-page-copywriting`. For paid social
   conversion work, apply `meta-ads-conversion-optimization`.
6. Before a live send or external mutation, verify the exact tenant, provider,
   sender, reply-to, audience, list or tag, subject, CTA, physical address, and
   unsubscribe mechanism. Stop on any cross-tenant or readiness mismatch.

Use bright, accessible, professional creative unless the campaign source
specifies another direction. Generate exact-text artwork with deterministic
text placement after background generation. Return paste-ready assets with
field types, routing logic, and measurement identifiers when relevant.
