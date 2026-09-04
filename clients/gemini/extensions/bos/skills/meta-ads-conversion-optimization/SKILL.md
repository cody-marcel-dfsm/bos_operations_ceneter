---
name: meta-ads-conversion-optimization
description: Diagnose, optimize, and report on Meta/Facebook/Instagram paid ads that are intended to drive leads, purchases, booked calls, trials, appointments, subscriptions, or other sales conversions. Use when evaluating Meta campaign performance, ad creative, audiences, offer economics, landing-page conversion, pixel/CAPI tracking, funnel attribution, ROAS/CAC, budget scaling, retargeting, or sales follow-up from paid social traffic.
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

# Meta Ads Conversion Optimization

## Core Rule

Treat Meta Ads performance as a full conversion system: ad promise, audience, click quality, landing-page experience, tracking integrity, conversion event quality, offer economics, and sales follow-up. Do not judge a campaign only by CTR, CPC, CPM, or Meta's reported conversion count.

For detailed diagnostic rules, read `references/conversion-playbook.md` when the user asks for analysis, optimization, scaling, troubleshooting, or a campaign report.

## Workflow

1. Define the business objective and conversion event.
   - Identify the intended outcome: purchase, qualified lead, booked call, trial, estimate request, checkout initiation, subscription, or offline sale.
   - Identify the economic threshold: acceptable CAC, cost per lead, cost per booked call, ROAS, payback period, close rate, or average order value.
   - If the objective is unclear, propose the most likely objective and mark the conclusion as provisional.

2. Separate source metrics.
   - Keep Meta delivery metrics, landing-page/funnel metrics, CRM/sales outcomes, payment data, and offline conversions separate until attribution is verified.
   - Name the source, date range, timezone, campaign/ad set/ad, and conversion event for every metric.

3. Check tracking before making performance claims.
   - Confirm Meta Pixel and Conversions API event coverage, deduplication, event match quality, domain verification, Aggregated Event Measurement priority, UTM preservation, and conversion location.
   - If tracking is unverified, label Meta conversion data as directional and avoid a hard performance conclusion.

4. Diagnose the funnel in order.
   - Impression to click: creative, offer, audience, placement, fatigue, CPM, CTR, CPC.
   - Click to landing-page view: load speed, redirects, mobile experience, link quality, tracking loss, accidental clicks.
   - Landing-page view to conversion: message match, above-the-fold clarity, CTA, form friction, proof, risk reversal, calendar/payment flow.
   - Conversion to sale: lead quality, speed-to-lead, follow-up, qualification, close rate, AOV/LTV.

5. Recommend the next highest-leverage action.
   - State the action, evidence, recommendation, and expected outcome plainly.
   - Prefer one primary recommendation plus one measurement step.
   - Do not recommend scaling until tracking is credible and the conversion event has enough volume or clear economic evidence.

## Reporting Shape

Use this structure for normal chat responses:

- `Bottom line`: one direct sentence.
- `KPIs`: compact table or bullets for spend, impressions, clicks, CTR, CPC, landing page views, click-to-LPV rate, conversions, conversion rate, CPA/CAC, revenue/ROAS when available.
- `What it means`: 2-4 bullets tied to the conversion objective.
- `Recommendation`: one direct action.
- `Next action`: one concrete measurement or execution step.
- `Missing`: only sources or metrics that block a reliable conclusion.

## Decision Rules

- Strong CTR and weak conversions usually means the ad is earning curiosity while the page, offer, conversion flow, or lead quality is failing.
- Strong click-to-landing-page-view loss usually means slow load, redirects, bad mobile experience, low-intent placements, tracking loss, or accidental clicks.
- Low CTR and strong page conversion usually means the page/offer works but creative, audience, or hook needs improvement.
- Low CPC is useful only when downstream lead quality and conversion economics hold.
- Optimize for the deepest reliable event with enough signal. Use higher-funnel events only when purchase/lead volume is too low for stable delivery.
- Evaluate Meta's learning phase, attribution setting, conversion window, and event volume before declaring a campaign failed.
