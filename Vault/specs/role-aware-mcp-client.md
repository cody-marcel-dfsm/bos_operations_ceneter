# Role-Aware MCP Client Contract

**Status:** Implemented in canonical platform skills and generated client
packages; server deployment and live multi-role validation remain release gates.

## Purpose

Application runtime clients resolve role authority through `bos_get_context`.
They use the server-marked default role context unless the user explicitly
requests another available role, pass only its opaque `context_id`, and
preflight requested operations against that context's advertised capabilities.

Clients never infer authority from plugin `run_as_role`, role text, customer
configuration, or prompt instructions. A missing capability stops the client
operation, and the server repeats the same authorization check before any data
read or mutation.

Role administration begins with `bos_list_role_capabilities` when the selected
role advertises `bos.roles.read`. A requested change uses
`bos_update_role_capabilities` with the exact current revision and complete
replacement list. The selected role must also advertise `bos.roles.update`.
After an audited server success, clients refresh context and tool discovery.

## Authority model

The effective interactive authority is the intersection of:

1. the host-managed OAuth identity and BOS MCP resource;
2. the current BOS user and installed-app membership;
3. the selected assigned role and its explicit capabilities;
4. the installation and plugin grant ceiling;
5. the installed semantic operation contract; and
6. provider readiness for provider-dependent operations.

The server issues an opaque `context_id` for each currently assigned role. A
context is a selector for server state, not a portable credential. Role labels,
capability text, prompt instructions, organization IDs, installation IDs, and
plugin `run_as_role` values never create client authority.

## Default role and explicit downgrade

For a user with multiple assigned roles, every role declares an integer
`agent_authority_rank`. The unique largest rank is marked as the default.
Missing or tied ranks fail closed. List order, label text, and the number of
capabilities never imply authority.

The client uses the default unless the user explicitly asks to operate through
another returned role. An explicit downgrade uses only that role's opaque
context, applies to the current request, and never changes membership or the
saved default.

## Client workflow

1. Call `bos_get_context` before the first domain operation.
2. Select the server-marked default context or the explicitly requested
   available lower-role context.
3. Confirm the requested operation is present and invocable for that context.
4. Pass only `context_id` with the domain arguments defined by the tool.
5. Preserve that context for related calls in the active request.
6. Refresh context and live tool discovery after authorization, membership,
   role-capability, plugin, or connection changes.
7. After a denial or missing context, refresh once. Treat the repeated server
   result as authoritative.

Client preflight is a usability and request-filtering layer. The server repeats
membership, capability, grant, operation, tenant, and provider checks before
every data read or mutation and filters results through its canonical scope.

## Capability administration

`bos_list_role_capabilities` returns role intent, label, authority rank,
capability list, editability, and an optimistic revision for one authorized
installed app and requires the acting context to carry `bos.roles.read`.
`bos_update_role_capabilities` requires:

- an acting context carrying `bos.roles.update`;
- a target role that already exists;
- a complete replacement list of server-declared capabilities; and
- the exact revision returned by the preceding read.

The update changes only the target role's explicit capability list. It does not
change membership, authority rank, provider credentials, or another
installation. A revision conflict requires a fresh read and user resolution of
any material difference before retrying. After success, clients refresh
context and discovery before further operations. The server atomically records
the authenticated actor, acting role, target role, and before/after capability
lists in the installation audit; clients never manufacture or substitute that
audit evidence.

## Interactive and autonomous execution

Interactive OAuth execution uses the authenticated actor's selected assigned
role and actor user ID. FSM plugin `run_as_role` remains the execution identity
for callbacks, polling, background jobs, and autonomous service work. It never
elevates an interactive user and never selects provider credential ownership.

## Failure behavior

- Missing, stale, malformed, or ambiguous context fails closed.
- An operation absent from the selected context stops before invocation.
- A server denial after one refresh is reported as the current authorization
  result.
- Provider recovery remains scoped to the affected organization, installation,
  and plugin and never widens role authority.
- Clients never substitute another connection, role, tenant, or cached
  context to make an operation succeed.

## Packaging ownership

The canonical behavior lives in
`source/platform/authentication-context-integrity/SKILL.md` and
`source/platform/bos-mcp-client/SKILL.md`. Builds copy those contracts into the
Claude, Codex, Copilot, and Gemini products. Generated client copies are parity
artifacts and never independent editing surfaces.

Lead Director currently provides the reference server implementation. The BOS
client contract remains application-neutral and applies to every installed
subservice resolved through the BOS connection.
