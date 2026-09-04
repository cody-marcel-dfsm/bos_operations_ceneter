---
name: collision-repair-proposal-builder
description: Build and revise collision-repair automation offers, scripts, onboarding questionnaires, proposals, contract-style scope, payment sections, PDFs, and prospect demo sites using the active tenant's verified offer and systems.
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

# Collision Repair Proposal Builder

Use collision-specific language and the current canonical campaign source.
Never package a tenant's price, guarantee, payment link, branding, phone number,
domain, prospect identity, or local path as a default.

## Workflow

1. Identify the artifact and load the active campaign offer and plugin settings.
2. Verify the promise, qualification rules, pricing, guarantee remedy, package
   scope, implementation timeline, client duties, exclusions, and payment link.
3. Use collision-domain concepts: missed calls, estimate requests, tow-ins,
   damaged vehicles, photo review, inspections, repair appointments, vehicle
   drop-off, front-desk load, and booked repair opportunities.
4. Structure proposals in decision order: offer, guarantee, supporting math,
   assumptions, options, scope, client responsibilities, timeline, exclusions,
   payment, protective terms, and next step.
5. Treat live demos as one deliverable spanning prospect identity, public facts,
   branding, page, voice agent, phone routing, lead intake, CRM destination,
   DNS, and live validation. Reuse no inherited external identifier without
   authenticated verification.
6. For PDFs, generate, render, inspect, and iterate. For contract-risk review,
   use `corporate-counsel` and state that the result requires business and legal
   review.

Use only a payment link whose product and recurring price match the verified
offer. Keep internal sales analysis outside customer-facing proposals unless
the user explicitly approves it.
