# macOS clean-install acceptance

## Customer outcome

A customer starts from a supported Apple-silicon Mac with Codex installed,
opens one signed and notarized Infinite State Machines installer, enters one
BOS client key in a native secure field, and finishes with the BOS and selected
product plugins installed and enabled. A new Codex task discovers the packaged
skills and can call `bos_get_context`.

Git, Node.js, npm, Python, Xcode, Homebrew, and repository access are not
customer prerequisites.

## Authentication boundary

Codex authentication and BOS authentication are separate:

- Codex owns ChatGPT or OpenAI API-key login through its supported login UI.
- The Infinite State Machines installer accepts only a BOS client key.
- The BOS key exists in installer memory only long enough to write it to macOS
  Keychain.
- The key never appears in a process argument, environment variable, generated
  MCP configuration, plugin file, log, shell history, crash report, or
  clipboard operation performed by the installer.
- The bundled MCP runtime reads the key from Keychain at execution time.
- BOS resolves tenant, organization, application, installation, role, plugin,
  capability, and provider scope from the authenticated key and canonical
  server records.

The customer credential profile contains non-secret Keychain lookup metadata:

```json
{
  "schema_version": "1",
  "profiles": [
    {
      "name": "default",
      "keychain_service": "com.infinitestatemachines.bos.default",
      "keychain_account": "bos-client"
    }
  ]
}
```

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
6. Launches the separate secure connection command.
7. Accepts the BOS key through a hidden native macOS dialog and pipes it
   directly to the Keychain command.
8. Writes the non-secret credential-profile file with mode `0600`.
9. Directs the customer to start a new Codex task.

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
- The BOS key is present only as a Keychain item.
- Generated MCP and Codex configuration contain no secret value.
- A missing, invalid, or unauthorized key fails closed and provides a reconnect
  action.
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
