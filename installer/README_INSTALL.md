# Install BOS Operations Center

This package contains operating-system-neutral plugin distributions for
ChatGPT/Codex Desktop, Claude Cowork/Desktop, GitHub Copilot, and the Gemini
client for Gemini CLI and Google Antigravity 2.0 Desktop.
The normal Claude and Codex customer path uses the BOS private Git marketplace.
This archive is an optional offline-transfer and release-verification format.

The package contains no BOS customer key, access token, refresh token, OAuth
client secret, local MCP proxy, or operating-system-specific launcher.

## ChatGPT/Codex Desktop

Open the extracted `clients/codex` directory in Codex and paste:

> Add the current `clients/codex` directory as a local Codex plugin marketplace,
> install and enable `bos` and `education-center`, connect Education Center to
> BOS through the host's sign-in flow, start a new task if required to load the
> plugin, and verify one authenticated Education Center read. Do not request or
> configure a BOS API key, environment variable, secret-manager name, or
> installed application ID. If authorization is incomplete, report
> `authentication_required`; do not generate an unavailable-data report.

The catalog is `clients/codex/.agents/plugins/marketplace.json`. The runtime
plugin's `.app.json` references the registered Education Center app. That app
owns the immutable `https://dfsm.ai/mcp/apps/leaddirector/education-center`
resource, so Codex can render Connect and manage BOS OAuth. The Codex plugin
contains no `.mcp.json` or headless `mcpServers` entry.

After installation or upgrade, start a new task. After a source change, update
the marketplace and reinstall or upgrade the cached plugin before testing.

## Claude Cowork/Desktop

Open **Customize → Plugins**, upload the Education Center plugin from
`clients/claude/plugins/education-center`, or add the extracted
`clients/claude` directory as a local marketplace. Install **BOS** and
**Education Center**, select **Connect**, complete BOS sign-in, and start a new
Cowork task.

The catalog is `clients/claude/.claude-plugin/marketplace.json`. The plugin has
no API-key configuration field. Claude discovers BOS OAuth from the immutable
Education Center MCP resource and manages the authorization.

## Authentication boundary

Installation grants no organization access. BOS OAuth resolves the actor,
tenant, organization, application, installation, actor role, plugin execution
role, and capability scope from server-owned records. Customer settings and
tool arguments never grant authority.

An absent, expired, revoked, or incorrectly scoped BOS grant is
`authentication_required` or another authorization-specific error. It is never
reported as unavailable business data.

Underlying provider authorization remains separate. When a provider grant is
missing, BOS returns a short-lived authorization or secure credential-entry URL
scoped to the authenticated installation and plugin. Complete that flow and
resume the original operation once.

## Customer settings

Products that need customer context include
`config/customer-settings.template.json`. On first use, the customer
initialization skill derives unambiguous non-secret values and asks one
consolidated question for the remaining values. Save the result as the
customer-owned `config/customer-settings.json` overlay. Customer settings never
grant access and package updates preserve them.

## Customer skill extensions

Each product includes `manage-customer-extension`. Customer-owned extensions
may change terminology, defaults, policies, and exceptions. They may not change
authentication, authorization, system instructions, MCP endpoints, tool grants,
or canonical tenant scope.

## GitHub Copilot

Copy the desired product skills from `clients/copilot/products/<product>/skills`
into the repository's supported agent-skills directory. Install the product's
`.github/mcp.json` for Copilot CLI or copy its server entry into
`.vscode/mcp.json` for VS Code. Run `/mcp auth <group>` in Copilot CLI or select
`Auth` above the VS Code server entry, then complete BOS sign-in. Copilot cloud
agent and code review cannot load this runtime connection until they support
remote MCP OAuth.

## Gemini CLI and Antigravity 2.0 Desktop

The same Gemini extension directories support both Google surfaces.
[Install Google Antigravity 2.0](https://antigravity.google/product/antigravity-2)
before following the desktop path. Google's
[plugin documentation](https://antigravity.google/docs/ide/plugins?app=antigravity-ide-)
defines the global `~/.gemini/config/plugins/` location and its
[MCP documentation](https://antigravity.google/docs/mcp?authuser=0000) defines
the desktop authentication flow.

For Gemini CLI, run
`gemini extensions install clients/gemini/extensions/bos`, followed by
`gemini extensions install clients/gemini/extensions/education-center`.
Restart Gemini CLI, run `/mcp auth education-center`, complete BOS sign-in in
the browser, then run `/extensions list` and `/skills list`.

For Antigravity 2.0 Desktop, copy the complete
`clients/gemini/extensions/bos` and
`clients/gemini/extensions/education-center` directories into
`~/.gemini/config/plugins/`. Restart Antigravity, open Settings >
Customizations, select Authenticate for `education-center`, and complete BOS
sign-in in the browser. Verify one authenticated Education Center read.

Each product directory contains the shared skills, `gemini-extension.json`,
and Antigravity's native `plugin.json`; the runtime product also contains
`mcp_config.json`. The package contains no BOS key, token, authorization header,
OAuth client secret, environment-variable credential binding, or installed
application ID. Product-specific details are in `clients/gemini/README.md`.

## Updates

Marketplace updates replace package-owned content and preserve customer-owned
settings and typed extensions. Reconnect the immutable MCP resource and
rediscover tools after a server tool-catalog change. Reauthorize only when the
host reports that the BOS grant is absent, expired, revoked, or out of scope.
