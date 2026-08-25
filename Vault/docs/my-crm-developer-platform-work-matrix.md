# My CRM independent launch work matrix

Status: implementation complete; external host registration and live acceptance pending
Date: 2026-08-25
Owners: BOS Operations Center and Lead Director

## Operating decision

My CRM proceeds as an independent product effort under the same current access
model as the existing BOS runtime products. The initial path has no product
license, fee, Stripe, checkout, Subscription Director lookup, or entitlement
dependency.

The work is organized as parallel owning surfaces. Rows describe peer efforts
and their direct contracts; they are not a hierarchy. Future licensing and the
external developer marketplace remain separate projects and do not block My
CRM.

## Implementation snapshot

The repository implementation now contains the My CRM product manifest, approved
brand asset, provider-neutral skill group, shared federated-query helper,
freshness-aware cache protocol, explain planning, execution-event ledger, and
explicitly scoped usage reporting. Lead Director now owns the corresponding
source catalog, provider-neutral record CRU operations, per-source query
overrides, federated search, plan/apply synchronization, durable per-source
operation state, and reconciliation.

The public CRM tools are:

- `crm_list_sources`, `crm_search_records`, and `crm_explain_query`;
- `crm_get_record`, `crm_create_record`, and `crm_update_record`;
- `crm_plan_sync`, `crm_apply_sync`, `crm_get_operation_status`, and
  `crm_reconcile_operation`.

GoHighLevel contact search now uses the canonical tenant-bound platform provider.
Lead Director, Gmail, Calendar, GoHighLevel, and Calimatic source operations are
composed only after their own current plugin, role, grant, provider-health, and
source-operation authorization succeeds. Client-side stale cache results are
withheld until refresh unless an explicit stale-on-refresh-error policy permits
the fallback.

The My CRM product remains release-disabled until the exact ChatGPT plugin is
created through the OpenAI Platform and its assigned `plugin_asdk_app_*` ID is
recorded. That identifier is external configuration rather than application
code. Marketplace submission and production deployment remain separate release
actions.

## Current user path

```text
Install My CRM
  -> host loads CRM skills
  -> Connect / Sign in to BOS
  -> BOS OAuth authenticates the user
  -> Lead Director resolves or onboards an authorized CRM context
  -> client discovers the context-permitted CRM tools
  -> skills call /mcp/apps/leaddirector/crm
  -> Lead Director uses enabled provider integrations
```

No commercial service participates in this path.

## Work matrix

| ID | Independent surface | Verified existing foundation | Work required for My CRM | Direct dependency | Owner |
|---|---|---|---|---|---|
| CRM-P01 | Product identity | The approved 1024×1024 Lead Director CRM mark is stored at `products/my-crm/assets/lead-director-crm-logo.png`; versioned product manifests and generated host packages exist | Add `products/my-crm/product.json`, bind both logo fields to the approved asset, add descriptions and prompts, and declare `application_name: leaddirector` and `mcp_group_name: crm` | Approved product/route binding | BOS Operations Center |
| CRM-P02 | Canonical CRM skill source | `source/platform/`, `source/capabilities/`, and deterministic include composition exist | Add provider-neutral `source/capabilities/my-crm/` entry, record, pipeline, activity, and federation skills; keep source orchestration in shared platform skills | Public MCP schemas and federated execution contract | BOS Operations Center |
| CRM-P03 | Client generation | Claude, Codex, Copilot, and Gemini generators and validators exist | Declare launch clients, generate packages, validate parity, and publish through each selected marketplace path | Product manifest and skills | BOS Operations Center |
| CRM-P04 | ChatGPT/Codex binding | Active runtime products support registered `.app.json` bindings | Register the CRM resource and record its stable `plugin_asdk_app_*` ID before activating Codex distribution | Exact `/leaddirector/crm` resource | BOS Operations Center + OpenAI configuration |
| CRM-P05 | Federated-query platform skill | BOS MCP client already owns context, discovery, recovery, continuation, and shared cache helpers | Add `bos-federated-query` for explain planning, source selection, freshness enforcement, per-source execution, progressive aggregation, execution ledger, and usage reporting | Revisioned source catalog and normalized result envelope | BOS Operations Center |
| CRM-P06 | Cache-maintenance platform skill | Authority-scoped content-addressed cache, incremental synchronization, leases, and atomic publication exist | Add configurable maximum-age policy, inspect/refresh/clear/compact operations, invocation-time freshness checks, and human-readable local freshness labels | Shared cache protocol | BOS Operations Center |
| CRM-M01 | Named MCP group | `/mcp/apps/leaddirector/crm` and alias/isolation tests exist | Treat this as the My CRM server resource; add explicit annotations and the customer-facing semantic tool set | Lead Director runtime | Lead Director |
| CRM-M02 | Current native CRM tools | Lead search/get/create exist; update is declared but disabled | Complete an approved editable-field update PO or omit update promises; keep provisioning retry outside normal My CRM skill workflows | PO/GO contracts | Lead Director |
| CRM-M03 | Federated CRM tools | Federation service, persistence, executor, and adapter framework exist | Add source listing, normalized contact search/get/create/update, activity timeline, and reconciliation plan/apply operations to the `crm` group | Provider capability verification | Lead Director |
| CRM-M04 | Partial federated reads | Provider adapters and normalized records exist | Return a per-source result envelope that preserves successful results, identifies failures and coverage, and supports client-side progressive aggregation | Federated query contract | Lead Director |
| CRM-M05 | Cross-source consistency | Versioned plans, locking, idempotency, audit, and per-target success/failure capture exist | Persist per-source pending, committed, failed, uncertain, recovery-scheduled, and reconciled states; add bounded retry, compensation where supported, and reconciliation status | Durable GO recovery ledger | Lead Director |
| CRM-A01 | Canonical authorization | OAuth grant, opaque contexts, app membership, roles, plugin grants, and group filtering exist | Enable `crm` for the intended customer Lead Director installation templates and roles | App graph configuration | Lead Director |
| CRM-A02 | Existing-user connection | Current OAuth resolves already provisioned organizations and contexts | Verify install -> Connect -> context -> discovery -> request continuation for each launch host | CRM group enabled | Lead Director + BOS Operations Center |
| CRM-A03 | New-user onboarding | Governed organization/application provisioning work exists separately; current auth expects pre-provisioned organization state | Add `application_onboarding_required` continuation and a PO/GO flow to create or join an organization, install Lead Director, assign a role, enable `crm`, and resume OAuth | Product access policy; no licensing dependency | Lead Director |
| CRM-I01 | Lead Director records | Native Lead Director federation adapter supports search/get/create | Define the customer-facing lead/contact projection and exact writable fields | CRM semantic schemas | Lead Director |
| CRM-I02 | GoHighLevel | Scoped contact get/create/update primitives and adapter exist | Add and verify tenant-scoped contact search, then expose GHL through federated CRM operations | Provider authorization and adapter tests | Lead Director |
| CRM-I03 | Gmail and Calendar | Provider plugins, recovery, and federated executor aliases exist | Add deterministic contact matching and a read-only CRM activity timeline; keep send/create behavior separately governed | Contact identity contract | Lead Director |
| CRM-I04 | Calimatic | Read adapter and cached roster paths exist | Add optional read-only customer/student context only where the installed plugin and role permit it | Source matching and provenance rules | Lead Director |
| CRM-I05 | Future CRM providers | OS plugin framework and provider binding model exist | Add Salesforce or another provider once as a server-side plugin/adapter with capability and conformance tests | Provider-specific API implementation | Lead Director/BOS service |
| CRM-Q01 | Security and tenancy | Context, group, raw-authority rejection, and provider-scope tests exist | Add My CRM cross-org, cross-context, plugin-allowlist, role-ceiling, and provider-account mismatch contracts | Final tool surface | Lead Director |
| CRM-Q02 | Mutation safety | Federation idempotency, plan, lock, audit, and source-version foundations exist | Verify search-before-create, stale-version handling, partial success, uncertain-result reconciliation, and bounded retries | Writable source coverage | Lead Director |
| CRM-Q03 | Package safety | Deterministic builds, source parity checks, and credential scans exist | Add My CRM manifest/source/client coverage and marketplace metadata tests | Generated packages | BOS Operations Center |
| CRM-Q04 | Live acceptance | Existing products use host-managed OAuth | Validate fresh install, first sign-in, reconnect, provider recovery, tool refresh, and resumed request in every launch client | Staging deployment and host registration | Cross-project |
| CRM-Q05 | Explain and usage evidence | Tool discovery and operation schemas expose enough information to form a static plan | Validate `explain` and `explain analyze` output, normalized parameters, selected skills/sources, cache decisions, timing, and explicitly scoped token usage | Platform execution skill and host telemetry | BOS Operations Center + Lead Director |
| CRM-Q06 | Progressive result behavior | MCP transport supports catalog subscription events; current tool calls complete as one response | Validate client-side per-source fan-out and ordered execution-ledger events now; add server-side tool progress only through a later portable transport contract | Host parallelism with sequential fallback | Cross-project |

## Commercial and developer workstreams

These remain peers outside the My CRM launch dependency chain:

| Workstream | Current relationship to My CRM |
|---|---|
| Product licensing | No calls, records, gates, or launch dependency. A future integration requires a separate architecture decision and migration plan. |
| Subscription Director | No participation in initial My CRM authentication, onboarding, connection, discovery, or execution. |
| Stripe | No My CRM product, price, checkout, webhook, or subscriber-state requirement. |
| External developer packages | Future distribution and monetization design; My CRM may serve as a first-party reference package after its product contracts stabilize. |
| Third-party server integrations | Future server-side plugin/adapter contribution model owned by the BOS service and Lead Director. |

## Delivery increments

### Package and connection bootstrap

- Bind product `my-crm` to the existing `leaddirector/crm` route.
- Ship the provider-neutral entry and record skills with Lead Director as the
  first connected source.
- Support search, get, and create using the currently implemented native tools.
- Complete marketplace installation, OAuth connection, context selection, and
  provider-independent acceptance tests.

### No-fee public onboarding

- Define whether a new login creates a new organization or joins an invited
  organization.
- Provision the Lead Director installation, CRM group, and initial role through
  the governed onboarding PO/GO path.
- Resume the interrupted OAuth connection after provisioning.
- Confirm that every branch remains free of license and payment calls.

### Federated CRM release

- Expand the CRM group to provider-neutral record and source operations with
  per-source, federated, merged-view, and synchronize-from modes.
- Add freshness-aware cache use, per-source parallel execution, progressive
  execution evidence, explain planning, and scoped usage reporting.
- Complete GoHighLevel search and the supported Lead Director update path.
- Add activity evidence and reconciliation only after identity/provenance and
  mutation contracts pass.
- Publish capability coverage so skills never promise unavailable provider
  behavior.

## Decisions required for implementation

1. Confirm product `my-crm` will bind to the existing MCP group `crm`.
2. Confirm the initial launch clients: Claude and ChatGPT/Codex, or all four
   currently generated client families.
3. Define the new-login organization path: create a new organization, accept an
   invitation, or offer both.
4. Define the initial Lead Director role and capabilities provisioned for a new
   My CRM organization.
5. Define the minimum public release: native Lead Director beta or federated
   Lead Director plus GoHighLevel.

None of these decisions requires a product-license or pricing decision.
