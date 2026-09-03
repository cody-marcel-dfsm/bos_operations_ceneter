# My CRM tool workflows

## Discovery map and cache

1. Resolve the current opaque BOS context through `bos-mcp-client`.
   Load `client-policy.json` and apply its dataset defaults unless an approved
   customer policy or explicit request supplies a stricter value.
2. Inspect the cached MCP manifest fingerprint and client routing map. Refresh
   live tool discovery after connection, transport, package/schema, or
   configured maximum-age change. Refresh context or operation status after
   plugin, role, capability, or provider changes.
3. Build the source map only from tools returned by the active named CRM
   connection. Combine each tool's schema with package-owned semantic routing;
   do not write discovery results to BOS or infer unavailable tools.
4. Treat the map as routing and schema metadata only. Catalog presence grants
   no authority; every data call performs current server authorization.
5. Build each dataset cache key from the authority scope, source/tool digest,
   dataset, and normalized query digest. Run the document-cache planning
   operation on every invocation.
6. Use a fresh covered cache. For `refresh_required`, withhold its records and
   issue the live source query. Publish the refreshed cache atomically before
   using it. The default policy excludes stale data after refresh failure.

The current package routing recognizes these operations only when each appears
in the live manifest:

| Source semantics | Discovered CRM tools |
|---|---|
| Lead Director lead records | `crm_search_leads`, `crm_get_lead`, `crm_create_lead`, `crm_update_lead` |
| GoHighLevel contacts | `crm_get_gohighlevel_contact`, `crm_create_gohighlevel_contact`, `crm_update_gohighlevel_contact` |
| Gmail activity evidence | `crm_search_gmail_activity`, `crm_get_gmail_thread` |
| Google Calendar activity evidence | `crm_search_calendar_activity` |
| Calimatic customer/student evidence | `crm_search_calimatic_students`, `crm_list_calimatic_enrollments` |

This table supplies semantic routing, not authorization or provider readiness.
For example, a GoHighLevel search descriptor defines its schema; the call may
still return provider authorization or an operation denial. The client never
substitutes get or broad retrieval.

## Federated read

1. Compile the common normalized query and any source-specific query overrides.
2. Select discovered source tools whose schemas satisfy the request.
3. For each source, create an isolated execution unit containing only the
   context selector, that source/tool identity, its query, cache policy, and
   normalized output contract.
4. Call the exact discovered read tool for that source with only schema-valid
   arguments. Preserve its result even when another source fails.
5. Emit sanitized execution events containing sequence, operation, source
   digest, status, timing, cache decision, and record count. Include no hidden
   reasoning or customer record values in the event details.
6. Normalize each source result with origin, ISO observation time, local
   last-updated label, age, maximum age, coverage, elapsed time, and usage
   scope.
7. Aggregate only after all execution units reach completed, failed, or
   unavailable. Preserve per-source sections in every mode. `merged_view`
   follows `client-policy.json`: one exact normalized email may correlate
   records across distinct sources; phone is supporting evidence; duplicates,
   conflicts, and transitive matches remain separate.

## Explain

Compile the plan locally from the current manifest, client routing map,
intended query, mode, dataset, and parallel preference. Return sanitized
parameter shapes and exact discovered source tools. Run no source data call.
For `explain analyze`, execute the read workflow afterward and attach observed
timing, cache, failures, and available usage evidence.

## Single-source mutation

1. Resolve one exact discovered source tool and confirm its create or update
   schema.
2. Before create, search that source for stable duplicate identities when
   available.
3. Call the discovered source-specific create or update tool. Supply a version,
   idempotency key, or operation identity only when its live schema supports it.
4. Report the returned read-back evidence, transaction guarantee, operation
   identity, and final or uncertain state without strengthening the source's
   guarantees.
5. Invalidate affected query caches after a confirmed commit.

## Multi-source mutation

1. Establish explicit field authority and prepare one target per discovered
   source operation.
2. Build a task-local plan. Show exact target tools, sanitized changes,
   conflicts, unsupported targets, versions, and source guarantees before
   confirmation.
3. After confirmation, invoke each existing source mutation independently and
   record its returned receipt or error in the task execution ledger.
4. Report every source state. A cross-source result carries no distributed
   atomicity claim.
5. Reconcile an uncertain source with one verification read and an existing
   status/idempotency operation when that source advertises one. Perform at most
   one replay and only when the operation contract proves it safe. Then return
   complete, stable partial, or `user_action_required`. My CRM creates no
   server recovery record or background work.
