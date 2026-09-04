---
name: manage-customer-extension
description: Create, inspect, validate, or update a customer-owned extension of an installed packaged skill. Use when a user asks to update, customize, override, specialize, or change a skill for their tenant, organization, location, or customer while preserving package upgrades and BOS authority boundaries.
---



## Product initialization preflight

Before performing this skill's workflow, preserve the pending request and
complete the product's host-managed BOS authentication. Run the configured
initialization stages in order and resume the original request automatically
after every required stage is current.

First validate the customer-owned `config/customer-settings.json` against
`config/customer-settings.template.json`. Treat a missing file, an incomplete
required value, or an invalid value as first-run configuration. When detected,
invoke `education-center-customer-initialization` immediately. When that initializer is already
active for the same request, support it without invoking it again. Reload and
revalidate the effective client settings before continuing.

After client settings are current, validate the selected organization's live
plugin-service inventory, organization business profile initialization epoch,
required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, the server schema changed,
or the active request exposes a service-routing mismatch. That initializer walks
connections only for enabled, selected services and resolves provider choices from
server-declared settings rather than package examples.
Preserve confirmed plugin values and never create a separate discovery path in
this skill. Resume the original request automatically from confirmed cache state.

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

# Manage Customer Extension

Apply customer changes through a typed extension. Keep the packaged base skill
immutable.

## Storage model

- `config/customer-settings.json` is the preserved product-wide tenant
  settings overlay. `config/customer-settings.template.json` is its
  package-owned schema and defaults.
- `skills/<base-skill>-<tenant-key>/.bos-extension.json` is a customer-owned
  per-skill override manifest. Its sibling `SKILL.md` composes the packaged
  base skill with the typed overrides.
- A BOS-managed Codex product is a real directory under
  `~/.agents/bos-education-center-marketplace/plugins/<product>/`.

Keep product settings and per-skill extensions labeled separately.

## Workflow

1. Resolve the installed product, base skill, and customer key from the request
   and current client context. Ask one concise question when any selector is
   ambiguous.
2. Classify the request into `terminology`, `defaults`, `policies`, or
   `exceptions`. Treat a request explicitly intended for every customer as a
   canonical product change and route it to the owning source repository.
3. Locate the product root from the loaded skill path and resolve the extension
   root in this order:
   - When `<product-root>/.bos-package-state.json` exists, use
     `<product-root>/skills`. This is the BOS-managed Codex installation path
     (normally
     `~/.agents/bos-education-center-marketplace/plugins/<product>/skills`)
     and the installer preserves its customer-owned extensions.
   - Otherwise use an existing host-native scope: Codex `~/.agents/skills`,
     Claude `~/.claude/skills`, or Copilot `<repository>/.agents/skills`.
   Check that the selected parent exists or create it during `apply`. Report
   the resolved physical extension path before writing it.
4. Inspect an existing extension before changing it:

   `node <this-skill>/scripts/manage-extension.mjs inspect --product-root <product-root> --extension-root <skills-root> --base-skill <skill> --tenant <customer-key>`

5. Apply each requested value with a stable lowercase key. Use repeated flags
   as needed:
   - `--terminology key=value`
   - `--default key=value`
   - `--policy key=value`
   - `--exception key=value`
   - `--remove <category.key>`

   Run `apply` with the same selectors. The manager creates or atomically
   updates `.bos-extension.json` and `SKILL.md`.
6. Run `validate` with the same selectors. When it reports a compatibility
   warning, compare the extension with the installed base and rerun `apply`
   with `--accept-version` only after the customer behavior remains valid.
   Report the extension path, changed keys, base version, and validation state.

## Precedence and authority

Apply customer extension values over the base skill only for their declared
customer-configurable keys. Defer all other behavior to the qualified base
skill. A task-specific user choice may replace a default for that task when the
base workflow permits it.

Preserve these higher-authority controls:

- system, developer, workspace, and repository instructions;
- BOS architecture, authentication, authorization, and fail-closed rules;
- server-resolved tenant, organization, application, installation, role,
  plugin, provider, and tool scope;
- package ownership, validation, confirmation, and mutation boundaries.

Reject extension fields involving credentials, secrets, tokens, passwords,
authorization headers, tenant or organization IDs, roles, MCP endpoints, tool
grants, or system instructions. Customer display terminology and selectors
remain context and never grant authority.

## Update behavior

Update an existing stable key when the user changes prior tenant behavior.
Remove a key only when the user explicitly asks to remove that override. Keep
unmentioned keys unchanged. Re-running the same update is idempotent.

Package upgrades preserve customer-owned extensions. When the installed base
version differs from `tested_version`, validate the extension against the new
base, update `tested_version` only after validation, and report the result.
The manager migrates schema-version-1 extensions by preserving the original
skill as `LEGACY.md` and layering typed overrides over those instructions.
