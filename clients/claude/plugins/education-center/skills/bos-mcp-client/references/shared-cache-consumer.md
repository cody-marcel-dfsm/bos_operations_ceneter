# Shared cache external-consumer contract

`bos.shared-cache-consumer/v1` is the supported BOS package seam for a
separately installed BOS-family product to use the one OS-user document cache.
Import `scripts/shared-cache-consumer.mjs` from the installed `bos-mcp-client`
skill only to validate and narrow the ready consumer supplied by the host. Never
copy the helper into the dependent product.

The installed BOS host constructs and injects one ready consumer object. The
public `acceptBosSharedCacheConsumer(consumer)` helper validates and narrows
that object. It accepts no binding provider, authority value, cache partition,
provider account, or cache root and exposes no consumer or host constructor.
The native BOS composition boundary validates the live BOS context and resolves
the low-level organization, application, installation, authenticated user,
role, skill-group, and provider-account binding. A dependent product cannot
construct or configure that boundary or supply or observe any part of the
binding.

The public methods are:

- `begin(request)`;
- `commit(request)`;
- `abort(request)`;
- `read(request)`;
- `inspect(request)`;
- `invalidateExact(request)`;
- `invalidateDataset(request)`;
- `invalidateSource(request)`; and
- `invalidateCurrentAuthority(request)`.

Every request uses this public identity:

```json
{
  "schema_version": "bos.shared-cache-consumer/v1",
  "source": {
    "platform": "bos",
    "application": "lead-director",
    "plugin": "configured-service-name"
  },
  "query": {
    "operation": "record.search",
    "resource_kind": "organization-described-record",
    "selector": {"text": "Synthetic Contact 7F3A91"},
    "descriptor_token": "current Describe token"
  },
  "window": {
    "from": "2026-09-24T00:00:00.000Z",
    "through": "2026-09-25T00:00:00.000Z"
  },
  "refresh_through": "2026-09-24T18:00:00.000Z",
  "freshness_policy": {
    "max_age_seconds": 86400,
    "allow_stale_on_error": false
  }
}
```

Copy `source` from current Describe. Keep the semantic query, freshness policy,
and maintenance scope with the consuming skill. Add only the fields documented
by the low-level cache operation for commit or abort. The seam rejects raw
authority selectors, organization or role identifiers, provider names,
provider accounts, credentials, and tokens.

`begin`, `commit`, `abort`, and `read` retain the atomic publication,
failed-refresh preservation, single-flight, coverage, and freshness semantics
in `document-cache-protocol.md`. `formatSharedCacheFreshness` produces the
required live/cached label, local-time update value, human-readable age, and
configured maximum age. Maintenance invalidates one exact query, one dataset,
one selected source, or the complete current authority partition. The BOS
package derives every private key and owns the common cache root and lifecycle.
Commit accepts closed live documents with `resource_id`, `version`,
`modified_at`, and `payload`, or closed tombstones with those identity/version
fields plus `deleted: true` and no payload. Tombstones contribute to the commit
receipt and remove live cached content; `read` and `inspect` expose live
documents/counts only.

Contract changes ship with the BOS package version. A dependent product pins a
compatible BOS package requirement and never hot-patches or vendors the seam.
Rollback installs the prior compatible BOS release through supported client
controls; cache schema roots remain versioned for deterministic rollback.
