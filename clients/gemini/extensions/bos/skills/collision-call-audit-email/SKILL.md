---
name: collision-call-audit-email
description: Turn collision-repair prospect calls, transcripts, CRM evidence, public research, and audit artifacts into evidence-controlled profiles and personalized follow-up email drafts.
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

# Collision Call Audit Email

Build a traceable chain from conversation to profile, audit, offer, email, and
measured next action.

## Workflow

1. Resolve the prospect and preserve CRM, transcript, and public-shop evidence
   separately. Label inferred, conflicting, or unverified fields.
2. Extract an evidence ledger containing facts, pains, desired outcomes,
   objections, systems, metrics, commitments, prices actually quoted, and open
   questions. Preserve a source pointer for every consequential claim.
3. Keep leads, opportunities, booked repairs, completed repairs, and paid work
   as distinct funnel stages. Normalize every calculation to a stated period.
4. Reconcile each proposed claim against the call, audit, and the active
   canonical offer. Block unsupported prices, outcomes, timelines,
   integrations, guarantees, or payment links.
5. When an audit is promised, verify the exact attachment before referring to
   it. Summarize no more than three findings tied to the conversation.
6. Draft one canonical `email.html` plus a matching plain-text version. Use one
   primary CTA, concise paragraphs, email-safe HTML, inline CSS, accessible
   links, and the tenant's approved sender and branding.
7. Validate recipient, subject, attachment, CTA, price, guarantee, unsubscribe,
   sender identity, and mobile rendering. Send only after explicit approval of
   the final recipient and content through the owning mailbox route.

Store internal evidence, claims, tracking, and readiness separately from the
customer email. Checkout clicks indicate intent; only verified payment events
prove purchase. Never send during design or template refinement.
