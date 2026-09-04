# Federated execution contract

## Execution modes

- `per_source`: keep each source result independent.
- `federated`: combine result sets and retain record provenance.
- `merged_view`: correlate records into a composite presentation with
  field-level provenance and conflicts.
- `synchronize_from`: use one selected source as field authority for an
  explicitly confirmed server plan executed through one provider-neutral
  operation.

## Invocation boundary

The client issues one app-service invocation for a logical federated query. The
request omits source selection to mean all sources currently enabled and
authorized by the server. Explicit source selection contains only opaque handles
from the current service discovery response. The server owns source resolution,
integration fan-out, concurrency, translation, and partial-source execution.

The client never derives sources from provider tool names and never dispatches
one call or agent per source.

## Source result

The current service response returns `sourceResults[]`. Each item contains
`source.sourceHandle`, `source.displayName`, source readiness and capabilities,
`status`, `records`, `observedAt`, `freshness`, and a sanitized `error`. The
client adapter converts that exact envelope to its local `source_handle`,
`source_label`, cache origin, coverage, and human-readable freshness shape. It
does not rename, select, or invoke an underlying source operation.

The response's top-level `records` array is the server-resolved federated view.
The client presents it directly for `merged_view`; it never repeats identity
matching over `sourceResults`.

## Execution events

Use monotonically increasing sequence values. The client may create only its
own planning, cache, aggregation, and finalization events. Source lifecycle
events come from the server response or stream:

- `plan_created`
- `discovery_contract_cache_used` or `discovery_contract_refreshed`
- `dataset_cache_hit` or `dataset_cache_stale`
- `service_invocation_started`
- server `source_completed` or `source_failed`
- server `federation_completed`
- `aggregation_started`
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

## Bounded mutation recovery

Explicit source selection and mutation planning use only source descriptors
validated from the discovered `crm.sources.list` operation's exact
`lead-director-crm-sources/v1` response for the current context and authority.

Single-record get sends `{recordHandle}`. Create sends `{sourceHandle, changes,
idempotencyKey}` and update sends `{recordHandle, expectedVersion, changes,
idempotencyKey}`. Handles and versions must come from current server results.
Create and update require explicit confirmation and one provider-neutral
app-service invocation. Their response reports the underlying source guarantee.

Cross-source synchronization invokes `crm.sync.plan` once with an application
identity and 1–50 exact targets. The client validates the returned opaque plan,
target dispositions, expiry, and `non_atomic_per_source` guarantee. After
confirmation it invokes `crm.sync.apply` once with only the application and
plan handles. The server owns target fan-out and returns committed, failed, or
uncertain receipts plus convergence or reconciliation status.

The discovered plan operation is `write` and non-idempotent because each call
creates a distinct expiring plan. Never replay it automatically. The apply
operation is `write` and idempotent through the stable per-target keys bound
into that plan.

For uncertain work, preserve the service-returned reconciliation action. The
server owns recovery and replay decisions. The client issues no per-target
recovery call and never replays synchronization planning or apply. Return
`user_action_required` when server evidence requires it. Create no client-owned
server record or background retry.
