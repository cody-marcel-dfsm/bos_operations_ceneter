# Plugin settings cache helper protocol

Invoke `node scripts/plugin-settings-cache.mjs` from the installed
`bos-mcp-client` skill directory. Send one JSON object on standard input. The
helper writes one sanitized JSON response on standard output.

## Cache identity

Every settings operation includes:

```json
{
  "cache_scope": "opaque server-returned scope",
  "plugin_key": "stable semantic plugin key",
  "settings_schema_version": "1",
  "settings_epoch": "opaque product settings epoch"
}
```

Obtain `cache_scope` and `settings_epoch` from the current authenticated BOS
context. Customer settings and request values never establish cache authority.
The helper stores only digests of the opaque scope in filenames and envelopes.

## Read

Add `"operation": "read"`. A `current` result contains the confirmed snapshot,
revision, cursor, sync time, and age. A `miss` requires a canonical BOS read. A
`stale` result identifies an epoch change or expiry and requires cursor catch-up
or a replacement snapshot. Never render stale private values after authority or
epoch validation fails.

## Commit

Add `"operation": "commit"`, `revision`, optional `change_cursor`, complete
display-safe `snapshot`, and one canonical source:

- `bos_read` for a completed server read;
- `bos_committed` for a completed apply response; or
- `bos_reconciled` for a mutation later proven committed.

The helper rejects recommendations, drafts, secret-shaped keys, raw authority
identifiers, and non-JSON payloads. Commit only the complete server snapshot.

## Invalidate

Add `"operation": "invalidate"` with the exact cache identity. It removes only
that scope, plugin, and schema entry.

## Initialization receipt

Use `read_receipt` with `cache_scope`, stable `product_key`, and the server
`initialization_epoch`. Use `commit_receipt` with those fields plus the verified
completed plugin keys and revisions. Commit a receipt only after a fresh server
inventory confirms every required field and the matching cache entries are
current.

## Managed root override

Managed environments and tests may set `BOS_PLUGIN_SETTINGS_CACHE_DIR` to an
absolute path. Normal installations use the platform-native shared BOS cache
root. Files use mode `0600`; directories use mode `0700`; writes publish by
atomic rename.
