# Client report contract

## Fixed location

Use this exact root:

```text
~/Documents/BOS Reports/SEO Improver
```

Expand `~` once to the current OS account. Reject a missing or unwritable root, traversal, and any resolved path outside that root.

## Organization

```text
<root>/<org_id>/<app_code>/<installed_app_id>/<site_id>/
  manifest.json
  latest.json
  runs/<run_id>/
    report.json
    report.md
```

Write run artifacts to a temporary sibling, validate them, rename atomically, then update `latest.json`. Never write reports into a repository, worktree, temporary system directory, or MCP payload.

## Required `report.json` fields

- `schema_version`
- `run_id`
- `org_id`
- `app_code`
- `installed_app_id`
- `site_id`
- `site_url`
- `started_at`
- `completed_at`
- `mode` equal to `observe_and_propose`
- `evidence_summary`
- `operation_results`
- `review_summary`
- `review_analysis`
- `google_review_analysis`
- `selected_proposals` with zero or one item
- `skipped_candidates`
- `provider_blockers`
- `exit_decision`
- `next_due_at`
- `artifacts`

Every selected proposal requires `action_id`, `family`, `target_url`, `query_cluster`, `evidence_refs`, `current_values`, `proposed_changes`, `expected_effect`, `risks`, `approval_state`, and `evaluation_window`.

`operation_results` contains one entry for every intended operation in the MCP
tool map. Every entry requires:

- `operation`
- `category`: `discovery`, `orchestration`, `measurement`, `analysis`, or `review`
- `review_relevance`: `primary_review` or `supports_review`
- `status`: `executed`, `skipped`, `unavailable`, or `failed`
- `summary`: a concise result for executed operations or the practical impact
  of an operation that did not execute
- `reason`: `null` for successful execution; otherwise the explicit cause
- `operation_id`: the BOS operation ID when one was returned, otherwise `null`

`review_summary` requires:

- `status`: `ready`, `partial`, `not_ready`, or `not_attempted`
- `operations`: the review-category operation names
- `proposal_count`
- `human_review_required`
- `summary`

`review_analysis` requires:

- `evidence_reviewed`: a non-empty list of current or prior evidence actually examined
- `current_assessment`: the substantive assessment of current SEO/review state
- `prior_run_comparison`: what changed or remained unchanged from the latest validated run
- `supported_conclusions`: a non-empty list of conclusions supported by reviewed evidence
- `unknowns`: unresolved questions that require missing evidence
- `proposal_readiness`: why a proposal is ready, partial, or not ready
- `recommended_decision`: the evidence-backed proposal, hold, or partial-result decision
- `next_best_action`: the highest-leverage next action and its expected information gain

`google_review_analysis` requires:

- `source` equal to `Google Business Profile`
- `profile_id`
- `as_of`
- `timezone`
- `coverage`: `complete`, `partial`, or `unavailable`
- `coverage_note`
- `average_rating`
- `total_review_count`
- `reviews_analyzed`
- `last_7_days_count`
- `last_30_days_count`
- `last_90_days_count`
- `last_complete_week_count`
- `latest_review_at`
- `days_since_latest_review`
- `trailing_26_weeks_start`
- `weekly_frequency`: exactly 26 chronological objects containing
  `week_start`, `week_end`, and `count`; `count` is a non-negative integer when
  that bucket is fully covered and `null` when it is not

Use `null` for metrics that cannot be established. Never use zero to represent
unavailable or partial evidence. Counts may be zero only when coverage is
complete for that metric's full window.

The Markdown report must lead with “Google review performance,” including the
headline metrics and a Mermaid `xychart-beta` bar chart titled `Google reviews
by week — trailing 26 weeks`. Follow it with the decision and review summary, a
substantive “Review analysis” section, then separate “Operations run” and
“Operations not run” sections. The analysis is required when zero operations
execute and must not restate the operation ledger. Do not collapse a partial
run into a generic plugin blocker.

`artifacts` contains relative paths and SHA-256 hashes for the run artifacts. Reports contain BOS operation IDs only as references; they never contain secrets, authorization headers, provider credentials, or unnecessary query-level personal data.
