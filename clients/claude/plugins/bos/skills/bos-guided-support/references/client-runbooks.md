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

The Education Center product resource is package-owned. Use the exact generated
connector metadata when private installation requires Claude's custom connector
flow. Never ask the user to reconstruct or modify the endpoint.

## ChatGPT/Codex Desktop

1. Confirm both **BOS** and the requested runtime product are installed and
   enabled in the Plugins Directory.
2. Confirm the runtime product's required registered app is present. Codex uses
   `.app.json`; it does not use a package `.mcp.json` or a user-entered BOS URL.
3. Start a new task after install or update when the existing task cannot see
   the plugin.
4. Select **Connect** or **Sign in** for the runtime product and complete BOS
   consent in the host flow.
5. Refresh tools, resolve BOS context, and run one bounded read.

Official source:
`https://developers.openai.com/plugins/build/plugins`

## Claude Cowork/Desktop

1. Open **Customize → Plugins** and confirm BOS plus the runtime product are
   installed and enabled from the configured marketplace.
2. Open **Customize → Connectors** and confirm the account or organization Web
   connector is present. For a private installation, use the exact name and URL
   from the generated product's `CONNECTORS.md` to add the custom connector.
3. Confirm the entry is classified as **Web** and provides **Connect**. A
   **Web / Plugin** entry with **Connects in sessions** is a package defect.
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
2. In Copilot CLI run `/mcp auth <product-group>`; in VS Code select **Auth**
   above the product server entry.
3. Complete BOS sign-in, refresh the MCP list, resolve context, and run one
   bounded read.
4. Explain that Copilot cloud agent and code review require remote MCP OAuth
   support before they can load this runtime connection.

Official source:
`https://docs.github.com/en/copilot/customizing-copilot/extending-copilot-coding-agent-with-mcp`

## Gemini CLI

1. From the operating-system shell, install or update the BOS extension and the
   runtime-product extension. Extension management commands do not run inside
   the interactive Gemini prompt.
2. Restart Gemini CLI after installation or update.
3. Run `/extensions list`, then `/skills list`.
4. Run `/mcp auth <product-group>` and complete BOS sign-in.
5. Run `/mcp list`, refresh discovery, resolve context, and run one bounded read.

Official sources:

- `https://geminicli.com/docs/extensions/`
- `https://geminicli.com/docs/extensions/reference/`
- `https://geminicli.com/docs/cli/commands/`

## Google Antigravity 2.0 Desktop

1. Run `./scripts/install-antigravity.sh` once from the synced BOS Operations
   Center repository. This intentionally destructive clean installer deletes
   prior BOS product entries, including local customizations, without backups,
   resolves the repository from its own file path, and creates one symlink per
   active product in the global plugin directory.
2. Restart Antigravity after installation and after each Git pull.
3. Open **Settings → Customizations**, select **Authenticate** for the runtime
   product, and complete BOS sign-in.
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
