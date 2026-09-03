# Role-Aware MCP Client Contract

**Status:** Implemented in canonical platform skills and generated client
packages; server deployment and live multi-role validation remain release gates.

## Purpose

Application runtime clients resolve organization and role scope through
`bos_get_context`. They select exactly one authorized organization first, use
that organization's server-marked default role unless the user explicitly
requests another available role, and pass only its opaque `context_id`.

Clients never infer authority from plugin `run_as_role`, role text, customer
configuration, a saved organization display label, or prompt instructions. A
saved organization preference selects only among contexts returned for the
current authenticated actor. The complete static tool catalog declares
operations and schemas without granting role authority; the server authorizes
the selected context when `tools/call` executes.

Role administration begins with `bos_list_role_capabilities` when the selected
role advertises `bos.roles.read`. A requested change uses
`bos_update_role_capabilities` with the exact current revision and complete
replacement list. The selected role must also advertise `bos.roles.update`.
After an audited server success, clients refresh context and operation status.

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

## Default organization and request override

`bos_get_context` may return role entries for several organizations. The
client selects an organization in this order:

1. an organization explicitly named in the current request;
2. the shared local `default_organization_label` preference after exact
   normalized matching to one returned organization; or
3. the sole returned organization when only one is available.

Several organizations with no current preference produce
`configuration_required` before any domain data call. A stale preference also
stops before execution. The client never treats role `is_default` markers as a
global organization default, never substitutes another organization, and never
fans out across organizations unless the user explicitly requests that scope.

The preference is OS-user client configuration shared by BOS-family packages.
It stores one display label and update time in a private platform-native file.
It contains no organization ID, context ID, role, token, credential, or grant
metadata. Every read revalidates the label against the current authenticated
context. An explicit organization override applies only to the current request
and does not rewrite the saved preference.

Product initialization establishes this preference after authentication and
before any organization-scoped plugin-settings inventory call. A sole returned
organization may be committed directly. When several organizations are
available and the preference is missing or stale, the product initializer
includes **Default BOS organization** in its consolidated recommendation and
commits the confirmed label through the shared helper before selecting the
organization's default role.

## Default role and explicit downgrade

For a user with multiple assigned roles inside the selected organization and
installed app, every role declares an integer `agent_authority_rank`. The
unique largest rank is marked as the default. Missing or tied ranks fail
closed. List order, label text, and the number of capabilities never imply
authority.

The client uses the default unless the user explicitly asks to operate through
another returned role. An explicit downgrade uses only that role's opaque
context, applies to the current request, and never changes membership or the
saved default.

## Client workflow

1. Call `bos_get_context` before the first domain operation.
2. Resolve exactly one organization from the explicit request, validated local
   default, or sole authorized organization.
3. Within that organization, select the server-marked default context or the
   explicitly requested available lower-role context.
4. Confirm the requested operation exists in the static catalog and validate
   arguments against its schema without treating presence as authorization.
5. Pass only `context_id` with the domain arguments defined by the tool.
6. Preserve that context for related calls in the active request.
7. Refresh context after authorization, membership, role-capability, plugin, or
   provider changes. Refresh tool discovery only after connection, transport,
   package, or server schema changes.
8. After a denial or missing context, refresh once. Treat the repeated server
   result as authoritative.

Client preflight is a schema and context-selection layer. The server performs
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
context and operation status before further operations. The server atomically records
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
- A missing, stale, unavailable, or ambiguous default organization stops before
  a domain data call when more than one organization is available.
- An operation absent from the static catalog is a schema/publication defect;
  it is never evidence that the selected context lacks authority.
- A server denial after one refresh is reported as the current authorization
  result.
- Provider recovery remains scoped to the affected organization, installation,
  and plugin and never widens role authority.
- Clients never substitute another connection, role, tenant, or cached
  context to make an operation succeed.
- Clients never query every accessible organization unless the current request
  explicitly asks for bounded cross-organization scope.

## Packaging ownership

The canonical behavior lives in
`source/platform/authentication-context-integrity/SKILL.md` and
`source/platform/bos-mcp-client/SKILL.md`. The shared preference implementation
lives in `source/platform/bos-mcp-client/scripts/client-preferences.mjs`.
Builds copy those contracts into the Claude, Codex, Copilot, and Gemini
products. Generated client copies are parity artifacts and never independent
editing surfaces.

Lead Director currently provides the reference server implementation. The BOS
client contract remains application-neutral and applies to every installed
subservice resolved through the BOS connection.
