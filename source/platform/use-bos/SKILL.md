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

iCode skills may interpret iCode workflows and queries. They still execute
through the same `bos` MCP with explicit server-returned context.
