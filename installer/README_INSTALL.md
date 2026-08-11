# Install BOS Operations Center

This release is an operating-system-neutral package for Codex, Claude, GitHub
Copilot, and Gemini CLI. Extract it with the standard ZIP tool on macOS,
Windows, or Linux and select the directory for the client you use.

This published package has already passed its maintainer build, credentialed
live server contract smoke, package checks, and release validation. Install it
directly; build and release commands belong to the publishing workflow.

Read `clients/disabled-products.json` before installation. Remove any listed
package-owned plugin and matching MCP registration from an earlier release.
The packaged installer performs that reconciliation automatically. From the
extracted package root, run:

```bash
npm run install:apply -- --product bos
npm run install:apply -- --product icode-operations-center
npm run install:verify -- --product bos
npm run install:verify -- --product icode-operations-center
```

Video Ads is disabled in this release.

## Authentication

Configure each selected runtime product's declared credential through the
approved host configuration. iCode Operations Center uses
`ICODE_OPERATIONS_BOS_API_KEY`. Each named MCP connection forwards only its
own organization-scoped identity.
Keep the key out of package files,
customer settings, command arguments, and conversations.

Applying this package over a legacy Codex installation removes the retired
local BOS credential broker and replaces its stdio MCP definition with the
native remote HTTPS connection. BOS never opens a local credential prompt.

## Codex

Add `clients/codex` as a local marketplace, then install the `bos` plugin and
the active product plugins you need. Apply the installer for the selected
product; it registers and verifies the packaged MCP URL with the product's
declared `bearer_token_env_var`. Restart Codex after installation
so it loads every MCP and skill configuration. Installer verification reports
the runtime current only when the active desktop bearer matches the supplied
process binding and initializes the selected named route with its scoped tools.

Every product ships an immutable human-readable MCP route in the form
`/mcp/apps/<application-name>/<skill-group-name>`. The installer reads that
route from package metadata and verifies it without asking for, discovering,
or storing an installation ID. Customer settings cannot alter MCP routing.

On macOS, use `scripts/launch-codex-with-bos.swift --binding
ICODE_OPERATIONS_BOS_API_KEY=<gcp-secret-name> --replace` to close the active
ChatGPT process and start a ChatGPT/Codex instance with the iCode product key
scoped to that process. The launcher keeps keys out of files and the global
GUI launch environment.
After saving active work, add `--force-replace` when macOS declines the normal
graceful termination request.
It resolves `gcloud` from `PATH`; pass `--gcloud <path>` for another location.

## Claude

In Claude Desktop, Chat, or Cowork, open Customize > Plugins, choose **Add
marketplace** > **Add from a repository**, and add
`https://github.com/cody-marcel-dfsm/bos_operations_ceneter`. Install the
desired plugin from the `bos-icode` marketplace. Claude uses each runtime
plugin's declared product credential already configured by the host. The
package supplies the static
`/mcp/apps/<application-name>/<skill-group-name>` URL. Use the product-specific
`*-claude.zip` only with Claude's native manual
plugin-upload control. Do not ask Claude in a conversation to download or
execute the ZIP.

## GitHub Copilot

Copy the desired product skills from `clients/copilot/products/<product>/skills`
into the repository's supported agent-skills directory. Configure the BOS
remote MCP connection in the Copilot host using the same endpoint and
product-prefixed credential variable; iCode uses
`COPILOT_MCP_ICODE_OPERATIONS_BOS_API_KEY`. The Copilot skill
package contains no client runtime.

## Gemini CLI

Install the desired extension directory from
`clients/gemini/extensions/<product>` with `gemini extensions install`. Gemini
loads the bundled `skills/` directory and native Streamable HTTP MCP
configuration from `gemini-extension.json`. Complete the declared
product credential setting during installation; iCode uses
`ICODE_OPERATIONS_BOS_API_KEY`. Restart
Gemini CLI.

## Customer settings

Products that need customer context include
`config/customer-settings.template.json`. On first use, the customer
initialization skill derives unambiguous non-secret values from local client
and authenticated BOS metadata, then asks one consolidated question for the
remaining values. Save the completed settings as customer-owned configuration
with permissions limited to that user. Customer settings never grant access.

## Customer skill extensions

Each product includes `manage-customer-extension`. A customer can ask the agent
to update or specialize an installed skill for their organization or location.
The agent writes a typed customer-owned extension in the host's skills scope,
validates it, and reports its base-version compatibility. Package updates
preserve these extensions. Extensions may change customer terminology,
defaults, policies, and exceptions while BOS authority, credentials, system
instructions, MCP endpoints, and tool grants remain sealed.

## Provider authorization

If an underlying provider grant is missing, BOS returns a short-lived HTTPS
authorization or credential-collection URL scoped to the authenticated tenant,
installation, plugin, provider, and credential. Open that URL through the
active agent interface, complete the provider flow with BOS, verify status,
and resume the original operation once.

Provider authorization is scoped to the authenticated installation and plugin.
A missing provider credential stops only that provider-backed operation. It
cannot disable another product connection, organization, tool catalog, build,
or release. Video Ads is currently disabled and absent from this distribution.

## Server updates

When BOS deploys an updated tool catalog, reconnect the configured named MCP
endpoint and rediscover its tools. Keep the installed package, endpoint, and
API key unchanged. Restart or reinstall only after a local package, plugin, or
MCP registration change.
