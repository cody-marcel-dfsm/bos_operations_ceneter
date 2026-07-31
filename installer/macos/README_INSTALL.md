# Install BOS Operations Center on macOS

## Requirements

- A supported macOS computer.
- Codex installed and signed in.
- A BOS client key issued by Infinite State Machines.

Git, npm, Node.js, Python, Homebrew, Xcode, and repository access are not
required for installation.

## Install

1. Extract the ZIP.
2. Run `install.sh`.
3. Run `connect-bos.sh`. macOS displays a secure dialog for the BOS client key.
4. Start a new Codex task.
5. Ask Codex to call `bos_get_context`.

The key is stored in macOS Keychain. It is absent from the plugin files, MCP
configuration, shell history, and Codex conversation.
