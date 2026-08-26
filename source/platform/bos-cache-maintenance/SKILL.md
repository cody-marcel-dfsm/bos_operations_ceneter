---
name: bos-cache-maintenance
description: Inspect, refresh, invalidate, and maintain authority-scoped BOS query caches and cached MCP source maps. Use automatically before federated or expensive source reads and when a user asks about cache health, freshness, refresh, or clearing cached data.
---

# BOS Cache Maintenance

Use `bos-mcp-client/scripts/document-cache.mjs` after validating the live opaque
BOS context. Read
[references/maintenance-contract.md](references/maintenance-contract.md) before
an explicit cache inspection, invalidation, or stale-refresh operation.

## Invocation preflight

For every domain invocation, inspect only the manifest-derived source map and datasets
selected by that request:

1. Apply the product's client-owned maximum-age policy by source and dataset.
2. Treat live context, authorization, provider-binding, manifest, or source
   revision changes as invalidation evidence.
3. Use `current` cache data within policy. For `refresh_required`, query the
   provider conditionally or incrementally through one fixed upper bound and
   commit only after complete retrieval.
4. Abort a failed or partial refresh. Exclude the stale source under the default
   `allow_stale_on_error: false` policy.
5. Return cache/live origin, ISO update time, local display time, age, maximum
   age, and coverage with every source result.

Use `inspect` for metadata without document bodies. Use `invalidate` for one
exact authority/source/query identity. Authority revocation cleanup may remove
all indexes owned by that revoked authority through the managed host lifecycle.

Cache maintenance changes data reuse only. It grants no server authority and
never supplies data to a context that fails current authorization.
