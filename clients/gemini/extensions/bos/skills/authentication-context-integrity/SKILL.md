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
- Expose BOS as a remote HTTPS Streamable HTTP MCP server. Authenticate with the
  client-configured `BOS_API_KEY` Bearer header only. Every secured call fails
  closed when that key is missing or invalid, and the service never offers a
  second BOS password or login flow.
- Advertise only the tools allowed for the resolved endpoint, tenant,
  installation, plugin, and execution role. Administrative tools remain absent
  from customer product profiles.
- When a domain call returns `authorization_required`, automatically complete
  the provider-specific recovery flow, verify it, and resume the original
  operation at most once.
- For OAuth providers, open the server-returned authorization URL, let the
  customer sign in directly with the provider, and poll the BOS transaction.
- For API-key providers, open the short-lived BOS-hosted HTTPS
  credential-collection URL returned by the service. BOS owns validation and
  encrypted credential persistence. Keep the key out of chat and client files.
