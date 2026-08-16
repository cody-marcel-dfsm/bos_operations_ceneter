# Education Center for Gemini CLI

Install this extension from a terminal with `gemini extensions install clients/gemini/extensions/education-center`.
Gemini CLI copies the extension into its managed extension directory.
During installation, enter the organization-scoped BOS API key in the
sensitive `BOS API Key` setting. Gemini CLI stores sensitive extension
settings in the system keychain and supplies the credential only to the
fixed HTTPS MCP route declared by this extension.

This package is fixed to `/mcp/apps/leaddirector/education-center`.
The package does not select or provision a BOS application. If the setting
must be repaired, run `gemini extensions config education-center`.

Restart Gemini CLI after installation or update. Run `/extensions list` to
confirm the extension is enabled and `/skills list` to confirm its skills are
discoverable. Use `gemini extensions update education-center` for later releases.
