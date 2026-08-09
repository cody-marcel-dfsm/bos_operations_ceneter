# Install BOS Operations Center on macOS

## Requirements

- A supported macOS computer.
- Codex installed and signed in.
- A BOS client key issued by Infinite State Machines.

Git, npm, Node.js, Python, Homebrew, Xcode, and repository access are not
required for installation.

## Install

1. Give Codex the GitHub release ZIP URL and ask it to install the package.
2. For iCode, have Codex copy
   `marketplace/plugins/icode-operations-center/config/customer-settings.template.json`,
   fill it with the user's organization name, location name, IANA timezone,
   connected Care.com mailbox, and applicable billing values, then run
   `install.sh --settings /path/to/customer-settings.json`.
3. Codex downloads, verifies, extracts, and runs the included `install.sh`.
4. Start a new Codex task.
5. Request a BOS operation. The packaged MCP opens a one-time local credential
   page; enter the BOS credential there, outside ChatGPT.
6. Codex calls `bos_get_context` after authentication.

Customer settings contain operating context and no credentials. The installer
writes them to the installed iCode product as a customer-owned mode-0600 file.
Package upgrades preserve that file. Skills load those settings instead of
embedding a person's mailbox, address, phone number, location, or timezone.

The BOS credential remains in MCP session memory and is absent from plugin
files, MCP configuration, shell history, and release files. Provider OAuth
tokens and API keys are encrypted and stored by BOS.
