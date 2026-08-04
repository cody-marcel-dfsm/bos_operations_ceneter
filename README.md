# BOS Operations Center Packages

## Install in Codex on macOS

Requirements: Apple-silicon Mac, Codex installed, and Codex signed in.

1. Open a new Codex task.
2. Paste this instruction into Codex:

   > Install BOS Operations Center from https://github.com/cody-marcel-dfsm/bos_operations_ceneter/releases/latest/download/bos-operations-center-macos.zip. Download and verify the ZIP, follow its README_INSTALL.md, install it, and verify that the BOS MCP is configured.

3. Let Codex complete the installation, then start a new Codex task.
4. Ask Codex to perform a BOS operation. When authentication is required,
   enter your credential in the local **Connect BOS** window that opens.

Keep credentials and API keys out of Codex chat. BOS collects them only through
the local secure handoff window.

This repository is the canonical source, builder, installer, and release
system for portable BOS foundation, product, and vertical Agent Skills
distributed to Codex, Claude, and GitHub Copilot.

The skills are useful as readable operating procedures on their own. Connecting
them to BOS adds tenant-scoped data access, managed integrations, secure
authentication, and authorized execution.

See [docs/DESIGN.md](docs/DESIGN.md) for the canonical architecture, build
meaning, customer-configuration boundary, authenticated access policy,
first-time user flow, and release requirements.

See [docs/IMPLEMENTATION_TASKS.md](docs/IMPLEMENTATION_TASKS.md) for the
dependency-ordered implementation backlog and acceptance criteria.

See
[docs/SKILL_HIERARCHY_AND_COMPOSITION.md](docs/SKILL_HIERARCHY_AND_COMPOSITION.md)
for skill availability by working-directory scope, the BOS plugin namespace,
and the design for Lead Director and other applications to specialize reusable
BOS foundation skills.

See
[docs/LOCAL_FIRST_SKILL_IMPLEMENTATION_PLAN.md](docs/LOCAL_FIRST_SKILL_IMPLEMENTATION_PLAN.md)
for the dependency-ordered local rollout, Lead Director composition tests,
package promotion, and idempotent installer/reconciler design.

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for completed
capabilities, local validation evidence, and the remaining client smoke tests.

See
[docs/MACOS_CLEAN_INSTALL_ACCEPTANCE.md](docs/MACOS_CLEAN_INSTALL_ACCEPTANCE.md)
for the native installer security contract and resettable clean-macOS
acceptance environment.

## Build

Run:

```bash
npm run build
```

Building assembles every declared product/client distribution from canonical
skills in `source/platform`, `source/capabilities`, and `source/verticals`.
It does not install a package, configure a customer, authenticate BOS, access
organization data, or publish a release.

Run `npm run release:check` to rebuild all client packages and validate package
structure and credential safety.

## Install

### Customer ZIP for macOS

Create the self-contained Apple-silicon customer archive:

```bash
npm run release:customer
```

This produces:

```text
dist/bos-operations-center-macos-<version>.zip
dist/bos-operations-center-macos.zip
```

The ZIP includes the Codex marketplace, BOS and iCode plugins, a Codex-executed
installer, and a self-contained BOS MCP broker. Customers need macOS and a
signed-in Codex installation. Give Codex the public GitHub release URL and ask
it to download, verify, extract, inspect `README_INSTALL.md`, and install the
package. On the first secured request, the BOS MCP opens a one-time loopback
credential page. The customer enters the credential there, outside chat.

Tags matching `v*` run the customer-release workflow on GitHub's Apple-silicon
macOS runner and attach the versioned and stable ZIP names to the GitHub
release.

### Codex

1. Download or clone this repository.
2. Run `npm run release:check`.
3. Inspect the local installation:

   ```bash
   npm run install:inspect -- --product bos
   ```

4. Preview the convergence plan:

   ```bash
   npm run install:plan -- --product bos
   ```

5. Apply and verify:

   ```bash
   npm run install:apply -- --product bos
   npm run install:verify -- --product bos
   ```

6. Run `codex plugin add bos@bos-icode` and
   `codex plugin add icode-operations-center@bos-icode`.
7. Start a new Codex task and select **Connect BOS** when organization data is
   first required.

### Customer extensions

Installed product skills are package-owned, read-only operating procedures.
Package updates back up and replace every managed file. Customer terminology,
defaults, policies, and exceptions belong in customer-owned extension skills,
which updates preserve.

Create an extension beside the packaged skills:

```bash
npm run extension:create -- \
  --product icode-operations-center \
  --base-skill icode-class-operations \
  --site cherry-creek
```

The extension explicitly composes the qualified packaged skill and contains
only customer additions. `install:inspect`, `install:plan`, and
`install:verify` report extension compatibility warnings when the packaged
version changes. Review and retest the extension after such a warning.

Direct edits to package-owned files are temporary. The next package apply
creates a recoverable backup and restores the released content.

### Machine-local developer links

On an authorized development machine, the active Codex cache can link directly
to canonical skill directories:

```bash
npm run dev:link:codex
```

The command backs up each active skill directory and replaces it with a
directory symlink to its canonical `source/` directory. Edits made through the
active Codex path or repository path then change the same files. Repeated runs
are idempotent.

This mode is local developer infrastructure. It is absent from release
archives, customer installation behavior, and package ownership rules. Re-run
the command after Codex installs or replaces a cached plugin version.

### Claude

1. Run `npm run release:check`.
2. Install the selected package from `clients/claude/plugins/<product>`.
3. Select **Connect BOS** when Claude first needs organization data.

### GitHub Copilot

1. Run `npm run release:check`.
2. Copy `clients/copilot/products/<product>/skills` to `.agents/skills` in the
   target repository.
3. Connect the BOS MCP server using the client’s secure authentication flow.

The checked-in client directories contain credential-free adapters. A release
may also publish those three directories as downloadable archives for customers
who do not use Git.

## Customer onboarding

Installing the package grants no organization access. On the first secured
request, Codex calls `bos_start_authentication`. The MCP opens a one-time local
page, receives the credential directly into MCP session memory, and BOS resolves
the authorized tenant, capabilities, and provider credential states.
Every secured organization operation requires that authenticated BOS path.
There is no unauthenticated or alternate-provider fallback.

### API-key service such as Calimatic

1. Request an operation that requires Calimatic.
2. BOS returns `authorization_required` with a sensitive API-key field.
3. Codex calls `bos_start_provider_credential_handoff`; the customer enters the
   key in the one-time local page rather than the chat composer.
4. BOS validates and encrypts the key, then Codex verifies the connection and
   resumes the original request once.

The API key must never be echoed, logged, written to configuration, or stored
in this repository.

### Google service such as Gmail

1. Request an operation that requires Gmail.
2. BOS returns `authorization_required` with an OAuth transaction and URL.
3. Codex opens the URL; the customer signs in directly with Google and approves
   the requested scopes.
4. BOS receives the callback and stores the resulting tokens. Codex polls the
   transaction, verifies the connection, and resumes the original request once.

Each organization receives its own tenant-scoped provider credential in BOS.
For shared BOS integrations, customers use the BOS Google Cloud project and do
not create individual projects unless their contract requires isolated
branding, billing, quota, or compliance.

## Repository layout

- `source/platform/`: canonical application-neutral BOS foundation skills.
- `source/capabilities/`: canonical reusable business capability skills.
- `source/verticals/`: canonical industry and franchise adaptations.
- `source/runtime/`: credential-free client runtime components.
- `products/`: versioned product composition manifests.
- `source/config/`: public, credential-free product metadata.
- `clients/codex/`: Codex plugin and marketplace package.
- `~/plugins/<product>/skills/*-<site>/`: customer-owned extension skills
  preserved across local package updates.
- `clients/claude/`: Claude plugin package.
- `clients/copilot/`: GitHub Copilot Agent Skills package.
- `scripts/`: deterministic validation and packaging tools.
- `dist/`: generated release archives; ignored by Git.
- `tests/`: package, security, and portability tests.

Client packages are generated from layered canonical source. Client directories
contain platform adapters and generated skill copies.

## Release

Run:

```bash
npm run release
```

The release command validates the complete package and writes deterministic
product/client archives plus `dist/release-manifest.json` containing SHA-256
checksums.

## Security invariant

Every tracked file and generated artifact must be safe to publish publicly.
The repository contains no BOS API key, provider API key, OAuth client secret,
access token, refresh token, password, service-account key, private signing
key, customer data, or reusable bootstrap authority.

Customers authenticate after installation through MCP. OAuth login occurs
directly with the provider through a BOS-created transaction. Customer-supplied
API keys pass once through a sensitive MCP tool field and are encrypted and
stored by BOS.

Run `npm run release:check` before every release. See [SECURITY.md](SECURITY.md)
for disclosure and credential-response procedures.

## License and trademarks

The source code and skills are licensed under Apache License 2.0. Product names,
logos, and marks remain governed by [TRADEMARKS.md](TRADEMARKS.md). See
[NOTICE](NOTICE) for attribution.
