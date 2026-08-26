# Cache maintenance contract

Add this policy to `begin`, `read`, or `inspect`:

```json
{
  "freshness_policy": {
    "max_age_seconds": 300,
    "allow_stale_on_error": false
  }
}
```

The helper returns `freshness_status`, `age_seconds`, `max_age_seconds`,
`allow_stale_on_error`, `origin`, and `sync_completed_at`.

- `current`: complete coverage and current refresh watermark within policy.
- `refresh_required`: complete coverage and watermark whose completed refresh
  exceeds the maximum age. The caller owns the lease and must commit or abort.
- `catch_up`: cached data needs an interval or change delta.
- `cold`: no complete committed cache exists.
- `busy`: another process owns the exact query refresh lease.

Use `inspect` to return metadata plus `document_count`. Use `invalidate` to
remove one exact query manifest and lease. Immutable unreferenced objects remain
eligible for host-managed garbage collection.
