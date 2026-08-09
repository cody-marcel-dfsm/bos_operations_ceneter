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
3. For iCode, the installer derives the local IANA timezone and directs Codex
   to run `icode-customer-initialization`. Codex then derives safe non-secret
   settings from connected-account metadata and authenticated BOS context and
   asks one consolidated question for values that remain unknown or ambiguous.
4. Codex validates and applies the answers to the customer-owned settings file.
5. Start a new Codex task.
6. Request a BOS operation. The packaged MCP opens a one-time local credential
   page; enter the BOS credential there, outside ChatGPT.
7. Codex calls `bos_get_context` after authentication.

Customer settings contain operating context and no credentials. The installer
writes them to the installed iCode product as a customer-owned mode-0600 file.
Package upgrades preserve that file. Skills load those settings instead of
embedding a person's mailbox, address, phone number, location, or timezone.
When no completed settings file is supplied, the installer creates a mode-0600
initialization draft with values it can derive locally. The installed
`icode-customer-initialization` skill completes the derive-then-ask workflow in
the agent conversation.

The BOS credential remains in MCP session memory and is absent from plugin
files, MCP configuration, shell history, and release files. Provider OAuth
tokens and API keys are encrypted and stored by BOS.
