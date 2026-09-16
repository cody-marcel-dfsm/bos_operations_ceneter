# Education Operation Center for GitHub Copilot

Copy `skills/` into the target repository's `.agents/skills/` directory.
Install BOS first. This product uses the BOS connection and its native authentication action.

Verify this product in the target repository with `npm run install:verify:copilot-runtime -- --target <repository> --product education-center`.
Copilot reads repository configuration directly and has no BOS package-cache layer.
