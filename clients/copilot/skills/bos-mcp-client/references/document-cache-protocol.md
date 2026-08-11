# Document cache helper protocol

Invoke `node scripts/document-cache.mjs` from the installed `bos-mcp-client`
skill directory. Send one JSON object on standard input. The helper writes one
sanitized JSON response on standard output. Keep document data in standard
input and out of command arguments.

## Shared request fields

The `begin`, `commit`, `abort`, and `read` operations use the same normalized
request identity:

```json
{
  "authority": {
    "organization_id": "server-derived organization",
    "installation_id": "server-derived installation",
    "delegated_role_id": "server-derived role",
    "application": "package application name",
    "skill_group": "package MCP group name"
  },
  "source": {
    "provider": "stable provider name",
    "account": "exact authenticated provider account identity"
  },
  "query": {
    "resource_kind": "stable resource type",
    "selector": {}
  },
  "window": {
    "from": "2026-08-01T00:00:00.000Z",
    "through": "2026-08-08T00:00:00.000Z"
  },
  "refresh_through": "2026-08-11T15:00:00.000Z"
}
```

Use the same source, resource kind, account, and selector for equivalent
queries across skills. Put requested dates in `window`. Set `refresh_through`
once before paging the provider and retain that exact value through commit or
abort.

Interpret query windows as half-open `[from, through)` intervals and change
gaps as `(after, through]`. Normalize payloads to minimum-necessary reusable
fields before commit.

## Begin

Add `"operation": "begin"`. A cold or catch-up response includes
`lease_token`, `coverage_gaps`, `change_gap`, `cursor`, and the last
`sync_completed_at`. A cold response uses one bounded, versioned snapshot to
initialize both the requested coverage and the first change watermark. A
catch-up response queries its uncovered intervals and changes after its cursor.
Call `read` after acquiring the lease when conditional provider calls need
cached resource versions. A `current` response needs no source content query.
A `busy` response includes `retry_after_ms`; wait within the task's bounded
execution policy and invoke `begin` again.

For a provider with snapshot reads, send the cached source version
conditionally. An unchanged response transfers no document content. A changed
response supplies the bounded snapshot as that provider's minimal delta.

## Commit

Repeat the exact shared request, add `"operation": "commit"`, and include the
lease plus the complete provider result:

```json
{
  "lease_token": "begin response token",
  "next_cursor": "provider cursor or null",
  "covered_intervals": [
    {
      "from": "2026-08-01T00:00:00.000Z",
      "through": "2026-08-08T00:00:00.000Z"
    }
  ],
  "documents": [
    {
      "resource_id": "stable provider resource ID",
      "version": "provider version or ETag",
      "modified_at": "2026-08-11T14:30:00.000Z",
      "deleted": false,
      "payload": {}
    },
    {
      "resource_id": "deleted provider resource ID",
      "version": "deletion event version",
      "modified_at": "2026-08-11T14:40:00.000Z",
      "deleted": true
    }
  ]
}
```

Commit after every provider page has succeeded. `covered_intervals` defaults to
the requested window. Supply tombstones for deletions. The helper publishes
objects, coverage, cursor, refresh watermark, and `sync_completed_at`
atomically.

## Abort

Repeat the exact shared request, add `"operation": "abort"`, and provide the
`lease_token`. Use abort after incomplete pagination, source failure, or
validation failure. The last committed watermark and cache state remain
current.

## Read

Repeat the shared request and add `"operation": "read"`. The result contains
the plan state plus current non-deleted documents for that authority and query.
Filter the returned normalized records to the requested operating interval and
apply the domain skill's minimum-necessary data rules before rendering.

## Managed root override

Managed environments and tests may set `BOS_DOCUMENT_CACHE_DIR` to one absolute
path. Every BOS-family product in that host environment uses the same value.
Normal installations use the platform default from the shared cache contract.
