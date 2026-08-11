# Shared local document cache

## Status and ownership

- **Status:** canonical platform contract
- **Owner:** packaged `bos-mcp-client` runtime surface
- **Consumers:** BOS-family runtime products and their domain skills
- **Source owners:** BOS MCP capabilities and explicitly selected connected
  read-only providers

This contract covers documents and document-like records retrieved repeatedly
by installed BOS-family plugins on one user's machine. Examples include Drive
files, Gmail threads, Calendar events, enrollment records, lead evidence, and
provider documents used by more than one workflow.

## Common cache root

Every installed product resolves one cache root for the current OS user:

| Platform | Root |
|---|---|
| macOS | `~/Library/Caches/ai.dfsm.bos/documents/v1` |
| Linux | `${XDG_CACHE_HOME:-~/.cache}/ai.dfsm.bos/documents/v1` |
| Windows | `%LOCALAPPDATA%\DFSM\BOS\Cache\documents\v1` |

`BOS_DOCUMENT_CACHE_DIR` may select an absolute root for managed deployments
and tests. Products in the same host environment use the same resolved value.
The cache implementation creates private user-only directories and files.

## Data model

The cache has two layers:

1. A content-addressed object store holds one immutable copy of each normalized
   source-document version. Matching documents returned by several plugins or
   queries reuse the same object.
2. Authority-scoped indexes refer to those objects and record query coverage,
   source cursors, per-resource versions, tombstones, and successful sync times.

An authority index key is a one-way digest over the server-derived
organization, installation, delegated role, application, skill group, and the
selected provider account. Customer-supplied selectors never establish this
authority. A connected client source contributes its exact authenticated
account identity to the key.

A query key is a digest over a canonical source, resource kind, account, and
stable selector. Time windows are coverage metadata, which lets requests for
the same logical query reuse and extend prior intervals. Property order has no
effect on the key. Provider resource IDs and versions deduplicate documents
across query indexes.

Coverage windows use half-open `[from, through)` boundaries. Change catch-up
uses the committed watermark as an exclusive `after` boundary and the fixed
refresh upper bound as an inclusive `through` boundary. Provider adapters map
their native boundary rules to this contract and resource-version deduplication
absorbs a repeated boundary record.

## Read and catch-up workflow

Each skill applies this sequence before generating an outcome:

1. Resolve current BOS context and the exact selected provider account.
2. Normalize the source request and capture a fixed `refresh_through` upper
   bound. This prevents updates arriving during pagination from creating an
   ambiguous watermark.
3. Ask the shared cache for covered intervals, the last complete cursor or
   timestamp, and cached resource versions.
4. Acquire the query lease. When another process owns it, wait for that bounded
   lease and re-read the index. The lease owner re-reads the index after
   acquisition.
5. Request each uncovered interval and only changes after the committed
   watermark through `refresh_through`. Use a provider change token, cursor,
   `modified_after` filter, or conditional file read with the cached version or
   ETag. Follow all pages and retain deletion events as tombstones.
6. Atomically publish the normalized documents, tombstones, query coverage,
   next cursor, and `sync_completed_at`. Advance the watermark to the fixed
   upper bound only after the complete catch-up succeeds.
7. Re-read the cache and generate the outcome from the requested cached
   interval plus the newly committed changes.

The first request treats the entire requested interval as its initial gap. A
request for a fully covered interval performs no source content query. A
specific cached file uses conditional metadata/version validation and fetches
content only when its source version changed.

## Query overlap and concurrency

- Canonical query fingerprints collapse identical searches issued by different
  skills or products.
- Coverage intervals exclude already synchronized time ranges from wider or
  partially overlapping requests.
- Content addressing collapses the same file or thread version returned by
  different searches.
- A cross-process lease provides single-flight refresh for one authority and
  logical query. A waiter consumes the winner's committed result.
- Atomic rename publishes indexes. Readers observe the complete prior state or
  the complete next state.
- Lease expiry supports recovery after a terminated client. The recovery owner
  starts from the last committed watermark.

## Provider capability contract

Document-producing read tools declare at least one incremental primitive:

- change cursor or page token;
- `modified_after` plus a stable inclusive/exclusive boundary;
- conditional version or ETag validation for a named resource; or
- a bounded authoritative snapshot with conditional source-version validation.

The response preserves stable resource identity, source version, modified time,
pagination state, and deletion state. BOS-routed providers enforce this within
the authenticated server scope. Connected providers enforce it within their
selected account authorization.

When a source exposes versioned snapshot reads, the skill validates the cached
snapshot version first. An unchanged version transfers no content. A changed
version makes that bounded snapshot the provider's minimal delta. The skill
publishes its watermark only after the snapshot completes. Provider capability
work should add change cursors or per-resource conditional reads so changed
snapshots transfer only their changed records.

## Safety and lifecycle

- Cache indexes remain isolated by authority and provider account.
- Skills confirm live authority before every cache read, including a fully
  cached request.
- Cached payloads contain the normalized, minimum-necessary fields used by the
  authorized workflow. Raw message bodies, attachment bytes, unrelated notes,
  credentials, and secret values remain outside the cache unless the user's
  request explicitly requires that source artifact and its policy permits local
  caching.
- Mutations always execute against the canonical provider or BOS service. The
  local cache supplies read evidence and receives mutation reconciliation as a
  later incremental change.
- Logs and user-visible diagnostics contain cache keys, counts, timing, and
  sanitized states. Document bodies, credentials, raw authority identifiers,
  and provider account identifiers stay out of diagnostics.
- User sign-out, revoked authority, package uninstall, and managed retention
  policies may invalidate an authority index. Content objects with no remaining
  references become eligible for garbage collection.
- A schema-version change uses a new versioned root, preserving deterministic
  rollback to the prior reader while allowing later cleanup.

## Validation gates

1. All runtime products ship the same canonical cache helper through
   `bos-mcp-client`.
2. Root resolution is independent of product and client installation paths.
3. Canonical query keys are stable across property order.
4. Authority changes produce separate indexes.
5. A completed refresh advances coverage and sync time; an aborted refresh
   preserves them.
6. Concurrent identical refreshes produce one lease owner.
7. Repeated document versions produce one content object across query indexes.
8. Generated Codex, Claude, Copilot, and Gemini packages contain equivalent
   helper bytes and skill guidance.
