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
3. Route every BOS-managed mailbox through the active product connection whose
   scoped grant owns its provider credential.
4. Keep source and destination mailboxes independent in cross-business work.
   Retrieve through the source owner and draft, send, archive, label, or mutate
   through the destination owner.
5. Stop when identity, tenant, provider readiness, or mailbox ownership cannot
   be verified. Report the requested mailbox and the missing readiness state.

## Message content and attachments

1. Search the authorized mailbox and read the exact thread before selecting
   message content. Use the returned thread, message, and attachment references;
   never construct or alter provider identifiers.
2. Answer from the message body when the requested information is already in
   the thread. When the person needs a file, image, document, or other attached
   content, resolve the callable BOS MCP `gmail_get_attachment` operation through
   the current host catalog and invoke its advertised schema with the exact
   `thread_id`, `message_id`, and `attachment_id` from that thread. This MCP
   compatibility operation supplies the native embedded resource.
3. If several attachments could satisfy the request, identify them by
   provider-derived filename and MIME type and ask the person to select one.
   Continue directly when the request identifies exactly one attachment.
4. Present that returned embedded resource as the downloadable result. Preserve
   its server-derived filename and MIME type, and report its byte size and
   SHA-256 digest when verification helps. The separate discovered HTTPS
   attachment-read operation returns raw binary bytes; use it only when the
   host has a verified native file-delivery action for those bytes. Never claim
   raw bytes alone are an embedded downloadable resource.
5. Treat attachment bytes as ephemeral response content. Never copy them into
   BOS persistence, logs, caches, prompts, or a signed URL. Respect the
   operation's published size limit and typed failure.
6. For a link to a separately authorized Drive file or another provider
   resource, use that provider's discovered read operation after the person
   requests the linked resource.

Use the BOS mailbox operation directly. A browser session or separate browser
sign-in is outside this routing path.

Never infer another direct mailbox from browser state, an email domain, a local
credential, or a connector used by a different tenant. Read-only searches may
proceed when authorized. Sending, deleting, archiving, labeling, or changing
mailbox state requires clear user intent and the owning route.
