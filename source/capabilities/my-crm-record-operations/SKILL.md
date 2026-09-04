---
name: my-crm-record-operations
description: Search, inspect, create, update, and manage CRM records through provider-neutral My CRM operations while preserving source identity, versions, duplicate checks, and provider transaction guarantees.
---

# My CRM Record Operations

Use `my-crm` for routing and the authenticated BOS MCP connection for
authentication and installed-app discovery. Lead Director's discovered CRM
service owns each business operation and source execution.

## Reads

1. Discover the app-owned provider-neutral CRM record operation and compile one
   normalized record query from its current schema. For explicit source scope,
   validate the exact `lead-director-crm-sources/v1` inventory returned by the
   discovered `crm.sources.list` operation first.
2. Omit source selection for all enabled and authorized sources, or pass one or
   more exact opaque handles returned by current service discovery. Invoke the
   operation once and preserve its server-returned source results and errors.
3. For `merged_view`, present the service's returned federated records. Keep
   its match confidence, field-level provenance, and conflicts unchanged.
4. Render origin, last update in local time, age, maximum age, and coverage.
5. For one exact record, select `crm.records.get` only from the discovered
   service. Send `{recordHandle}` using the opaque handle returned by the
   current search or get response. Accept only
   `lead-director-crm-get/v1` for the same context, authority epoch, service,
   and requested record handle.

## Creates and updates

1. Resolve the exact current source descriptor from the validated
   `lead-director-crm-sources/v1` inventory and verify that it is `ready`
   and advertises the requested provider-neutral capability. Select
   `crm.records.create` or `crm.records.update` only from the discovered
   service. Require the discovered operation to advertise its exact HTTP
   method, `sideEffect: write`, and `idempotent: true`.
2. Request the service's duplicate check before create when a stable identity
   value exists and the live contract advertises one.
3. For create, send exactly `{sourceHandle, changes, idempotencyKey}`. For
   update, send exactly `{recordHandle, expectedVersion, changes,
   idempotencyKey}`. Use the current server-returned version and accept only
   provider-neutral change fields declared by the live schema.
4. Present the sanitized request shape and fields, then require explicit user
   confirmation bound to the deterministic confirmation identity. Confirmation
   expires when context, discovery epoch, service contract, source, record
   version, or changes differ.
5. Invoke the discovered service operation once. Accept only
   `lead-director-crm-mutation/v1` for the same context, authority epoch,
   service, source, and operation. Report the server receipt and
   `underlying_source_guarantee` without strengthening it.
6. Invalidate or refresh affected query caches after a confirmed commit.

Use multi-source synchronization only through `my-crm-federation-operations`
and only as one server-orchestrated provider-neutral operation.
Invoke delete only when a discoverable server operation explicitly supports it
and the user confirms the exact destructive target. The initial My CRM server
surface may omit delete.
