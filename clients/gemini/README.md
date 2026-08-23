# BOS Operations Center Gemini Client

One generated Gemini extension umbrella supports both Gemini CLI and Google
Antigravity 2.0 Desktop. Each product directory contains shared skills plus the
native manifest and MCP format required by each Google surface.

## Gemini CLI

Install both product extensions from a terminal:

```bash
gemini extensions install clients/gemini/extensions/bos
gemini extensions install clients/gemini/extensions/education-center
```

Restart Gemini CLI. Run `/mcp auth education-center`, complete BOS sign-in, then
run `/extensions list` and `/skills list` to verify the extensions and bundled skills.

## Antigravity 2.0 Desktop

Run `scripts/install-antigravity.mjs` once. This clean installer deletes prior BOS
product entries without backups, locates this repository from its own file path,
and creates one product symlink in `~/.gemini/config/plugins/` for each active product.
It stops if customer-owned extension metadata exists.
After each Git pull, restart Antigravity, open Settings > Customizations, and
select Authenticate for the
`education-center` MCP server. Complete BOS sign-in in the browser.

The Gemini package contains no BOS key, token, authorization header, or client secret.
Each product has detailed CLI and desktop instructions in its own README.
