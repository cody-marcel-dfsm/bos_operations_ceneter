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
npm run install:apply -- --product education-center
npm run install:verify -- --product bos
npm run install:verify -- --product education-center
```

Video Ads is disabled in this release.

## Authentication

Configure each selected runtime product's declared credential through the
approved host configuration. Education Center uses
`EDUCATION_CENTER_BOS_API_KEY`. Each named MCP connection forwards only its
own organization-scoped identity.
Keep the key out of package files,
customer settings, customer-entered command arguments, and conversations.

Claude uses the runtime plugin's required sensitive `bos_api_key` setting
instead of the environment variable. Claude masks the one-time entry and keeps
it in its secure credential storage; the wrapper never receives it.

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
EDUCATION_CENTER_BOS_API_KEY=<gcp-secret-name> --replace` to close the active
ChatGPT process and start a ChatGPT/Codex instance with the Education Center product key
scoped to that process. The launcher keeps keys out of files and the global
GUI launch environment.
`--replace` requires a directly attached interactive terminal and the typed
confirmation `RESTART CHATGPT`. The launcher requests graceful termination and
never force-terminates ChatGPT; close the app manually if it does not exit.
It resolves `gcloud` from `PATH`; pass `--gcloud <path>` for another location.

## Claude

Open this extracted package as the Claude Code working folder and paste:

> Run `npm run install:claude` and guide me through the secure API-key prompt.

The command installs `Education Center` directly from
`clients/claude`; no public marketplace listing or repository checkout is
required. Claude's native plugin configuration prompts once, with masked input,
for the API key supplied by the BOS administrator. Claude stores it securely
and substitutes it into the package's static
`/mcp/apps/<application-name>/<skill-group-name>` HTTPS connection. The wrapper
never receives the key. The customer does not edit an environment file or
settings file. Start a new Claude session or run `/reload-plugins` after
installation.

## GitHub Copilot

Copy the desired product skills from `clients/copilot/products/<product>/skills`
into the repository's supported agent-skills directory. Configure the BOS
remote MCP connection in the Copilot host using the same endpoint and
product-prefixed credential variable; Education Center uses
`COPILOT_MCP_EDUCATION_CENTER_BOS_API_KEY`. The Copilot skill
package contains no client runtime.

## Gemini CLI

Install the desired extension directory from
`clients/gemini/extensions/<product>` with `gemini extensions install`. Gemini
loads the bundled `skills/` directory and native Streamable HTTP MCP
configuration from `gemini-extension.json`. Complete the declared
product credential setting during installation; Education Center uses
`EDUCATION_CENTER_BOS_API_KEY`. Restart
Gemini CLI.

## Customer settings

Products that need customer context include
`config/customer-settings.template.json`. On first use, the customer
initialization skill derives unambiguous non-secret values from local client
and authenticated BOS metadata, then asks one consolidated question for the
remaining values. The Education Center questionnaire always asks for the
customer-facing franchise or brand name when `brand_display_name` is empty.
Save the completed settings as customer-owned configuration
with permissions limited to that user. Customer settings never grant access.

## Customer skill extensions

Each product includes `manage-customer-extension`. A customer can ask the agent
to update or specialize an installed skill for their organization or location.
The agent writes a typed customer-owned extension in the host's skills scope,
validates it, and reports its base-version compatibility. Package updates
preserve these extensions. Extensions may change customer terminology,
defaults, policies, and exceptions while BOS authority, credentials, system
instructions, MCP endpoints, and tool grants remain sealed.

For a BOS-managed Codex installation, resolve extensions inside the installed
product at `~/plugins/<product>/skills/<base-skill>-<tenant-key>/`. The
installer discovers and preserves `.bos-extension.json` manifests from that
directory. Codex marketplace state remains under `~/.agents`.

The marketplace product path may be a symlink to `~/plugins/<product>`, so
Finder can show either access path for the same files. Product-wide tenant
settings remain in `config/customer-settings.json`; per-skill extension
manifests remain under `skills/<base-skill>-<tenant-key>/`.

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
