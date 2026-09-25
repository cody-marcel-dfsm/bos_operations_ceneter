# BOS client dependency contract v1

This immutable public contract is consumed by separately released BOS-family
products. It contains two application-neutral seams owned by the installed BOS
package:

1. `bos.external-dependency-adapter/v1` invokes current deterministic HTTPS
   operations advertised by Describe and exact server-returned journey actions
   through the one BOS host connection.
2. `bos.shared-cache-consumer/v1` exposes the one BOS-owned OS-user document
   cache without exposing authority, provider-account, credential, or token
   inputs.

The adapter constructor is:

```js
createBosExternalDependencyAdapter({ hostTransport, contextProvider })
```

Its public methods are:

```js
recoverAuthentication({ resource, condition, host_correlation? })
waitForAuthentication({ resource, condition, host_correlation? })
invokeDiscoveredOperation(contact, payload?)
invokeReturnedAction(action, payload?)
invokeStateAction(action)
```

`contact` is the complete current `status: "described"` operation returned by
BOS Service, including effect, limits, guarantees, execution, input and output
schemas, public error contract, and sources. The adapter performs no
client-authored projection. `GET` operations are bodyless; every other
deterministic HTTPS operation requires the payload declared by `input_schema`.

The installed BOS host injects one ready consumer object into a dependent
product. `acceptBosSharedCacheConsumer(consumer)` validates and narrows that
ready object without accepting any composition input. A dependent product
neither constructs the consumer nor supplies a binding provider, cache
partition, authority selector, provider identity, or cache root. The injected
object's public methods are:

```js
begin(request)
commit(request)
abort(request)
read(request)
inspect(request)
invalidateExact(request)
invalidateDataset(request)
invalidateSource(request)
invalidateCurrentAuthority(request)
```

`begin` returns the cache plan fields in
`shared-cache.results.schema.json`. A `cold`, `catch_up`, or
`refresh_required` result includes `lease_token` and `lease_expires_at`; a
`busy` result includes `retry_after_ms`; `current` requires no source content
query. `commit` returns `state: "committed"`, digested authority/query keys,
document and tombstone counts, the total cached count, and
`sync_completed_at`. `abort` returns `state: "aborted"` plus digested
authority/query keys. `read` returns the current plan plus normalized
live `documents`; committed tombstones are reported by `commit.tombstone_count`
and omitted from `read` documents and `inspect.document_count`. A commit
document is either a closed live record with `resource_id`, `version`,
`modified_at`, and `payload`, or a closed tombstone with those identity/version
fields plus `deleted: true` and no payload. `inspect` replaces document bodies
with `document_count`.
Invalidation returns `state: "invalidated"`, its scope, digested keys where
applicable, and `invalidated_query_count` for dataset/source maintenance.

The JSON Schemas and examples in this directory define the complete public
inputs and result envelopes. `manifest.json` binds every contract file and
every transitive executable file by SHA-256, then binds those rows into the
complete bundle digest. Consumers import the complete directory, verify the
manifest and installed public helper bytes, and depend on the installed BOS
paths named there. The shared-cache runtime and native authority composition
remain private to BOS and are deliberately absent from the external executable
inventory. Consumers never copy executable implementations or access this
repository at runtime.
