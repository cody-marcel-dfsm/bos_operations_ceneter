# BOS product platform staged work matrix

Status: reset after licensing design correction
Date: 2026-08-16
Owners: BOS Operations Center, Lead Director, Subscription Director

## Required sequence

The efforts remain separate and proceed in this order:

1. Document and preserve the products and customer-access model that exist.
2. Add explicit no-fee licensing to the existing server-backed product path.
3. Apply the established product/license model to My CRM and decide My CRM's
   separate product, pricing, and acquisition strategy.
4. Design the local developer experience and later monetization experience as a
   separate platform effort.

This document records the boundaries and current work. It does not define My
CRM pricing or the external developer workflow.

## Stage 0 — verified current product model

| Surface | BOS Operations Center | Lead Director | Subscription Director |
|---|---|---|---|
| BOS | Active skills-only package; no MCP resource | No BOS-package product route | No BOS license representation |
| Education Center | Active package and generated Claude/Codex connection | Active `leaddirector/education-center` group with tool/provider allowlists; customer enablement comes from installed-app FSM, roles, and plugin grants | No Education Center product/license mapping |
| Video Ads | Source manifest exists; release disabled and excluded from clients | Named group exists with no current tool/provider surface | No Video Ads product/license mapping |
| Customer installation | Native marketplace installs package files and immutable connection metadata | Installation grants no organization access; OAuth resolves an existing server-side app/installation/role/group context | No participation today |
| Product connection | Host starts product-specific OAuth | Resolves canonical context, records consent, issues resource-scoped grant, enforces group/tool/plugin scope | No participation today |
| Provider connection | Client receives server-created recovery instructions | Owns provider grants and credential recovery | No participation |
| Stripe | No payment implementation in product packages | Hosts Subscription Director implementation in the current codebase | Connected-account catalog, checkout, fees, webhooks, and subscriber state exist independently of BOS product access |

The controlling detail is in
`Vault/docs/bos-product-licensing-user-experience.md`.

## Stage 1 — existing Education Center no-fee license path

### Invariants

- A no-fee license is a real, product-specific license with configured terms.
- License provisioning and license lookup are separate operations.
- Lookup is read-only and never creates, assigns, renews, or changes a license.
- Missing license returns `license_missing` and denies access.
- Product installation, BOS authorization, license authorization, and provider
  authorization remain separate events.
- Stripe does not participate in the existing no-fee path.

### Work matrix

| ID | Surface | Existing | Work required | Owner |
|---|---|---|---|---|
| BASE-01 | Stable licensing product identity | `education-center` package and `leaddirector/education-center` resource exist | Choose one licensing product key and validate the package/resource/Subscription Director mapping | Cross-project contract |
| BASE-02 | Licensed Product record | Absent | Add an Education Center product representation to Subscription Director independent of Stripe Product objects | Subscription Director |
| BASE-03 | No-fee License Definition | Absent | Define terms/version, effective policy, duration, support/update rights, and exact subject type | Subscription Director/product owner |
| BASE-04 | Provisioned License | Payment-oriented subscriber rows exist; no BOS product license | Add durable product-and-subject-bound licenses with status, provenance, terms state, and effective dates | Subscription Director GO |
| BASE-05 | Provisioning workflow | Existing installed apps and resource-group enablement exist | Define an explicit authorized workflow that provisions no-fee licenses; keep it outside lookup | Subscription Director PO + owning onboarding/admin flow |
| BASE-06 | Existing-customer migration | Existing Education Center OAuth contexts identify eligible customers | Inventory, provision, and reconcile licenses idempotently before enforcement | Cross-project migration |
| BASE-07 | License lookup | Absent | Add server-authenticated, read-only exact lookup returning normalized decisions | Subscription Director API |
| BASE-08 | OAuth license gate | OAuth resolves canonical context and issues grants | After context resolution, call lookup with product and server-resolved subject; issue grant only for `active` | Lead Director OAuth platform |
| BASE-09 | Terms acceptance | Static application terms exist | Allow acceptance only for an already provisioned `terms_required` license and record actor/version evidence | Subscription Director PO/GO |
| BASE-10 | Runtime enforcement | Resource/group/tool checks exist | Revalidate the same provisioned license at approved grant/runtime boundaries | Lead Director MCP platform |
| BASE-11 | Failure/recovery | OAuth, scope, and provider errors are distinct | Add `license_missing`, `terms_required`, `not_effective`, `suspended`, and `configuration_error` outcomes | Lead Director + Subscription Director |
| BASE-12 | Shadow rollout | Absent | Compare license decisions with successful existing OAuth contexts before fail-closed enforcement | Cross-project operations |
| BASE-13 | Validation | OAuth, route, resource-group, tenant, and Stripe tests exist | Add lookup-purity, provisioning, migration, terms, missing-license, suspension, revocation, and isolation contracts | All owners |

### Exit gate

Every expected Education Center customer has an explicitly provisioned and
reconciled no-fee license before enforcement. OAuth lookup is mutation-free.
Missing licenses fail closed. Existing provider and tenant boundaries remain
unchanged.

## Stage 2 — My CRM product application

Status: deferred until Stage 1 contracts and user experience are accepted.

My CRM will receive its own:

- product identity and named MCP group;
- skill grouping and client package;
- service-capability composition;
- License Definition and license-subject decision;
- acquisition and pricing strategy; and
- rollout and customer journey.

The existing Education Center baseline supplies the established mechanics for
product identity, pre-provisioned license lookup, terms, OAuth enforcement, and
runtime validation. It does not decide whether or how My CRM licenses are
provisioned or purchased.

No My CRM pricing, Stripe binding, no-fee assumption, or acquisition workflow is
approved in this matrix.

## Stage 3 — external developer experience

Status: deferred until the existing product model and My CRM application are
understood.

Controlling requirements already captured:

- A developer can install BOS and immediately write, run, and test a normal
  client-side plugin from an independently owned local repository.
- Local development requires no publisher registration, human approval, server
  route creation, or invented capability identifiers.
- No published external BOS SDK exists today.
- Client skills can use only the tools actually exposed by their installed BOS
  MCP connection; server-side authorization remains authoritative.
- Public distribution, publisher identity, monetization, and third-party
  server integrations are distinct later workflows.

The developer workflow will be designed from the real local BOS/plugin behavior
after Stages 1 and 2, rather than inferred from a hypothetical marketplace.

## Open baseline decisions

1. What canonical subject owns the current Education Center license?
2. What explicit existing or new administrative/onboarding action provisions a
   no-fee license after the migration?
3. Which terms apply, and who may accept them for that subject?
4. How is the skills-only BOS package treated when it has no MCP enforcement
   boundary?
5. When Video Ads is re-enabled, does it reuse the same subject and provisioning
   pattern or define a different License Definition?

These questions belong to the existing-product licensing baseline. My CRM and
developer monetization begin after they are answered.
