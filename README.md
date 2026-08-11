# BOS Operations Center Packages

## Install in Codex

Requirements: Codex on macOS, Windows, or Linux and the active product's
GCP-provisioned credential in its environment. iCode Operations Center uses
`ICODE_OPERATIONS_BOS_API_KEY`.

1. Open a new Codex task.
2. Paste this instruction into Codex:

   > Install BOS Operations Center from https://github.com/cody-marcel-dfsm/bos_operations_ceneter/releases/latest/download/bos-operations-center.zip. Download and verify the ZIP, follow its README_INSTALL.md for this client, and verify that the remote BOS MCP is configured.

3. Let Codex complete the installation, then start a new Codex task.
4. Ask Codex to perform a BOS operation. It connects directly to BOS over
   HTTPS using the configured API key.

Keep credentials and API keys out of agent chat. The BOS client key comes from
the approved GCP-managed client configuration. Provider setup uses short-lived
BOS-hosted HTTPS flows.

For customer-specific products, initialization first derives safe non-secret
values from the active client, local timezone, connected-account metadata, and
authenticated BOS context. It asks the user one consolidated question for
unresolved or ambiguous values, then writes the completed settings through the
installer's `--settings` flow. Distributable skills contain no customer-specific
values.

This repository is the canonical source, builder, installer, and release
system for portable BOS foundation, product, and vertical Agent Skills
distributed to Codex, Claude, and GitHub Copilot.

The skills are useful as readable operating procedures on their own. Connecting
them to BOS adds tenant-scoped data access, managed integrations, secure
authentication, and authorized execution.

See [docs/DESIGN.md](docs/DESIGN.md) for detailed build meaning,
customer-configuration boundaries, authenticated access policy, first-time
user flow, and release requirements.

Project architecture, constitutional rules, specifications, and durable
decisions live in [Vault/README.md](Vault/README.md). The packaged `bos:oracle`
skill grounds architecture guidance and repository reviews in that evidence.

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

## Build

Maintainers configure the process-scoped `ICODE_OPERATIONS_BOS_API_KEY` and set
`ICODE_SMOKE_TIME_ZONE` to the customer overlay's IANA timezone before running
a complete build. GitHub Actions uses the encrypted
`ICODE_OPERATIONS_BOS_API_KEY` repository secret and the protected
`ICODE_SMOKE_TIME_ZONE` repository variable.

Run the complete credentialed build:

```bash
npm run build
```

The complete build assembles every declared product/client distribution,
creates deterministic product archives and the release manifest, and creates
versioned and stable OS-neutral customer ZIPs under `dist/`. It then uses the
iCode product's process-scoped credential for the live director-query smoke.
Video Ads is disabled and excluded from generated packages, customer archives,
and release gates until its provider and server implementation are ready. A
Video Ads or Arcads configuration state cannot affect iCode. The iCode query
uses the protected
`ICODE_SMOKE_TIME_ZONE` IANA timezone, derives one authenticated context, and
executes the bounded current-local-week enrollment query. When camp records
exist, the smoke reports aggregate student and family-phone field presence as
data-quality evidence without emitting personal values.

Use `npm run build:artifacts` for a credential-free artifact-only build. It
cannot establish production readiness.

Use `npm run build:packages` when developing only canonical/generated client
content without producing deployable archives.

Building does not install a package, configure a customer, print organization
records, or publish a GitHub release. The live smoke returns only status,
correlation IDs, tool names, and aggregate field-presence counts; it never
prints the key or personal record values.

Run `npm run release:check` to rebuild and verify all deployment artifacts,
package structure, tests, and credential safety.

## Distribution

### Maintainer-built cross-platform customer ZIP

Create the customer distribution:

```bash
npm run release:customer
```

This produces:

```text
dist/bos-operations-center-<version>.zip
dist/bos-operations-center.zip
```

`release:customer` is an alias for the complete validated build; ZIP creation
is already part of `npm run build`.

The ZIP includes generated Codex, Claude, Copilot, and Gemini distributions plus
client-specific installation guidance. It contains no executable MCP proxy or
platform runtime. For Codex, give the active agent the public GitHub release URL
and ask it to download, verify, extract, inspect `README_INSTALL.md`, and install
the Codex distribution. Install Claude through the repository marketplace or
Claude's native manual plugin-upload control described below.

Tags matching `v*` run the customer-release workflow on a Linux runner and
attach the versioned and stable ZIP names to the GitHub release.

Maintainers testing an unreleased repository checkout first configure the
credentialed build environment and complete `npm run release:check`. They may
then install the generated development packages and use the machine-local
developer-link workflow.

## Install

Published packages have already passed the complete credentialed build and
live server contract gate. Customer installation uses the packaged files
directly and does not rebuild or revalidate the release.

The packaged `clients/disabled-products.json` is authoritative. An upgrade
removes package-owned MCP registrations and plugins listed there before
converging active products. Video Ads is listed as disabled in this release.

### Codex

1. Download and extract the published customer ZIP.
2. Configure `ICODE_OPERATIONS_BOS_API_KEY` through the approved environment.
   The installer binds the iCode package-owned MCP URL to that product identity
   and reports the runtime current only after the active desktop bearer
   initializes the selected named route and discovers its scoped tools.
3. Inspect the local installation:

   ```bash
   npm run install:inspect -- --product bos
   ```

4. Preview the convergence plan:

   ```bash
   npm run install:plan -- --product bos
   npm run install:plan -- --product icode-operations-center
   ```

5. Apply and verify:

   ```bash
   npm run install:apply -- --product bos
   npm run install:apply -- --product icode-operations-center
   npm run install:verify -- --product bos
   npm run install:verify -- --product icode-operations-center
   ```

6. Run `codex plugin add bos@bos-icode`,
   and `codex plugin add icode-operations-center@bos-icode`.
7. Start or restart Codex once so the host loads the installed plugin and MCP
   registration, then open a new task and perform a representative BOS read.

On macOS, launch ChatGPT/Codex with a process-scoped GCP-managed credential:

```bash
npm run codex:launch:macos -- \
  --binding ICODE_OPERATIONS_BOS_API_KEY=<gcp-secret-name> \
  --replace
```

The launcher reads the secret into memory and starts a new ChatGPT/Codex
instance whose environment contains `ICODE_OPERATIONS_BOS_API_KEY`. It does
not write the
credential to disk or add it to the global GUI launch
environment. `--replace`
closes the currently running ChatGPT instance before launching the scoped one.
If macOS declines graceful termination after active work is saved, add
`--force-replace` to complete the replacement.
It resolves `gcloud` from `PATH`; use `--gcloud <path>` when it is installed
elsewhere.

### Customer extensions

Installed product skills are package-owned, read-only operating procedures.
Package updates back up and replace every managed file. Customer terminology,
defaults, policies, and exceptions belong in customer-owned extension skills,
which updates preserve.

Customer values such as mailbox addresses and per-domain source routes belong
in the preserved `config/customer-settings.json` overlay. The packaged
`customer-settings.template.json` supplies reusable defaults and schema only.
Builds replace the template and managed skills while preserving the overlay, so
customer values never need to be copied into regenerated files.

Ask the agent directly, for example: “Update the class-operations skill for my
location so the planning window defaults to 21 days.” Every product ships the
`manage-customer-extension` skill, which resolves the base skill and customer,
creates or updates a typed customer overlay, and validates it. The overlay may
change terminology, defaults, policies, and exceptions. BOS authority,
credentials, MCP configuration, tool grants, package constraints, and
system/developer instructions retain their canonical owners.

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

1. In Claude, open Customize > Plugins, select **Add marketplace**, then
   **Add from a repository**.
2. Add `https://github.com/cody-marcel-dfsm/bos_operations_ceneter`.
3. Install `iCode Operations Center` from the `bos-icode` marketplace.
4. Confirm Claude's host configuration provides
   `ICODE_OPERATIONS_BOS_API_KEY`. The plugin uses that product identity with
   the package's static
   `/mcp/apps/<application-name>/<skill-group-name>`
   connection.

Use Claude's native plugin UI for installation. A conversational request to
download or execute a GitHub release ZIP is outside the supported installation
path. The repository marketplace exposes the complete plugin source for review
before installation and provides versioned updates through Claude.

### GitHub Copilot

1. Copy `clients/copilot/products/<product>/skills` to `.agents/skills` in the
   target repository.
2. For an application runtime product, install its generated `.github/mcp.json`
   and configure `COPILOT_MCP_<PRODUCT_CREDENTIAL_ENV_VAR>`. For iCode this is
   `COPILOT_MCP_ICODE_OPERATIONS_BOS_API_KEY`. The BOS product is skills-only.

### Gemini CLI

1. Install the selected extension with
   `gemini extensions install clients/gemini/extensions/<product>`.
2. For an application runtime product, complete the extension setting for the
   product credential setting declared by that extension. For iCode this is
   `ICODE_OPERATIONS_BOS_API_KEY`; then restart
   Gemini CLI. The BOS extension
   is skills-only and requires no MCP setting.

The checked-in client directories contain credential-free adapters. A release
may also publish those four directories as downloadable archives for customers
who do not use Git.

Server-side tool-catalog deployments require the active client to reconnect the
configured endpoint and rediscover tools. The installed package, endpoint, and
API key remain unchanged. Reinstall or restart only after a local package,
plugin, or MCP registration change.

## Customer onboarding

Installing a package grants no organization access. For application runtime
products, each secured request forwards that product connection's declared key
over HTTPS. The triggered skill chooses its product connection. BOS maps that key's
bearer principal to the authorized actor, tenant, organization, installation,
role, plugins, capabilities, and provider credential states.

## Disabled products

Video Ads is disabled because its Arcads provider contract and server-side
operations are not ready. Disabled products are absent from generated
marketplaces, customer ZIPs, install instructions, and complete-build gates.
Their credentials and provider health are isolated from every active product
and organization.

### API-key service such as Calimatic

1. Request an operation that requires Calimatic.
2. BOS returns `authorization_required` with a short-lived HTTPS
   credential-collection URL and transaction identifier.
3. The agent opens the URL and the customer submits the key directly to BOS.
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
- `Vault/`: canonical architecture, specifications, decisions, and review
  evidence for this repository.
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
- `clients/gemini/`: Gemini CLI extension packages.
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
