---
name: email-account-routing
description: Route email searches, thread reads, summaries, drafts, sends, and mailbox actions through the exact mailbox owner and tenant. Use whenever a BOS workflow names or implies email, Gmail, a mailbox, a message, or a thread.
---


## Organization scope preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context`. Select exactly one authorized
organization in this order: an organization explicitly named in the current request;
the shared `default_organization_label` after exact normalized validation against
the returned organization labels; or the sole authorized organization. Read and
validate the saved label with
`../bos-mcp-client/scripts/client-preferences.mjs`. For tools whose live schema
requires a context selector, pass only the selected role's opaque `context_id`.
Never add organization or context arguments to an operation whose schema derives
scope from the authenticated server context.
Use this same selection for BOS installed-app discovery. Pass only the opaque app
context and API authority returned under that selection to a discovered app MCP
or deterministic HTTPS API; never reconstruct or substitute raw authority IDs.

When several organizations are available and the default is missing, stale, or
ambiguous, return `configuration_required` and resolve one default before domain
execution. An organization named for the current request overrides the selection
and does not rewrite the saved default. Never fan out across organizations unless
the user explicitly requests that bounded scope. The display-label preference selects among
current server-returned contexts and never grants authority.

# Email Account Routing

Resolve the requested mailbox before selecting a connector. Mailbox ownership,
authenticated identity, tenant scope, and mutation authority control the route;
business purpose alone never does.

## Routing workflow

1. Read the active product settings and call `bos_get_context` when BOS scope is
   needed. Treat configured mailbox routes as data, never as packaged defaults.
2. If the user explicitly names a separately connected mailbox, use that
   connector only after its authenticated identity matches the request.
3. Route every BOS-managed mailbox through the root BOS connection and the
   server-issued context that owns its provider credential.
4. Keep source and destination mailboxes independent in cross-business work.
   Retrieve through the source owner and draft, send, archive, label, or mutate
   through the destination owner.
5. Stop when identity, tenant, provider readiness, or mailbox ownership cannot
   be verified. Report the requested mailbox and the missing readiness state.

Never infer another direct mailbox from browser state, an email domain, a local
credential, or a connector used by a different tenant. Read-only searches may
proceed when authorized. Sending, deleting, archiving, labeling, or changing
mailbox state requires clear user intent and the owning route.
