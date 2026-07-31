---
name: authentication-context-integrity
description: Preserve BOS authentication and execution context across login, app selection, organization selection, role selection, installed-app resolution, MCP calls, plugin configuration, provider authorization, sessions, and background work. Use for application-neutral auth, selector, OAuth, credential, or tenant-scope design and review.
---

# BOS Authentication Context Integrity

## Canonical context

Treat authenticated actor, tenant, organization, application, installation,
actor role, plugin, plugin execution role, provider credential, and customer
configuration as distinct validated dimensions.

## Workflow

1. Inspect the current entry, session, selector, and credential path.
2. Separate observed behavior from the intended platform contract.
3. Trace every context field from authenticated input to side effect.
4. Resolve installed-app and plugin scope from canonical records.
5. Derive plugin execution role from installed-app plugin metadata.
6. Resolve credentials by organization, installation, plugin, and credential
   name.
7. Fail closed when canonical scope or grant provenance is incomplete.
8. Add negative tests for actor-supplied authority, cross-tenant access,
   fallback credentials, and ambiguous context.

## Invariants

- User role authorizes the actor; plugin `run_as_role` governs execution.
- Request values select scope and require server validation.
- Customer configuration supplies context and never supplies authority.
- Provider credentials remain scoped to their installed app and plugin.
- Reconnect replaces the scoped grant and preserves application configuration.
- Background jobs carry the same validated scope as interactive operations.
- Advertise the stable BOS tool contract when the MCP process starts so clients
  that snapshot tools can complete authentication and recovery in one session.
  Before BOS authentication, every secured call fails closed. Collect the BOS
  credential only through the one-time loopback handoff, retain it only for the
  MCP session, and never place it in chat, write it, or echo it.
- When a domain call returns `authorization_required`, automatically complete
  the provider-specific recovery flow, verify it, and resume the original
  operation at most once.
- For OAuth providers, open the server-returned authorization URL, let the
  customer sign in directly with the provider, and poll the BOS transaction.
- For API-key providers, open the broker's one-time local credential handoff;
  BOS owns encrypted credential persistence. Never accept the key in chat.
