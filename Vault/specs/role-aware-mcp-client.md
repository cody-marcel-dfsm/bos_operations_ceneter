# Role-Aware MCP Client Contract

Application runtime clients resolve role authority through `bos_get_context`.
They use the server-marked default role context unless the user explicitly
requests another available role, pass only its opaque `context_id`, and
preflight requested operations against that context's advertised capabilities.

Clients never infer authority from plugin `run_as_role`, role text, customer
configuration, or prompt instructions. A missing capability stops the client
operation, and the server repeats the same authorization check before any data
read or mutation.

Role administration begins with `bos_list_role_capabilities`. A requested
change uses `bos_update_role_capabilities` with the exact current revision and
complete replacement list. The selected role must advertise `bos.roles.update`.
After success, clients refresh context and tool discovery.
