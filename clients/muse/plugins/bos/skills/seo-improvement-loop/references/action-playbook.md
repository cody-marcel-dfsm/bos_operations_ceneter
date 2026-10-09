# SEO action playbook

## Eligibility gates

Exclude a candidate when evidence is unavailable, the target is outside configured scope, another proposal for the page/query cluster is active, the cool-down is open, the page is a protected winner, or the proposed factual claim lacks evidence.

Use complete Search Console dates. Preserve page, query, country, device, search type, locale, and measurement window. Keep Search Console average position distinct from a live SERP rank.

## Detectors

| Detector | Evidence pattern | Proposal family |
|---|---|---|
| Technical defect | Wrong canonical/index directive, inappropriate sitemap URL, redirect fault, or material structured-data error | `TECHNICAL_INDEX_REPAIR` |
| High impressions, low CTR | Sufficient impressions and CTR below the configured position/device curve | `SNIPPET_ALIGNMENT` |
| Striking distance | Relevant page ranks within the configured opportunity band and serves the correct intent | `ON_PAGE_COMPETITIVE_LIFT` |
| Weak internal authority | Relevant target exists with materially weaker contextual internal links than supported competitors | `INTERNAL_LINK_BOOST` |
| Cannibalization | Multiple owned URLs receive meaningful impressions/ranks for one intent cluster | `CANNIBALIZATION_RESOLUTION` |
| Decay | Matched-window clicks, impressions, or rank deteriorate beyond configured tolerance without a known temporary cause | `CONTENT_REFRESH` |
| Unserved qualified demand | Business-relevant demand exists and no owned page adequately serves the intent | `NEW_PAGE_PROPOSAL` |

## Scoring

Compute and retain every component:

```text
opportunity_score =
  business_priority
  * eligible_impressions
  * expected_ctr_lift
  * conversion_value
  * evidence_confidence
  * freshness
  / (implementation_effort * collision_risk)
```

Use plugin-configured weights and thresholds. Cap raw-volume influence. Deduplicate competing proposals before selecting the highest eligible score.

## Required proposal content

- Stable action ID and proposal family.
- Site, target URL, query/intent cluster, and detector version.
- Baseline window and source evidence references.
- Current publicly observed values.
- Exact proposed replacement values or implementation steps.
- Expected metric effect and evaluation window.
- Factual, brand, cannibalization, and implementation risks.
- Public verification checklist and reversal recommendation.
- Human approval state.

The proposal never states or implies that BOS implemented the change.

## Hold and exit rules

Select `HOLD_AND_OBSERVE` when evidence is insufficient, the prior proposal is still evaluating, the observed difference is attributable to a confounder, or no proposal clears the configured score and confidence floors.

Stop or pause the loop when the configured goal is met, progress plateaus for the configured windows, required provider access remains unavailable, provider budget is exhausted, the deadline is reached, or a safety condition fires.
