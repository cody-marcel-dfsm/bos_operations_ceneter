# Education Operation Center for Gemini

This one Gemini extension supports Gemini CLI and Google Antigravity 2.0 Desktop.
Both surfaces load the same packaged skills and fixed BOS product identity.

## Gemini CLI

Install this extension from a terminal with `gemini extensions install clients/gemini/extensions/education-center`.
Gemini CLI copies the extension into its managed extension directory.
Run `/mcp auth education-center` and complete BOS sign-in in the browser.
Gemini CLI discovers BOS OAuth, stores and refreshes the resource-scoped grant,
and connects to the fixed HTTPS MCP route declared by this extension.

This package is fixed to `/mcp/apps/leaddirector/education-center`.
The package does not select or provision a BOS application.

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
Open Settings > Customizations, find the `education-center` MCP server,
select Authenticate, complete BOS sign-in in the browser, and return to Antigravity.
The desktop host stores and refreshes the resource-scoped OAuth grant.
