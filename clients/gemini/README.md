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

Copy `clients/gemini/extensions/bos` and `clients/gemini/extensions/education-center`
into `~/.gemini/config/plugins/`, preserving each product directory name. Restart
Antigravity, open Settings > Customizations, and select Authenticate for the
`education-center` MCP server. Complete BOS sign-in in the browser.

The Gemini package contains no BOS key, token, authorization header, or client secret.
Each product has detailed CLI and desktop instructions in its own README.
