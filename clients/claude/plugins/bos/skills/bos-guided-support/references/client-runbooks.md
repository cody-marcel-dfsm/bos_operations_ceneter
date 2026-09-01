# BOS client runbooks

The repository's generated package and current installation instructions are
the authority for BOS-specific names, routes, and versions. Vendor documents
are the authority for current host controls. Check both before giving exact UI
directions when the local evidence conflicts.

## Canonical BOS sources

- Package customer instructions: repository `README.md`
- Product composition and version: `products/<product>/product.json` or the
  installed `.bos-product.json`
- Generated runtime declarations: the installed product package

The BOS resource is owned by the root BOS package. Education Center, CRM,
Marketing Director, and other subservice plugins use that authenticated BOS
connection and never add another BOS login. Use the exact generated BOS
connector metadata when private installation requires Claude's custom connector
flow. Never ask the user to reconstruct or modify the endpoint.

## Local client cache reset

Use the repository-owned command when the user explicitly asks to clear local
BOS caches from ChatGPT/Codex and Claude:

`./scripts/reset-bos-client-caches.sh --dry-run`

Review the bounded cache plan, then run:

`./scripts/reset-bos-client-caches.sh --confirmation "DELETE BOS CHATGPT AND CLAUDE CACHES"`

The command deletes only validated BOS package caches below
`~/.codex/plugins/cache` and `~/.claude/plugins/cache`, plus individual catalog
cache files below `~/.codex/cache` whose contents identify the BOS resource or
retired BOS account app. It completes all identity and containment checks before
deleting any target. It performs no account operation, plugin or marketplace
registration change, configuration edit, personal-skill removal, process
restart, Gemini or Copilot cleanup, shared document-cache deletion, or source
repository traversal. Repository manifests and generated packages always remain
untouched. The legacy `scripts/uninstall-bos-all-clients.sh` command delegates to
this same bounded reset.

## Stale OAuth client registration

An OAuth token-endpoint `invalid_client` response means the server no longer
accepts the host's cached public-client registration. Preserve the active
request, keep the exact BOS resource fixed, and use the host's supported
connection reset to discard the stale registration and repeat dynamic client
registration. Restart BOS authorization once, refresh tools, verify
`bos_get_context`, and resume the request. If the host exposes replacement only
through its native **Connect**, **Sign in**, **Auth**, or **Authenticate**
control, invoke that control and request user consent there. Preserve every
installed subservice plugin and avoid creating another BOS connection.

An OAuth token-endpoint `invalid_grant`, including `Refresh token replay
detected`, means the existing BOS grant is unusable. Keep the root
package-owned connection and immutable BOS resource unchanged, stop refresh retries, and use the
native **Connect**, **Sign in**, **Auth**, or **Authenticate** control for fresh
consent. Refresh tools and context after consent, then resume the preserved
request.

## ChatGPT/Codex Desktop

1. Confirm **BOS** and the requested subservice plugins are installed and
   enabled in the Plugins Directory.
2. Confirm BOS's plugin manifest declares `mcpServers: "./.mcp.json"`, that
   file contains exactly one credential-free HTTPS BOS server, and the package
   has no `.app.json`; subservice plugins carry no additional BOS binding.
3. Start a new task after install or update when the existing task cannot see
   the plugin.
4. Confirm the host loads the BOS server and shows its native **Login**, **Connect**, or
   **Authenticate** action when authentication is required. If it is absent,
   report an authentication-activation defect and repair the package binding.
5. Complete BOS consent from that native action. The MCP resource
   returns the HTTP 401 protected-resource challenge required for runtime OAuth
   discovery. If runtime activation fails, preserve the
   request and report an authentication-activation defect. The agent never
   invokes CLI login or launches authentication for the customer.
6. After browser consent succeeds, refresh the MCP session and callable tools,
   resolve BOS context, run one bounded read, and resume the original request.

Official source:
`https://developers.openai.com/plugins/build/plugins`

## Claude Cowork/Desktop

1. Open **Customize → Plugins** and confirm BOS plus the subservice plugins are
   installed and enabled from the configured marketplace.
2. Open **Customize → Connectors** and confirm the BOS account or organization
   Web connector is present. For a private installation, use the exact name and
   URL from the generated BOS `CONNECTORS.md` to add the custom connector.
3. Confirm BOS is classified as **Web** and provides **Connect**. Subservice
   plugins expose no connector entry.
4. Select **Connect**, complete BOS consent, and start a new Cowork task after
   installation or update.
5. Refresh discovery, resolve
   context, and run one bounded read.

Official sources:

- `https://support.anthropic.com/en/articles/11817150-connect-your-tools-to-unlock-a-smarter-more-capable-ai-companion`
- `https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers`

## GitHub Copilot CLI or VS Code

1. Confirm the product skills and its generated `.github/mcp.json` or
   `.vscode/mcp.json` server entry are installed.
2. In Copilot CLI authenticate the BOS server once; in VS Code select **Auth**
   above the BOS server entry.
3. Complete BOS sign-in, refresh the MCP list, resolve context, and run one
   bounded read.
4. Explain that Copilot cloud agent and code review require remote MCP OAuth
   support before they can load this runtime connection.

Official source:
`https://docs.github.com/en/copilot/customizing-copilot/extending-copilot-coding-agent-with-mcp`

## Gemini CLI

1. From the operating-system shell, install or update the BOS extension and any
   subservice extensions. Extension management commands do not run inside
   the interactive Gemini prompt.
2. Restart Gemini CLI after installation or update.
3. Run `/extensions list`, then `/skills list`.
4. Authenticate the BOS MCP server once and complete BOS sign-in.
5. Run `/mcp list`, refresh discovery, resolve context, and run one bounded read.

Official sources:

- `https://geminicli.com/docs/extensions/`
- `https://geminicli.com/docs/extensions/reference/`
- `https://geminicli.com/docs/cli/commands/`

## Google Antigravity 2.0 Desktop

1. Run `./scripts/clean-install-antigravity.sh` once from the synced BOS Operations
   Center repository. This intentionally destructive clean installer deletes
   prior BOS product entries, including local customizations, without backups,
   resolves the repository from its own file path, and creates one symlink per
   active product in the global plugin directory. It changes nothing until the
   user types `DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS` to confirm the warning.
2. Restart Antigravity after installation and after each Git pull.
3. Open **Settings → Customizations**, select **Authenticate** for BOS, and
   complete BOS sign-in once.
4. Confirm the named resource and skills load, resolve context, and run one
   bounded read.

Official sources:

- `https://antigravity.google/docs/ide/plugins?app=antigravity-ide-`
- `https://antigravity.google/docs/mcp?authuser=0000`

## Documentation retrieval

When browser or web access exists:

1. Open the official source for the detected client.
2. Find the section matching the current stage and current host version.
3. Prefer a screenshot already present in that official article. Otherwise
   capture only the relevant visible documentation region when the tool permits.
4. Pair the visual with the BOS-specific exact action from the canonical package
   instructions.
5. Cite the page and date checked. If the official page and local UI differ,
   trust the user's current UI for location and report the label difference.

Never use a search-result thumbnail, community blog, or third-party tutorial as
the primary visual when an official source is available.
