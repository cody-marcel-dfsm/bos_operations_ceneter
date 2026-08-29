# Education Operation Center for Gemini

This one Gemini extension supports Gemini CLI and Google Antigravity 2.0 Desktop.
Both surfaces load the same packaged skills and fixed BOS product identity.

## Gemini CLI

Install this extension from a terminal with `gemini extensions install clients/gemini/extensions/education-center`.
Gemini CLI copies the extension into its managed extension directory.
Install and authenticate the BOS extension once. This subservice adds workflows
through the existing BOS connection and registers no additional MCP server.

Restart Gemini CLI after installation or update. Run `/extensions list` to
confirm the extension is enabled and `/skills list` to confirm its skills are
discoverable. Use `gemini extensions update education-center` for later releases.

## Antigravity 2.0 Desktop

Run `./scripts/clean-install-antigravity.sh` once from the synced BOS Operations Center
repository. This is an intentionally destructive clean install: it deletes prior BOS
product entries, including local customizations, without backups,
then links every generated Gemini product into `~/.gemini/config/plugins/`.
It resolves the repository from the installer's own location, independent of the
current working directory. Before changing files, it displays the deletion warning and
requires `DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS` as typed confirmation.
After each Git pull, restart Antigravity.
Confirm the BOS connection is authenticated, then enable this plugin and its skills.
