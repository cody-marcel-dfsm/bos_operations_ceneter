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

## Complete all-client removal

Use the repository-owned command when the user explicitly asks to remove BOS,
Education Center, and their local caches from every client:

`./scripts/uninstall-bos-all-clients.sh --dry-run`

Review the identity-bounded removal plan, then run:

`./scripts/uninstall-bos-all-clients.sh --confirmation "DELETE ALL BOS CLIENT PLUGIN STATE AND CACHES"`

The shell command uses the active Codex ChatGPT authentication to delete the
developer-owned **Created by you** BOS app through the same account resource as
the native **Delete** control. It then refreshes the remote
`created-by-me-remote` catalog and requires the account record to be absent.
This prevents the signed-in client from
recreating its installed icon, app wrapper, and callable-tool catalog after
local cleanup. The command then unregisters the BOS and
Education Center packages and marketplace from Codex and Claude, removes their
validated package caches and generated app catalog state, removes Gemini CLI
and Antigravity product directories, clears the shared BOS document/settings
caches, and verifies account, registry, and filesystem absence. Add one
`--copilot-root /absolute/repository/path` for each repository-scoped Copilot
installation. No manual settings action is required. It preserves unrelated plugins, client history, customer source
repositories, and generated customer marketplace packages. The deletion is
permanent and creates no backup. The command refreshes and verifies the account
catalog after deletion. If ChatGPT/Codex Desktop is running, it schedules a
forced process restart after reporting success so stale in-memory plugin state
cannot be written back to disk; no manual settings or restart action is required. It also removes
the BOS-only root repo marketplace manifests so opening the BOS Operations Center
source repository cannot advertise uninstalled BOS or Education Center cards.
Installable release catalogs remain under `clients/codex` and `clients/claude`.

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

## ChatGPT/Codex Desktop

1. Confirm **BOS** and the requested subservice plugins are installed and
   enabled in the Plugins Directory.
2. Confirm BOS's required registered app is present. Codex uses the root BOS
   `.app.json`; subservice plugins carry no additional BOS app binding.
3. Start a new task after install or update when the existing task cannot see
   the plugin.
4. Select **Connect** or **Sign in** for BOS and complete BOS consent once in
   the host flow.
5. Refresh tools, resolve BOS context, and run one bounded read.

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
