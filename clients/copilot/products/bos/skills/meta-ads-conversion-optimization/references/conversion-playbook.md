# Meta Ads Conversion Playbook

## Evidence Checklist

Capture these fields before interpreting performance:

| Area | Required evidence |
| --- | --- |
| Scope | Date range, timezone, campaign/ad set/ad names, objective, optimization event, attribution setting |
| Spend and delivery | Spend, impressions, reach, frequency, CPM, placements, budget, learning status |
| Click quality | Link clicks, landing page views, outbound clicks if available, CTR link, CTR all, CPC link, CPC all |
| Funnel | Sessions/page views, unique visitors, form starts, checkout starts, bookings, leads, purchases, revenue |
| Tracking | Pixel events, CAPI events, deduplication, event match quality, UTMs, domain verification, AEM event priority |
| Sales | Lead status, speed-to-lead, show rate, close rate, AOV, gross margin, LTV, refunds/cancellations |

## Core Metrics

- `CTR link = link clicks / impressions`
- `CPC link = spend / link clicks`
- `Click-to-LPV rate = landing page views / link clicks`
- `LPV-to-conversion rate = conversions / landing page views`
- `Click-to-conversion rate = conversions / link clicks`
- `CPA = spend / conversions`
- `CAC = spend / new customers`
- `ROAS = attributed revenue / spend`
- `Break-even CPA = gross profit per conversion * acceptable payback factor`
- `Allowable CPL = target CAC * lead-to-customer close rate`
- `Allowable booked-call cost = target CAC * booked-call-to-customer close rate`

Use the deepest verified metric available. If revenue is missing, report cost per qualified lead or booked call and state what sales data is needed.

## Benchmarks and Interpretation

Avoid universal benchmark claims. Judge performance against the campaign's own objective, offer economics, market, and prior controls.

Useful directional reads:

- High CTR, low LPV rate: fix page speed, redirects, mobile load, placement quality, and click tracking.
- High CTR, high LPV, low conversion: fix message match, CTA, proof, offer clarity, form/calendar/payment friction.
- Low CTR, low CPC, weak conversion: traffic may be cheap but low intent.
- Low CTR, high CPC, strong conversion: creative/audience reach is expensive; keep page offer, test hooks and audiences.
- Good lead volume, poor sales: tighten lead form questions, qualify earlier, improve speed-to-lead, or move optimization to qualified lead/offline conversion.
- Rising frequency with falling CTR or rising CPA: creative fatigue or audience saturation.

## Tracking Integrity

Check tracking before final recommendations:

1. Pixel fires `PageView` on all landing pages.
2. Pixel fires the intended standard or custom event at the true conversion point.
3. Conversions API sends the same event with stable `event_id` for deduplication.
4. Browser and server event counts are plausible and deduplicated.
5. UTMs persist through redirects, forms, calendars, checkouts, and thank-you pages.
6. Domain is verified and Aggregated Event Measurement prioritizes the business event.
7. Conversion event names match the campaign objective and reporting columns.
8. Offline conversions or CRM events are uploaded when sales happen outside the website.

If Meta and funnel numbers disagree, report the discrepancy and investigate:

- attribution window differences
- browser privacy loss
- redirects or cross-domain flows
- duplicate events
- missing UTMs
- page-load failure before pixel fire
- funnel platform counting all sources while Meta counts attributed source
- Meta link clicks including users who never fully load the page

## Funnel Diagnosis

### Creative and Offer

Evaluate whether the ad makes a specific promise to a specific buyer:

- Pain: missed calls, lost estimates, stalled leads, abandoned carts, no-shows, poor response time.
- Outcome: booked jobs, scheduled demos, recovered revenue, faster quote response, lower admin load.
- Proof: quantified result, credible demo, testimonial, case study, recognizable context.
- CTA: concrete next step, matched to buying stage.

For local service and B2B conversion ads, prefer concrete operational outcomes over abstract automation claims.

### Audience

Diagnose audience based on economics and signal quality:

- Broad audiences can work when the conversion event has enough high-quality volume.
- Interest stacks often create false precision; judge them by downstream CPA/CAC.
- Lookalikes need clean seed data and enough matched customers or qualified leads.
- Retargeting should segment by intent: page viewers, form starters, video viewers, engagers, abandoned checkout, CRM leads.
- Exclude recent converters, low-quality leads, employees, and irrelevant geographies when appropriate.

### Landing Page

Check these in order:

1. Above-the-fold message matches the ad's promise.
2. The visitor can understand the offer in five seconds.
3. The CTA is visible without scrolling on mobile.
4. The page asks for the smallest commitment that matches intent.
5. Proof appears before major friction.
6. Form/calendar/payment steps are short and mobile-stable.
7. Load time and redirects do not break the click-to-LPV handoff.
8. The page handles objection, price/risk, and next-step clarity.

### Sales Follow-Up

For lead and booked-call campaigns, campaign quality depends on follow-up:

- contact speed
- answer rate
- qualification
- appointment show rate
- close rate
- reason lost
- revenue and margin

Recommend CRM/offline event feedback when Meta optimizes for leads that do not become customers.

## Optimization Rules

### Budget

- Keep budget stable while testing a new conversion event or funnel fix.
- Scale only when CPA/CAC is below target with credible tracking and enough event volume.
- Increase budgets gradually unless volume, audience size, and economics justify a larger step.
- Do not read short-term daily CPA swings as signal without enough conversion volume.

### Bidding and Events

- Use sales, purchases, qualified leads, or booked calls when volume supports it.
- Use lead, initiate checkout, schedule, or high-intent page events when deeper events are too sparse.
- Avoid optimizing for low-value events that Meta can satisfy cheaply without sales quality.
- Use offline conversions or CRM qualified-lead events when website events overstate quality.

### Testing

Test one major lever at a time:

- hook or angle
- offer
- creative format
- audience
- landing page
- conversion flow
- lead qualification

Hold stable the variables that would obscure the result. Define the success metric before the test starts.

## Recommendation Patterns

Use direct recommendations:

- `Action`: what to change now.
- `Evidence`: metric or observation driving the call.
- `Recommendation`: the concrete decision.
- `Outcome`: what should improve and how it will be measured.

Examples:

- Action: fix the click-to-landing-page handoff. Evidence: landing page views are below half of link clicks. Recommendation: test page speed, redirect chain, mobile load, and UTMs before changing creative. Outcome: raise click-to-LPV rate and make conversion data trustworthy.
- Action: tighten the landing page. Evidence: CTR and CPC are strong but LPV-to-conversion is weak. Recommendation: align headline, proof, and CTA to the ad's exact promise. Outcome: increase booked-call or purchase rate from existing traffic.
- Action: improve lead quality feedback. Evidence: Meta leads are cheap but sales do not close. Recommendation: upload qualified-lead or customer events and add qualifying questions. Outcome: reduce wasted follow-up and shift delivery toward buyers.

## Reporting Guardrails

- Do not blend Meta-reported conversions with funnel, CRM, or payment conversions without saying how attribution was joined.
- Do not call a campaign profitable without revenue, margin, and attribution basis.
- Do not recommend pausing a campaign solely for low CTR if downstream CAC/ROAS is strong.
- Do not recommend scaling a campaign solely for cheap clicks if sales conversions are absent or unverified.
- State exact missing data when a reliable conclusion is blocked.
