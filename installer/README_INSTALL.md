# Install BOS Operations Center

This release is an operating-system-neutral package for Codex, Claude, and
GitHub Copilot. Extract it with the standard ZIP tool on macOS, Windows, or
Linux and select the directory for the client you use.

## Authentication

Configure `BOS_API_KEY` in the client environment through the approved GCP
configuration. The packaged MCP definitions forward that value as an HTTPS
Bearer header to BOS. Do not write the key into a package file, customer
settings, command argument, or conversation.

## Codex

Add `clients/codex` as a local marketplace, then install the `bos` plugin and
the product plugins you need. Restart Codex after installation so it loads the
new MCP and skill configuration.

## Claude

Install the desired plugin directory from `clients/claude/plugins`. The
generated `.mcp.json` uses Claude's native remote HTTP MCP configuration and
reads `BOS_API_KEY` from the client environment.

## GitHub Copilot

Copy the desired product skills from `clients/copilot/products/<product>/skills`
into the repository's supported agent-skills directory. Configure the BOS
remote MCP connection in the Copilot host using the same endpoint and
`BOS_API_KEY`; the Copilot skill package contains no client runtime.

## Customer settings

Products that need customer context include
`config/customer-settings.template.json`. On first use, the customer
initialization skill derives unambiguous non-secret values from local client
and authenticated BOS metadata, then asks one consolidated question for the
remaining values. Save the completed settings as customer-owned configuration
with permissions limited to that user. Customer settings never grant access.

## Provider authorization

If an underlying provider grant is missing, BOS returns a short-lived HTTPS
authorization or credential-collection URL scoped to the authenticated tenant,
installation, plugin, provider, and credential. Open that URL through the
active agent interface, complete the provider flow with BOS, verify status,
and resume the original operation once.
