---
name: use-bos
description: Use the single tenant-neutral BOS MCP for DFSM, ISM, iCode, Cherry Creek, Lead Director, and other BOS-managed business operations.
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
6. When BOS authentication is required, ask once for the BOS credential, call
   `bos_authenticate`, discard the supplied value, and call `bos_get_context`.
7. When a domain call returns `authorization_required`, preserve its original
   operation ID and follow the returned authorization type automatically:
   - OAuth: open the returned URL, let the customer sign in directly with the
     provider, and poll `bos_get_authorization_status` with the exact returned
     scope.
   - Secret input: ask once for the required API key or token and immediately
     call `bos_set_provider_credential`; never echo or persist the value.
8. Verify the recovered authorization and call `bos_resume_operation` once.
   Stop if authorization or that single retry fails.

iCode skills may interpret iCode workflows and queries. They still execute
through the same `bos` MCP with explicit server-returned context.
