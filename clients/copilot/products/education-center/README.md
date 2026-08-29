# Education Operation Center for GitHub Copilot

Copy `skills/` into the target repository's `.agents/skills/` directory.
Install and authenticate the BOS package once. This subservice adds workflows
through the existing BOS connection and registers no additional MCP server.

Verify this product in the target repository with `npm run install:verify:copilot-runtime -- --target <repository> --product education-center`.
Copilot reads repository configuration directly and has no BOS package-cache layer.
