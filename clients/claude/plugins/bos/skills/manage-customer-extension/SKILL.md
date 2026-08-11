---
name: manage-customer-extension
description: Create, inspect, validate, or update a customer-owned extension of an installed packaged skill. Use when a user asks to update, customize, override, specialize, or change a skill for their tenant, organization, location, or customer while preserving package upgrades and BOS authority boundaries.
---

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
- A marketplace path may be a symlink to the installed product. Resolve and
  report the physical product root; identify the marketplace path as an
  alternate access path to the same files.

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
     (normally `~/plugins/<product>/skills`) and the installer preserves its
     customer-owned extensions.
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
