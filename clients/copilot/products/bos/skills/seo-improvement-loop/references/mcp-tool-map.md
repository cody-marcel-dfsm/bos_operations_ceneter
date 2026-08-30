# BOS MCP tool map

The live BOS manifest is authoritative. These names define the intended contract and may remain unavailable until the backend milestone is deployed.

| Intended operation | Category | Review relevance | Effect | Client use |
|---|---|---|---|---|
| `seo_sites_list` | discovery | supports review | Read | Resolve configured sites and provider health. |
| `seo_targets_list` | discovery | supports review | Read | Load bounded query/intent targets and objectives. |
| `seo_run_begin` | orchestration | supports review | Create service run state | Establish correlation and return current settings, limits, and blockers. |
| `seo_performance_measure` | measurement | supports review | Read/external | Retrieve bounded Search Console observations through the configured `google-search-console` dependency. The deployed live manifest remains authoritative. |
| `seo_serp_measure` | measurement | supports review | Read/external | Retrieve locale/language/device-specific SERP observations and provider cost. |
| `seo_page_audit` | measurement | supports review | Read/external | Inspect public pages and return technical/content fingerprints. |
| `seo_metrics_compare` | analysis | supports review | Read | Return deterministic matched-window arithmetic without choosing an action. |
| `seo_evidence_bundle_get` | analysis | supports review | Read | Return source-separated evidence and service-owned proposal state. |
| `reputation_search_profiles` | measurement | supports review | Read/external | Resolve the tenant-scoped Google Business Profile and current profile identity. |
| `reputation_search_reviews` | measurement | supports review | Read/external | Retrieve and paginate Google reviews for the resolved profile. Each page includes one `review_page_summary` record carrying rating, total count, and `next_page_token`; exclude it from review counts and use provider review IDs and `createTime` for recency and weekly-frequency metrics. |
| `seo_proposal_create` | review | primary review | Create proposal state | Validate and persist the skill-authored proposal and immutable recommendation hash for human review. |
| `seo_proposal_get` | review | primary review | Read | Return one immutable proposal and its review state from the selected installation. |

No website apply, publication, edit, rollback, CMS, WordPress, or Git operation belongs to the observe-and-propose contract.

If an operation is absent, record it as `unavailable`, name the missing
plugin/capability, and continue with remaining evidence. A partial run is valid
when its conclusion is defensible. Never call direct organization provider APIs
as a fallback.

The primary review operations are `seo_proposal_create` and
`seo_proposal_get`. All other operations supply discovery, measurement, or
analysis evidence that supports the review.
