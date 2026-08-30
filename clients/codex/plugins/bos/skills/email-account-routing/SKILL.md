---
name: email-account-routing
description: Route email searches, thread reads, summaries, drafts, sends, and mailbox actions through the exact mailbox owner and tenant. Use whenever a BOS workflow names or implies email, Gmail, a mailbox, a message, or a thread.
---

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
