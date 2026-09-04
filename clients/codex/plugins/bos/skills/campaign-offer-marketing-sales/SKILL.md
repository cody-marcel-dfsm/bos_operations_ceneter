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
