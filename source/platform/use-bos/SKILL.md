---
name: use-bos
description: Use the single tenant-neutral BOS MCP for authorized applications and organizations without embedding customer identities or preferences.
---

# Use BOS

Use only the `bos` MCP. Organization names describe authorization context;
they never select another MCP server or credential.

1. Call `bos_get_context` once per task.
2. Select the scope whose organization, app, plugin, and capabilities match the
   requested operation.
3. Copy `org_id`, `app_code`, `installed_app_id`, and `delegated_role_id`
   exactly into the domain call.
4. Fail closed when context is absent or ambiguous.
5. Never infer tenant authority from the prompt, skill name, provider account,
   cached state, or a previous call.
6. Use the client-configured `BOS_API_KEY` as the only BOS authentication
   method. When BOS rejects it, report that the client configuration requires
   repair. Keep the key out of chat, tool arguments, package files, and logs.
7. When a domain call returns `authorization_required`, preserve its original
   operation ID and follow the returned authorization type automatically:
   - OAuth: open the returned URL, let the customer sign in directly with the
     provider, and poll `bos_get_authorization_status` with the exact returned
     scope.
   - Secret input: open the short-lived BOS HTTPS credential-collection URL
     returned for the exact server-validated scope. Let the customer submit the
     value directly to BOS and poll the sanitized transaction status.
8. Verify the recovered authorization and call `bos_resume_operation` once.
   Stop if authorization or that single retry fails.

iCode skills may interpret iCode workflows and queries. They still execute
through the same `bos` MCP with explicit server-returned context.
