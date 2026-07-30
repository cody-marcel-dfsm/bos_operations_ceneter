# BOS Operations Center Packages

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

6. Run `codex plugin add bos@personal` when using the default personal
   marketplace.
7. Start a new Codex task and select **Connect BOS** when organization data is
   first required.

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

Installing the package grants no organization access. On first use, the client
loads its customer configuration, the user completes **Connect BOS**, and BOS
resolves the authorized tenant, capabilities, and provider credential states.
Every secured organization operation requires that authenticated BOS path.
There is no unauthenticated or alternate-provider fallback.

### API-key service such as Calimatic

1. Install the client package and choose **Connect BOS**.
2. Select the organization and Calimatic integration.
3. Open the secure BOS setup page and enter the Calimatic API key there.
4. Return to the assistant; it verifies the connection and retries the request.

The API key must never be pasted into chat, a prompt, an MCP tool argument, a
configuration file, or this repository.

### Google service such as Gmail

1. Install the client package and choose **Connect BOS**.
2. Select the organization and Gmail integration.
3. Open the secure BOS authorization page, sign in to Google, and approve the
   requested scopes.
4. Return to the assistant; it verifies the connection and retries the request.

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

Customers authenticate after installation through BOS. Provider OAuth and
API-key entry occur only through secure BOS-hosted onboarding pages.

Run `npm run release:check` before every release. See [SECURITY.md](SECURITY.md)
for disclosure and credential-response procedures.

## License and trademarks

The source code and skills are licensed under Apache License 2.0. Product names,
logos, and marks remain governed by [TRADEMARKS.md](TRADEMARKS.md). See
[NOTICE](NOTICE) for attribution.
