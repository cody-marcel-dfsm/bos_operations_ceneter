# BOS — Business Operating System for Gemini

This one Gemini extension supports Gemini CLI and Google Antigravity 2.0 Desktop.
Both surfaces load the same packaged skills and fixed BOS product identity.

## Gemini CLI

Install this extension from a terminal with `gemini extensions install clients/gemini/extensions/bos`.
Gemini CLI copies the extension into its managed extension directory.
This is a skills-only extension and registers no MCP server.

Restart Gemini CLI after installation or update. Run `/extensions list` to
confirm the extension is enabled and `/skills list` to confirm its skills are
discoverable. Use `gemini extensions update bos` for later releases.

## Antigravity 2.0 Desktop

Run `./scripts/install-antigravity.sh` once from the synced BOS Operations Center
repository. This is a clean install: it deletes prior BOS product entries without backups,
then links every generated Gemini product into `~/.gemini/config/plugins/`.
It resolves the repository from the installer's own location, independent of the
current working directory. It stops if customer-owned extension metadata exists.
After each Git pull, restart Antigravity.
Open Settings > Customizations and confirm the plugin and its skills are enabled.
