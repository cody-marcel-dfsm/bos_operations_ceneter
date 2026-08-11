# Install BOS Operations Center

This package contains operating-system-neutral plugin distributions for
ChatGPT/Codex Desktop, Claude Cowork/Desktop, GitHub Copilot, and Gemini CLI.
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
plugin contains the immutable
`https://dfsm.ai/mcp/apps/leaddirector/education-center` URL. Codex discovers
BOS OAuth from that resource and manages the authorization.

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
into the repository's supported agent-skills directory. Follow that product's
README for its current MCP authorization adapter. The Claude and Codex OAuth
migration does not silently change Copilot authentication.

## Gemini CLI

Install the desired extension from `clients/gemini/extensions/<product>` and
follow its declared settings. The Claude and Codex OAuth migration does not
silently change Gemini authentication.

## Updates

Marketplace updates replace package-owned content and preserve customer-owned
settings and typed extensions. Reconnect the immutable MCP resource and
rediscover tools after a server tool-catalog change. Reauthorize only when the
host reports that the BOS grant is absent, expired, revoked, or out of scope.
