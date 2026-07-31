# Install BOS Operations Center on macOS

## Requirements

- A supported macOS computer.
- Codex installed and signed in.
- A BOS client key issued by Infinite State Machines.

Git, npm, Node.js, Python, Homebrew, Xcode, and repository access are not
required for installation.

## Install

1. Give Codex the GitHub release ZIP URL and ask it to install the package.
2. Codex downloads, verifies, extracts, and runs the included `install.sh`.
3. Start a new Codex task.
4. Request a BOS operation. The packaged MCP opens a one-time local credential
   page; enter the BOS credential there, outside ChatGPT.
5. Codex calls `bos_get_context` after authentication.

The BOS credential remains in MCP session memory and is absent from plugin
files, MCP configuration, shell history, and release files. Provider OAuth
tokens and API keys are encrypted and stored by BOS.
