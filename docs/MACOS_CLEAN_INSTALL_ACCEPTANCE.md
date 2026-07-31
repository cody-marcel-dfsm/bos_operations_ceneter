# macOS clean-install acceptance

## Customer outcome

A customer starts from a supported Apple-silicon Mac with Codex installed,
gives Codex a GitHub release ZIP URL, and asks Codex to install it. Codex
downloads, verifies, extracts, and installs the BOS and selected product
plugins. On the first secured request, Codex asks for the BOS credential and
passes it directly to MCP. The customer runs no shell command.

Git, Node.js, npm, Python, Xcode, Homebrew, and repository access are not
customer prerequisites.

## Authentication boundary

Codex authentication and BOS authentication are separate:

- Codex owns ChatGPT or OpenAI API-key login through its supported login UI.
- Before authentication, MCP exposes only authentication and sanitized status
  tools.
- Codex asks for the BOS credential only when a secured request requires it and
  passes it directly to `bos_authenticate`.
- The credential remains only in MCP session memory. It never appears in a
  process argument, environment variable, generated MCP configuration, plugin
  file, log, shell history, or release artifact.
- BOS resolves tenant, organization, application, installation, role, plugin,
  capability, and provider scope from the authenticated key and canonical
  server records.

## Current ZIP bootstrap artifact

Native application signing is deferred. The current customer artifact is a
deterministic ZIP published as a GitHub release asset. Codex downloads and
extracts the ZIP, reviews its installation instructions, and runs the embedded
shell bootstrap.

The ZIP embeds:

- the local Codex marketplace manifest;
- BOS and iCode plugin payloads;
- a self-contained Apple-silicon BOS MCP broker runtime;
- release identity and SHA-256 payload hashes; and
- deterministic install/verify logic.

The shell bootstrap:

1. Locates the Codex executable from the supported app bundle or `PATH`.
2. Checks Codex authentication status without reading credentials.
3. Copies the embedded marketplace to an application-support directory using
   staging, validation, backup, and atomic replacement.
4. Adds that marketplace through `codex plugin marketplace add`.
5. Installs `bos` and the selected product through `codex plugin add`.
6. Directs the customer to start a new Codex task.
7. Exposes MCP bootstrap authentication when the first secured request occurs.
8. Guides OAuth login or direct API-key submission automatically when BOS
   reports a required provider credential.
9. Verifies authorization and resumes the original operation once.

The bootstrap retains the previous marketplace payload in a timestamped backup
for manual recovery when a later Codex registration step fails.

## Clean macOS test image

Use a macOS virtual machine backed by Apple's Virtualization framework on the
M1 Max development Mac. Maintain two states:

- `bos-vanilla`: macOS setup complete, network working, Codex installed,
  Codex signed in, no Infinite State Machines marketplace, plugins,
  credentials, customer configuration, package caches, Git checkout, or build
  tools.
- `bos-installed`: disposable post-install state used only for diagnostics.

Every acceptance run clones or restores `bos-vanilla`, transfers only the
installer disk image, and records:

- macOS and Codex versions;
- installer signature and notarization status;
- pre-install absence checks;
- installation timestamps and visible prompts;
- marketplace and plugin discovery;
- absence of plaintext BOS credentials;
- `bos_get_context` success and resolved scope;
- one authorized read-only domain operation;
- logout/reconnect behavior;
- reinstall idempotency;
- upgrade behavior with a customer extension present; and
- uninstall or rollback outcome.

## Release gates

- The VM receives no repository checkout or developer home-directory files.
- Installation succeeds without Git, npm, Node.js, Python, Homebrew, or Xcode.
- The BOS key is present only in MCP session memory.
- Generated MCP and Codex configuration contain no secret value.
- Missing or invalid BOS authentication fails closed and prompts
  `bos_authenticate`.
- Missing, expired, revoked, or insufficient OAuth authorization automatically
  starts provider login, polls completion, and resumes once.
- Missing API-key credentials automatically prompt the customer, pass the
  secret through MCP, store it encrypted in BOS, verify it, and resume once.
- Plugin installation is idempotent.
- Package-owned files are replaced during upgrade.
- Customer extension files remain unchanged during upgrade.
- A new Codex task discovers the expected qualified skills and BOS tools.
- The installer and disk image pass Gatekeeper assessment before customer
  distribution.

## Distribution prerequisites

The ZIP workflow requires a public GitHub repository and release. Native
Developer ID signing and notarization remain deferred until the installer
returns to an `.app`, `.pkg`, or `.dmg` distribution.
