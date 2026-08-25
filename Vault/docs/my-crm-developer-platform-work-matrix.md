# My CRM independent launch work matrix

Status: client package implemented; external host registration and live acceptance pending
Date: 2026-08-25
Owners: BOS Operations Center client package and existing Lead Director platform

## Operating decision

My CRM is a client expertise package over the existing Lead Director `crm` MCP
resource. It uses the same current no-fee access model as the other BOS runtime
products. It has no product-license, fee, Stripe, checkout, Subscription
Director, or entitlement dependency.

The implementation adds no Lead Director database table, migration, seed,
repository, model, capability publication, source-catalog endpoint, generic CRM
façade, or recovery service. BOS already owns authenticated context, filtered
tool discovery, plugin/provider authorization, deterministic source operations,
and each operation's native transaction guarantees.

The work surfaces below are peers with direct contracts. They are separate
efforts rather than a hierarchy.

## Correct runtime stack

```text
Claude / ChatGPT / Codex host
  -> installed My CRM package
  -> CRM domain skills + shared client execution/cache skills
  -> host-managed BOS OAuth
  -> /mcp/apps/leaddirector/crm
  -> bos_get_context + tools/list
  -> client derives a source/capability map from discovered tool schemas
  -> existing BOS tools execute in their current tenant/plugin/provider scope
  -> client aggregates provenance, freshness, partial errors, and usage
```

The live MCP manifest is the authority for callable operations. The package may
cache a manifest fingerprint and semantic routing map. It refreshes discovery
after connection, context, role, plugin, or capability changes and after its
configured maximum age. A missing tool is unavailable. The package never
creates access or server functionality in response.

## What exists

### BOS Operations Center

- deterministic product composition for Codex, Claude, Copilot, and Gemini;
- `bos-mcp-client` for OAuth, opaque context, tool discovery, recovery, and
  continuation;
- the shared authority-scoped local document cache;
- `bos-federated-query` for client planning, per-source fan-out, explain,
  aggregation, execution events, and scoped usage;
- `bos-cache-maintenance` for client freshness, refresh, inspect, and
  invalidation;
- the My CRM product manifest, brand asset, and CRM skill group.

### Existing Lead Director platform

- registered `/mcp/apps/leaddirector/crm` routing;
- `bos_get_context` and filtered MCP tool discovery;
- existing public CRM aliases for Lead Director search/get/create/update,
  GoHighLevel get/create/update, Gmail activity search/thread read, Calendar
  activity search, and Calimatic student/enrollment reads;
- existing operation catalog, resource-group filtering, provider adapters,
  authorization recovery, and PO/GO execution boundaries;
- existing integrations for Lead Director, GoHighLevel, Gmail, Google Calendar,
  and Calimatic. The CRM resource-group allowlist composes their existing
  operations without adding an execution or persistence layer. Each operation
  is usable only when present in the selected context's live manifest.

Existing Lead Director platform persistence remains owned by Lead Director.
My CRM neither changes nor extends that persistence.

## My CRM product behavior

### Discovery and routing

1. Connect to the package-declared `leaddirector/crm` resource.
2. Resolve one opaque context through `bos_get_context`.
3. Read the live tool manifest.
4. Build a client source map from exact tool names, input/output schemas, and
   package semantic routing.
5. Select only tools that can satisfy the requested CRM entity and operation.

The current map supports Lead Director lead records, GoHighLevel contact
get/create/update, Gmail and Calendar read-only activity evidence, and Calimatic
read-only customer/student evidence. Availability remains context-specific.
GoHighLevel search is accurately unavailable because the existing operation
catalog does not currently advertise a scoped search tool.

### Reads

- create one bounded execution unit per discovered source operation;
- apply the local freshness policy before each reusable dataset query;
- execute independent sources in parallel when the host supports it;
- preserve completed results when another source fails;
- retain per-source provenance and show cache/live origin, local last-updated
  time, human-readable age, maximum age, and coverage;
- optionally correlate exact approved identities into a merged presentation;
  ambiguous identities remain separate; and
- report measured, client-visible estimated, or unavailable token usage.

### Explain

`explain <request>` compiles a client plan from the manifest and skills without
calling a data operation. It shows exact discovered tools, sanitized parameter
shapes, cache decisions, parallel groups, aggregation, mutation boundaries,
expected output, and usage/latency scope. `explain analyze` executes that plan
and appends observed results.

### Mutations

A single-source mutation calls the existing source tool and inherits exactly
that operation's transaction guarantees. The package supplies versions,
idempotency keys, and operation identities only when the discovered schema
supports them.

A cross-source change is an explicitly confirmed task-local sequence of
independent source calls. The client records every returned receipt and error,
reports partial completion, re-reads uncertain targets, and uses existing
status/version/idempotency operations when discovered. It retries only when the
existing contract proves replay safe. It makes no distributed-atomicity claim
and creates no server recovery record.

## Work matrix

| ID | Independent surface | Existing foundation | My CRM work | Owner |
|---|---|---|---|---|
| CRM-P01 | Product identity | Product manifests and generated host packages | Keep `products/my-crm/product.json` bound to `leaddirector/crm` with the approved asset | BOS Operations Center |
| CRM-P02 | CRM expertise | Canonical capability composition | Maintain provider-neutral record, pipeline, activity, and federation skills | BOS Operations Center |
| CRM-P03 | Client discovery map | MCP `tools/list`, context, and schemas | Map discovered operations to CRM semantics locally; cache by manifest fingerprint | BOS Operations Center |
| CRM-P04 | Federated execution | Host agents/parallel tools and local cache | Fan out per source, preserve partials, merge with provenance, and render freshness/usage | BOS Operations Center |
| CRM-P05 | Explain planning | Live schemas and skill routing | Compile plan-only and explain-analyze views in the client | BOS Operations Center |
| CRM-P06 | Mutation coordination | Existing deterministic source operations | Confirm a task-local plan, call each source independently, and reconcile with existing operations | BOS Operations Center |
| CRM-M01 | Named MCP resource | `/mcp/apps/leaddirector/crm` exists | No new route or runtime | Lead Director |
| CRM-M02 | Authorization | OAuth, opaque contexts, role/plugin/capability filtering | No My CRM-specific access path | Lead Director |
| CRM-M03 | Source operations | Operation catalog, provider adapters, PO/GO boundaries | No generic façade; use operations already exposed by the selected resource | Lead Director |
| CRM-M04 | Platform persistence | Existing platform-owned persistence and provider receipts | No schema, migration, repository, model, seed, or recovery-ledger work | Lead Director |
| CRM-Q01 | Package safety | Build, validation, parity, and credential scans | Validate My CRM source and generated clients | BOS Operations Center |
| CRM-Q02 | Behavioral safety | Live manifest and server authorization | Verify absent tools fail closed, source partials remain visible, and no server writes occur during discovery/explain/cache | Cross-project |
| CRM-Q03 | Live acceptance | Host-managed OAuth | Test install, connect, context, discovery, reads, recovery, and resumed requests in launch hosts | Cross-project |

## Remaining release work

1. Register the exact ChatGPT/Codex app and record its assigned
   `plugin_asdk_app_*` ID before enabling the product.
2. Decide the initial launch clients and run generated-package acceptance for
   each one.
3. Run a live tool-discovery inventory against the deployed `crm` resource and
   record the source operations currently exposed.
4. Define identity confidence and field-authority policy for merged views and
   cross-source changes.
5. Define default freshness by dataset/source class and host-specific
   progressive-output adapters.
6. Validate which hosts provide exact token usage; label other results as
   estimates or unavailable.

## Separate commercial and developer efforts

Product licensing, Subscription Director, Stripe, marketplace monetization,
external developer packages, and third-party server integration contribution
remain independent workstreams. None participates in My CRM installation,
login, discovery, or execution for this release.
