# Federated execution contract

## Execution modes

- `per_source`: keep each source result independent.
- `federated`: combine result sets and retain record provenance.
- `merged_view`: correlate records into a composite presentation with
  field-level provenance and conflicts.
- `synchronize_from`: use one selected source as field authority for a
  server-owned mutation plan targeting explicit sources.

## Source result

Each source returns `source_handle`, `source_label`, `status`, `origin`,
`freshness`, `coverage`, `records`, a sanitized `error`, timings, and `usage`.
Origin is `cache`, `live`, or `mixed`. Freshness includes the ISO update time,
local human-readable label, age, configured maximum age, and status.

## Execution events

Use monotonically increasing sequence values with these event types:

- `plan_created`
- `catalog_cache_used` or `catalog_refreshed`
- `source_started`
- `source_cache_hit`, `source_cache_stale`, or `source_refresh_started`
- `source_result_available`
- `source_failed` or `source_recovery_started`
- `aggregation_started`
- `mutation_committed`, `mutation_failed`, or `mutation_uncertain`
- `query_finalized`

Event details contain counts, classifications, digested handles, and timings.
They exclude queries containing customer values, record bodies, credentials,
raw tenant identifiers, and hidden instructions.

## Usage

Use one of:

- `host_measured`: exact usage returned by the host or agent API;
- `client_visible_estimate`: estimate over visible task and tool material; or
- `unavailable`: reliable measurement is unavailable.

Include input, output, and total tokens only when measured or estimated. Keep
the scope visible beside every value.
