# My CRM service workflows

## App service discovery and cache

1. Resolve the current opaque BOS context through `bos-mcp-client`.
   Load `client-policy.json` and apply its dataset defaults unless an approved
   customer policy or explicit request supplies a stricter value.
2. Query the BOS app directory, select Lead Director from its current returned
   descriptor, and query the exact returned app MCP contact. Discover an
   app-owned CRM service by advertised entity semantics and operation classes.
3. Validate the selected operation against the service's current
   machine-readable contract. Cache its sanitized descriptor only while its
   contract digest, discovery epoch, opaque context, and configured maximum age
   remain current. Discovery grants no execution authority.
4. Select `crm.sources.list` from the current discovered service, invoke it
   once, and validate the exact `lead-director-crm-sources/v1` response before
   using any explicit source. Keep opaque handles bound to the current context,
   authority epoch, service, and discovery epoch. Source display labels never
   become routing keys.
5. Build each dataset cache key from the current authority scope, app and
   service contract digests, dataset, normalized query digest, and either the
   explicit opaque source-handle set or the all-enabled-and-authorized scope.
   Run the document-cache planning
   operation on every invocation.
6. Use a fresh covered cache. For `refresh_required`, withhold its records and
   issue one provider-neutral live query. Publish the complete refreshed result
   atomically before using it. The default policy excludes stale data after
   refresh failure.

## Federated read

1. Compile one normalized query using only fields declared by the discovered
   provider-neutral operation. The current search contract accepts exactly one
   of `query.text`, `query.email`, or `query.phone`; refresh discovery rather
   than inventing another selector.
2. Omit source selection when the user requests the organization's available
   CRM data generally. The server resolves all currently enabled and authorized
   sources. For an explicit source, send only a handle returned by the current
   service discovery response in `sourceHandles`. Use `limitPerSource` only
   within the current request contract.
3. Invoke the discovered service operation once. The server owns source
   selection, integration fan-out, concurrency, provider translation, partial
   failures, and source-level execution recovery.
4. Render sanitized `source_completed`, `source_failed`, and
   `federation_completed` events only when the server streams or returns them.
   Include no hidden reasoning or customer record values in the event details.
5. Normalize each server-returned source result with origin, ISO observation time, local
   last-updated label, age, maximum age, coverage, elapsed time, and usage
   scope.
6. Compose the final response after the service invocation reaches its terminal
   state. Preserve per-source sections in every mode. `merged_view`
   presents the service's returned federated `records` and their source
   provenance and match confidence. Never recalculate identity correlation or
   replace the server's merged result.

## Explain

Compile the client plan from the current app and service contracts, intended
query, mode, dataset, and cache decision. Show one service invocation, the
semantic operation, sanitized parameter shapes, and whether source selection is
all-enabled-and-authorized or an explicit set of opaque-handle digests. Obtain
individual source details only from a discovered server planning operation.
When that operation is absent, label source resolution as server-deferred and
invent no source list. Run no data query or mutation. For `explain analyze`,
execute the one service operation afterward and attach observed timing, cache,
failures, server events, and available usage evidence.

## Single-source mutation

1. Resolve one exact current server-returned source descriptor from the
   validated `lead-director-crm-sources/v1` inventory and a
   provider-neutral `crm.records.get`, `crm.records.create`, or
   `crm.records.update` operation from the current service contract.
2. Before create, use the service's duplicate-check behavior when the contract
   advertises it.
3. For get, send exactly `{recordHandle}`. For create, send exactly
   `{sourceHandle, changes, idempotencyKey}`. For update, send exactly
   `{recordHandle, expectedVersion, changes, idempotencyKey}` with the current
   server-returned version. Create and update require explicit confirmation
   bound to the deterministic plan identity.
4. Require write operations to advertise `sideEffect: write` and
   `idempotent: true`, then call the discovered CRM service operation once.
5. Report the returned read-back evidence, transaction guarantee, operation
   identity, and final or uncertain state without strengthening the source's
   guarantees.
6. Invalidate affected query caches after a confirmed commit.

## Multi-source mutation

1. Establish explicit field authority and target sources from current
   server-returned opaque handles.
2. Invoke discovered `crm.sync.plan` once with `{applicationId, targets}`.
   Each target uses `create` or `update`, provider-neutral changes, a stable
   idempotency key, and exact current server-returned handles and versions. The
   plan operation advertises `sideEffect: write`, `idempotent: false`; never
   replay it automatically because every invocation creates a new expiring
   plan.
3. Validate and present the returned `lead-director-crm-sync-plan/v1` plan,
   rejected targets, expiry, and `non_atomic_per_source` guarantee before
   confirmation. Never expose the raw plan handle.
4. After confirmation, invoke discovered `crm.sync.apply` once with
   `{applicationId, planHandle}`. The server owns target fan-out and returns
   `lead-director-crm-sync-apply/v1` receipts and recovery evidence. Require
   `sideEffect: write`, `idempotent: true` on the discovered apply operation.
5. Report every server-returned source state. A cross-source result carries no distributed
   atomicity claim.
6. Preserve every server-returned reconciliation action for uncertain work and
   present it to the user. The server owns recovery and replay decisions; the
   client issues no per-target recovery calls and never replays synchronization
   planning or apply. Return complete, stable partial, or
   `user_action_required`. My CRM creates no server recovery record or
   background work.
