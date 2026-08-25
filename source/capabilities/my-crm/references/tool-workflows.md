# My CRM tool workflows

## Catalog and cache

1. Resolve the current opaque BOS context through `bos-mcp-client`.
2. Inspect the client-cached source catalog. Refresh with `crm_list_sources`
   after connection, context, plugin, role, capability, provider, catalog
   revision, or configured maximum-age change.
3. Treat the catalog as routing metadata only. Every data call still performs
   current server authorization.
4. Build each dataset cache key from the authority scope, opaque source handle,
   dataset, and normalized query digest. Run the document-cache planning
   operation on every invocation.
5. Use a fresh covered cache. For `refresh_required`, withhold its records and
   issue the live source query. Publish the refreshed cache atomically before
   using it. The default policy excludes stale data after refresh failure.

## Federated read

1. Compile the common normalized query and any source-specific query overrides.
2. Select handles whose advertised datasets and `read` operation satisfy the
   request.
3. For each source, create an isolated execution unit containing only the
   context selector, that source handle, its query, cache policy, and normalized
   output contract.
4. Call `crm_search_records` with a one-item `source_handles` array. Preserve
   its source result even when another source fails.
5. Emit sanitized execution events containing sequence, operation, source
   digest, status, timing, cache decision, and record count. Include no hidden
   reasoning or customer record values in the event details.
6. Normalize each source result with origin, ISO observation time, local
   last-updated label, age, maximum age, coverage, elapsed time, and usage
   scope.
7. Aggregate only after all execution units reach completed, failed, or
   unavailable. Preserve per-source sections in every mode. `merged_view` may
   correlate exact approved identities and keeps ambiguous matches separate.

## Explain

Call `crm_explain_query` with the intended common query, optional
`source_queries`, handles, mode, dataset, and parallel preference. Return its
sanitized parameter shapes and selected source operations. Run no source data
call. For `explain analyze`, execute the read workflow afterward and attach
observed timing, cache, failures, and available usage evidence.

## Single-source mutation

1. Resolve one exact source handle and confirm the advertised create or update
   operation.
2. Before create, search that source for stable duplicate identities when
   available.
3. Call `crm_create_record` with a fresh idempotency key, or call
   `crm_update_record` with the record's current version and a fresh idempotency
   key.
4. Report the server's read-back evidence, transaction guarantee, operation ID,
   and final or recovery-required state.
5. Invalidate affected query caches after a confirmed commit.

## Multi-source mutation

1. Establish explicit field authority and prepare one target per source handle.
2. Call `crm_plan_sync`. Show conflicts, unsupported targets, expiration, and
   exact plan hash before confirmation.
3. After confirmation, call `crm_apply_sync` with the stored plan ID and hash.
4. Report every child source state. A cross-source result carries no distributed
   atomicity claim.
5. Poll `crm_get_operation_status` when needed. Use
   `crm_reconcile_operation` for uncertain or recovery-scheduled children. The
   server owns durable recovery and current authorization checks.
