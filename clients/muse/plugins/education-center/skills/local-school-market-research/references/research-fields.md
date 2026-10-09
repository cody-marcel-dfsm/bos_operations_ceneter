# Research Fields

Use these fields when creating local school-market CSVs or ranked target lists. Add campaign-specific fields only when needed.

## Contact List Fields

- `organization`: Legal or public institution name.
- `school_system`: District, network, university system, or short school label.
- `program_or_department`: Specific school, department, lab, club, CTE center, admissions office, or program.
- `contact_type`: One of `department leadership`, `department office`, `admissions/outreach`, `faculty research`, `program office`, `student organization`, `district leadership`, `CTE/workforce`, `community partnerships`, `school administrator`, or a similarly specific type.
- `contact_name`: Person or official office name.
- `title`: Public title or office role.
- `email`: Verified direct or official routing email. Leave blank only if the deliverable is explicitly a research draft.
- `phone`: Public phone number if available.
- `city`, `state`: Local market geography.
- `fit_score`: 1-5 score where 5 is a strong, evidence-backed fit.
- `fit_reason`: Short evidence-backed rationale.
- `partnership_angle`: Specific reason this institution might care.
- `next_action`: Practical next outreach step.
- `source_url`: Primary source URL for the row.
- `source_notes`: What the source proves, plus any confidence caveat.
- `contact_confidence`: `verified`, `official-route`, `needs-verification`, or `inferred`.
- `campaign_status`: Usually blank for a new list unless importing status from an existing campaign.
- `do_not_email`: `TRUE` only when suppressed; blank or `FALSE` otherwise.
- `suppression_reason`, `suppression_source`, `suppression_date`: Preserve when known.
- `research_date`: ISO date when the row was researched.

## Fit Score Guide

- `5`: Direct program/lab/pathway fit, local relevance, and verified contact route.
- `4`: Strong adjacent fit with clear contact route or strong direct fit with one minor gap.
- `3`: Plausible partner but less direct, farther away, more formal, or lower priority.
- `2`: Weak or speculative fit; include only for broad scans.
- `1`: Mention only as market context, not outreach priority.

## Required Validation

Before delivering a CSV:

1. Parse with a structured CSV reader.
2. Confirm all rows have the expected column count.
3. Count blank emails, blank source URLs, and blank fit reasons.
4. Report whether the file is send-ready or a research draft.
