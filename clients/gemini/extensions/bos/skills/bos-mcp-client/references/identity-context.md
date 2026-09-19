# BOS identity context compatibility — v1

This versioned compatibility branch applies only when live `bos_get_context`
returns `contract_version: bos-identity-mcp/v2` and the host exposes
`bos_list_context_tools` and `bos_execute`. It takes precedence over legacy
single-grant wording in domain and control-plane workflows. Legacy discovery
retains its exact grant boundary and never gains multi-context authority.

## Setup and customer defaults

One OS user's BOS-family clients share the customer-owned preference file
managed by `scripts/customer-preferences.mjs`: macOS Application Support/BOS,
Windows AppData/BOS, or Linux XDG config/BOS. This file lives outside managed
plugin caches. Read it with the helper's `read` command. It contains only
`bos.customer-preferences/v1` and `default_context` matching preferences:
`organization_name`, optional `installation_name`, optional `role_code`.
`role_code` matches a currently returned `actor_role_id` as intent only.
No setting grants access, and account changes require fresh authorized matching.

During product setup, propose the default from current authorized discovery and
confirmed customer information. Include it in the consolidated recommendation.
Ask once when no confirmed default exists; preserve existing confirmed values.
Confirm installation or role only when needed to resolve multiple contexts.
Never infer the most privileged role. After confirmation, use the helper's
`save` command with the preference JSON on standard input and re-read it. Product
upgrades preserve this external file. Product-specific customer overlays may
mirror the preference for setup; the shared store is authoritative for runtime.
Repair conflicting mirrors from the shared confirmed value. If only a confirmed
valid overlay mirror exists, restore the shared store after fresh authorized
matching without asking again. Never silently
promote organization display text or a one-request selection to a saved default.

For BOS without a product initializer, establish this preference through
`bos-mcp-client` during setup or the first unscoped business request. Read it in
every ordinary workflow; a valid default needs no repeat organization question.
Control-plane status may use an explicit request without initializing unrelated
product fields. If persistence is unavailable, retain the explicit scope for the
current request and report that saving the default remains incomplete.

The reader also accepts the previously confirmed `bos-client-preferences/v1`
file when the new file is absent. It reads the historical platform-native
`ai.dfsm.bos/client-preferences/v1/preferences.json` path (Windows:
`DFSM/BOS/client-preferences/v1/preferences.json`) or its absolute
`BOS_CLIENT_PREFERENCES_DIR` override. It converts only the confirmed organization
label in memory, leaves the legacy file untouched, and still requires fresh
live authorized matching. Reuse that organization without asking again; resolve
any remaining installation/role ambiguity separately. Invalid or unauthorized
legacy values require repair and never trigger silent fallback.

## Resolve and execute

1. Call live `bos_get_context` and retain its authorized contexts in memory.
2. Match requested application and explicit organization/installation/role first.
   An explicit context request replaces all saved context fields for that task.
   Otherwise match the shared confirmed default. With no default, use an exact
   previously established scope for the pending request or the sole authorized
   context; establish the persistent default separately during setup.
3. Use `scripts/context-selection.mjs`'s `resolveContext` when executable, or
   apply its exact matching rules. Organization/installation labels allow trim
   and case normalization. Require one exact context; clarify duplicate labels,
   multiple installations or roles. Never choose by list order, privilege rank,
   a person's name, or probing business records across organizations. A removed
   or unauthorized default produces `default_context_unavailable`; ask for an
   authorized replacement, without silent fallback or changing grants.
4. Pass only the fresh returned `context_handle` to `bos_list_context_tools`.
   Require its response to bind the same handle. Discover the requested operation
   independently, including deletion. A top-level description mentioning CRUD
   cannot establish that a specific operation is available in this context.
5. Call `bos_execute` with that handle, the exact discovered `tool_name`, and
   business `arguments` validated against the current operation schema. Keep
   raw org/app/install/role IDs out of business arguments. Verify the returned
   context matches the selected context before using the result. The server
   reauthorizes every operation; discovery and preferences confer no authority.
6. Preserve the selected scope with approvals, versions, idempotency, caches and
   recovery. Refresh handles after context changes; never persist handles as
   defaults. Keep concurrent requests independent. A denial or missing operation
   never permits another role or organization as a workaround.

An unavailable optional plugin-profile setup surface leaves that setup
incomplete. It does not block an independently advertised ready operation whose
live contract declares no dependency on it. Operation-specific readiness and
explicit denials remain binding. Never invent setup tools or recurse into setup.

No reconnect is required solely to select another currently authorized context.
Missing/expired/revoked identity authorization retains native BOS recovery.
Provider recovery and all mutation confirmation/receipt rules remain in force.
