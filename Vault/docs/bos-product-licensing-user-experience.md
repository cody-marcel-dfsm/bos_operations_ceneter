# Existing BOS product access and no-fee licensing baseline

Status: proposed baseline; replaces the discarded automatic-license design
Date: 2026-08-16
Owners: BOS Operations Center, Lead Director, Subscription Director

## Scope

This document describes the products and access flow that exist today, then
identifies the smallest licensing layer required to represent their current
no-fee access in Subscription Director.

It intentionally excludes:

- My CRM product definition, pricing, licensing, and customer journey;
- third-party developer onboarding and monetization;
- a public BOS SDK or submission workflow; and
- paid-product acquisition design.

Those efforts begin only after the existing-product baseline is accepted.

## Controlling correction

License resolution is a read-only authorization decision.

If Subscription Director cannot find an applicable license, it returns
`license_missing`. The lookup performs no product creation, license creation,
license assignment, terms acceptance, checkout creation, or customer mutation.

License definition and license provisioning are separate workflows that occur
before a user's connection can be authorized.

## Existing product inventory

| Product | Package state | Runtime state | Current customer-access state |
|---|---|---|---|
| BOS | Active package of tenant-neutral skills | Skills-only; no MCP resource and generated authentication is `none` | Local package use; no BOS server connection through this product |
| Education Center | Active package, version `0.4.41` | Active named resource `/mcp/apps/leaddirector/education-center` with a real tool and provider allowlist | Current server-backed product and the primary no-fee access baseline |
| Video Ads | Source product exists, version `0.1.3` | Named resource is registered, but the server group currently exposes no tools | Release is disabled and excluded from generated marketplaces and customer artifacts |

Evidence:

- BOS is an active skills-only manifest in `products/bos/product.json:1-30`.
- Education Center is active and declares the Lead Director application and
  `education-center` group in `products/education-center/product.json:1-43`.
- Video Ads is disabled in `products/video-ads/product.json:1-32` and recorded
  in `clients/disabled-products.json:1-10`.
- Lead Director registers both groups, with Education Center's bounded tool and
  provider allowlists and an empty Video Ads group, in
  `backend/platform_orchestration/mcp_operational_profiles.py:113-206`.

The current operational no-fee path therefore starts with Education Center.
Video Ads enters the same model when its release and runtime group are enabled.
The skills-only BOS package requires a separate decision because it has no
server connection at which Subscription Director can enforce a license.

## Existing Education Center customer flow

### 1. Package installation

The customer installs BOS and Education Center through a Claude or Codex
marketplace. Installation places package-owned skills and immutable MCP
connection metadata in the host. It grants no organization access.

This behavior is documented in `README.md` and the generated client packages.

### 2. Connect / Sign in

The user selects **Connect** or **Sign in**. The host opens OAuth for the exact
Education Center MCP resource:

```text
https://dfsm.ai/mcp/apps/leaddirector/education-center
```

Codex reaches that resource through the registered app in
`clients/codex/plugins/education-center/.app.json`. Claude reaches it through
the runtime plugin's packaged connector; generated metadata records the
immutable resource and `claude_plugin` scope in `.bos-product.json`.

### 3. Existing BOS authorization resolution

Lead Director resolves an existing server-side authorization context. The
current eligibility query requires, among other controls:

- an active organization;
- an active installed application;
- an active, unrevoked installation grant;
- a matching actor and role;
- at least one plugin grant; and
- the requested `education-center` group in installed-app FSM metadata.

The repository enforces those conditions in
`backend/graph_orchestration/mcp_oauth_repository.py:430-471`.

The current Cherry Creek server seed explicitly enables the group through
`metadata.mcp_resource_groups = ["education-center"]` in
`backend/database/seeds/lead_director_cherry_creek_graph_data.json:16224-16231`.

### 4. OAuth request and grant

After resolving one canonical context, the existing OAuth service persists an
authorization request containing actor, organization, installation, installed
application, role, resource group, plugins, redirect, resource, scope, and PKCE
state. Approval consumes that request and issues a resource-scoped grant.

The current implementation is in
`backend/platform_orchestration/mcp_oauth_service.py:1161-1304`.

### 5. Runtime tool access

Lead Director verifies that the authenticated principal's installed application
still enables the Education Center group, then intersects its authorized plugin
operations with the resource group's fixed tool and provider allowlists. The
enablement check is in
`backend/platform_orchestration/agent_mcp_runtime.py:722-737`.

### 6. Provider authorization

Gmail, Calendar, Calimatic, Drive, and other provider grants remain separate.
A missing provider grant returns the existing BOS-hosted provider recovery
workflow after the product connection is authorized.

## What exists today as the access model

The current effective server access decision is:

```text
known named MCP product route
+ active BOS organization and installed application
+ active installation grant
+ actor/role membership
+ installed-app resource-group enablement
+ plugin grants and tool/capability allowlists
= product MCP access
```

Subscription Director and Stripe do not participate in that decision today.
There is no product license record attached to the current OAuth grant.

## Current Subscription Director and Stripe model

Subscription Director currently provides a separate subscription/payment
system:

- A Subscription Director organization can connect a Stripe Connected Account.
- It lists active Stripe Prices from that account and expands their Stripe
  Product identity.
- Its checkout API accepts a Stripe Price ID selected from that catalog.
- It creates recurring or one-time Stripe Checkout sessions on the connected
  account and applies the platform fee.
- Signed webhooks update subscriber/payment state.
- Subscriber state is keyed primarily by the Subscription Director
  organization and subscriber email or Google identity.

Relevant implementation:

- Stripe catalog serialization and listing:
  `backend/platform_orchestration/sd_stripe_service.py:382-445`.
- Current public request models and catalog endpoint:
  `backend/routers/ext_api.py:659-704` and
  `backend/routers/ext_api.py:1025-1041`.
- Connected-account checkout:
  `backend/platform_orchestration/sd_stripe_service.py:1218-1439`.
- Current subscriber classification:
  `backend/platform_orchestration/sd_dashboard_service.py:46-109`.

That system currently has no canonical mapping to Education Center, its MCP
resource, its installed application, or its existing no-fee access.

## Minimal no-fee licensing overlay for existing products

The first licensing layer adds four server-owned records to Subscription
Director:

| Record | Purpose |
|---|---|
| Licensed Product | Maps one Subscription Director product identity to the existing package name and immutable MCP application/group resource |
| License Definition | Defines the current no-fee license, applicable terms/version, duration, support/update rights, and exact license-subject type |
| Provisioned License | Explicitly assigned license for an eligible existing customer subject; includes status, effective dates, terms state, provenance, and provisioning event |
| License Decision | Immutable/auditable result of a read-only lookup for one product and one canonical subject |

The no-fee license has no Stripe Product, Price, Checkout Session, subscription,
or payment state. Its financial amount is zero, while its licensing state and
terms remain explicit.

### Product binding

The same logical product is represented in three repositories/services:

| Owner | Existing identity | Licensing addition |
|---|---|---|
| BOS Operations Center | `education-center` package manifest and generated client product | Stable licensing product key included in generated metadata |
| Lead Director | `leaddirector/education-center` resource group and installed-app enablement | Exact mapping from the resource group to the licensing product key |
| Subscription Director | No Education Center product record today | Licensed Product, no-fee License Definition, terms, and provisioned licenses |

These records reference one stable product identity. They remain separate
owners and do not import each other's runtime source.

### License subject

The lookup subject must come from the canonical BOS context already resolved by
OAuth. Candidate subject models include the installed application,
organization, installation grant, or user.

The first implementation must choose one exact subject type. Lookup cannot fall
through among subject types. Client packages and OAuth query parameters never
select the subject.

### Provisioning boundary

A license enters Subscription Director only through an explicit provisioning
workflow. Examples that require a later decision include:

- a controlled migration for existing eligible installed applications;
- an administrator/customer-onboarding action;
- an application-installation orchestration step; or
- a future purchase or marketplace event.

The licensing lookup invokes none of these workflows.

For the existing Education Center population, the rollout requires an explicit
inventory and provisioning migration before enforcement. Each created license
records the source installed application, license definition, effective state,
terms state, migration/provisioning event, and idempotency identity.

## Corrected existing-product connection with licensing

### Before customer connection

1. Education Center is configured as a Licensed Product in Subscription
   Director.
2. Its no-fee License Definition and governing terms are configured.
3. A separate authorized provisioning workflow assigns the appropriate license
   to the customer subject.

### During Connect / Sign in

1. The client begins the existing product-specific BOS OAuth flow.
2. BOS resolves the current canonical actor, organization, installation,
   installed application, role, resource group, and plugins.
3. BOS sends the stable product key and server-resolved subject to Subscription
   Director's read-only lookup.
4. Subscription Director returns one of these decisions:

| Decision | Meaning | BOS behavior |
|---|---|---|
| `active` | A provisioned license covers the exact product and subject and is currently usable | Continue the existing OAuth consent/grant flow |
| `terms_required` | A provisioned license exists and awaits acceptance of its configured terms | Present the terms workflow for that existing license; lookup again after acceptance |
| `license_missing` | No provisioned license matches | Deny the product connection; create nothing |
| `not_effective` | The license starts later or has ended | Deny and return the configured license-status guidance |
| `suspended` | The license or licensed product is suspended | Deny and return support/status guidance |
| `configuration_error` | Product binding, subject type, terms, or license state is malformed or ambiguous | Fail closed and alert operations |

5. BOS stores the verified license identity/decision with the authorization
   request or grant evidence.
6. Runtime revalidation checks the same provisioned license without issuing or
   changing it.

`license_missing` is an authorization result. It is not an acquisition trigger.

## User-visible behavior for the existing no-fee path

The normal customer experience remains close to the current flow:

- Install BOS and Education Center.
- Select **Connect**.
- Sign in and select the authorized BOS context.
- BOS verifies the already provisioned Education Center license.
- Accept the terms only when that provisioned license requires acceptance.
- Return to the host with the normal resource-scoped grant.
- Connect underlying providers separately when an operation requires them.

If the expected license was never provisioned, the user sees a precise
Education Center license-access error with a support or administrator path. The
system does not create a license, show a generic product catalog, or initiate
Stripe.

## Work required for the baseline

| Workstream | Existing | Addition |
|---|---|---|
| Product identity | Package and resource-group identities exist | Choose and propagate one stable licensing product key for Education Center |
| Subscription Director product configuration | Stripe/SD organization configuration exists | Add Licensed Product and License Definition records independent of Stripe |
| Terms | Application terms pages exist | Define versioned terms linkage and acceptance state for the provisioned license |
| License persistence | Subscriber/payment ledger exists | Add explicit product-and-subject-bound Provisioned License records |
| Provisioning | Current installed-app/resource-group enablement exists | Define a separate authorized no-fee license provisioning workflow and provenance |
| Migration | Existing Education Center customers already have BOS authorization state | Inventory eligible installations and provision licenses before enabling checks |
| OAuth | Canonical context resolution and grant issuance exist | Add read-only Subscription Director lookup after context resolution and before grant issuance |
| Runtime | Product/resource/tool authorization exists | Revalidate the exact license at defined grant/runtime boundaries |
| Failure behavior | OAuth and scope failures already fail closed | Add distinct license decisions and support guidance with no lookup-side mutation |
| Validation | Product, OAuth, route, and tenant tests exist | Add lookup purity, missing-license, migration, terms, suspension, and cross-product isolation tests |

## Rollout order

1. Freeze the Education Center licensing product key and exact subject type.
2. Add Subscription Director Licensed Product, License Definition, terms, and
   Provisioned License persistence.
3. Build and test the explicit provisioning mechanism separately from lookup.
4. Inventory current eligible Education Center installed applications.
5. Run an idempotent provisioning migration and reconcile every expected
   license.
6. Add the read-only license lookup to BOS OAuth in audit/shadow mode.
7. Compare lookup results with current successful OAuth contexts.
8. Resolve every mismatch before enforcement.
9. Enable fail-closed license enforcement for Education Center.
10. Add runtime revalidation and revocation behavior.
11. Repeat the process for Video Ads only when its product release and server
    capability group are enabled.

## Open decisions before implementation

1. Which existing canonical object owns the Education Center license: installed
   application, organization, installation grant, or user?
2. Which authorized workflow provisions a new no-fee license after the initial
   migration?
3. Who is permitted to accept the terms for an organization- or
   installation-scoped license?
4. Do current customers inherit already accepted application terms, or must
   their pre-provisioned licenses enter `terms_required`?
5. What runtime revalidation interval and revocation mechanism preserve
   availability while maintaining license enforcement?
6. How should the skills-only BOS package be licensed, given that it has no MCP
   server boundary?

My CRM applies this established product/license model only after these existing
product decisions are complete. Its license definitions, acquisition path, and
pricing remain a separate product-design effort. Developer experience follows
as a third, separate effort.
