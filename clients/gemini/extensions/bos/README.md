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

Copy this complete `bos` directory to `~/.gemini/config/plugins/bos`
or place it in the opened workspace under `.agents/plugins/`. Restart Antigravity.
Open Settings > Customizations and confirm the plugin and its skills are enabled.
