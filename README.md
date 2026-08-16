# BOS Operations Center Packages

BOS Operations Center is the canonical source, package generator, validator,
and release system for portable BOS skills and remote MCP client adapters.
Claude Cowork/Desktop, ChatGPT/Codex Desktop, and the Gemini client install
native packages and authorize BOS through host-managed OAuth 2.1. The single
Gemini extension supports both Gemini CLI and Google Antigravity 2.0 Desktop.

## Choose your environment

| Environment | Use it for | Start here |
|---|---|---|
| ChatGPT/Codex Desktop customer | Install and operate Education Center | [Codex installation](#chatgptcodex-desktop) |
| Claude Cowork/Desktop customer | Install and operate Education Center | [Claude installation](#claude-coworkdesktop) |
| Gemini customer | Use Gemini CLI or Antigravity 2.0 Desktop | [Gemini installation](#gemini-cli-and-antigravity-20-desktop) |
| Local plugin development | Edit, regenerate, install, and test an unreleased checkout | [Local development](#local-plugin-development) |
| Maintainer artifact build | Generate credential-free client packages and archives | [Artifact build](#artifact-only-build) |
| Maintainer release validation | Run the live server gate and complete release checks | [Release validation](#complete-release-validation) |
| Optional archive installation | Test or transfer a packaged release without Git marketplace access | [Archive installation](#optional-archive-installation) |
| GitHub Copilot | Use the repository client adapter | [Other clients](#other-clients) |

Customer desktop installation does not use Codex Environment variables, setup
scripts, API-key prompts, cloud-secret names, or operating-system-specific
launchers. The desktop host owns the BOS OAuth grant. Underlying provider
authorization remains a separate BOS-hosted workflow.

## Install

The private Git marketplace is the normal pre-publication installation and
update channel. Installing a plugin grants no organization access. Select
**Connect** or **Sign in** when the host presents it, then complete BOS consent.

Current desktop marketplace release: `0.4.24`. If `0.4.23` is installed,
refresh the marketplace and upgrade or reinstall both plugins before connecting.

### ChatGPT/Codex Desktop

Requirement: ChatGPT Desktop with Codex and plugin support.
[OpenAI's plugin guide](https://developers.openai.com/plugins/build/plugins) documents the
desktop Plugins Directory, connection prompt, and new-task activation flow.

Open a new Codex task and paste:

> Add https://github.com/cody-marcel-dfsm/bos_operations_ceneter as a Codex
> plugin marketplace, install and enable `bos` and `education-center`, connect
> Education Center to BOS through the host's sign-in flow, start a new task if
> required to load the plugin, and verify one authenticated Education Center
> read. Do not request or configure a BOS API key, environment variable,
> secret-manager name, or installed application ID. If authorization is
> incomplete, report `authentication_required`; do not generate an
> unavailable-data report.

Codex reads the repository catalog at
`.agents/plugins/marketplace.json`, installs the plugins into its managed
cache, and loads the registered Education Center app from the plugin's
`.app.json`. That app owns the immutable BOS MCP resource and host-managed OAuth
grant. Start a new task after installation or upgrade.

### Claude Cowork/Desktop

1. Open **Customize → Plugins**.
2. Add
   `https://github.com/cody-marcel-dfsm/bos_operations_ceneter` as a
   marketplace.
3. Install **BOS** and **Education Center**.
4. Select **Connect**, complete BOS sign-in, and start a new Cowork task.
5. Request one authenticated Education Center read to verify the connection.

Claude reads `.claude-plugin/marketplace.json`. The Education Center plugin
contains no API-key field or authorization-header template. Claude discovers
OAuth from the immutable MCP resource and manages the resulting grant.

### Updates

- Refresh or update the `bos-education-center` marketplace.
- Upgrade or reinstall the affected plugin.
- Start a new task so the host loads the updated package.
- Reauthorize only when the host reports that the BOS grant is missing,
  expired, revoked, or incorrectly scoped.

Server-only tool-catalog changes require reconnection and tool rediscovery.
They do not require a different endpoint or a new package.

### Optional archive installation

Use a release archive only for offline transfer or archive-specific testing.
Open the extracted package and follow
[`installer/README_INSTALL.md`](installer/README_INSTALL.md). The archive is
operating-system-neutral and contains no customer credential, local MCP proxy,
or OS-specific launcher.

### Customer settings and extensions

On first use, `education-center-customer-initialization` derives safe
non-secret values, proposes sourced defaults for uncertain values, and lets the
customer accept the complete recommendation in one reply. The customer-owned overlay is
`config/customer-settings.json`; package updates preserve it. Customer
settings select display terminology and provider routes. They never grant
authority.

Ask the agent to specialize a workflow, for example: “Update the
class-operations skill for my location so the planning window defaults to 21
days.” The packaged `manage-customer-extension` skill creates a typed,
customer-owned extension and checks version compatibility. Extensions may
change terminology, defaults, policies, and exceptions. They cannot change
authentication, authorization, MCP routes, system instructions, or tool
grants.

## Customer onboarding

The desktop host authorizes one immutable product resource:

```text
https://dfsm.ai/mcp/apps/leaddirector/education-center
```

BOS maps the validated OAuth grant to canonical actor, tenant, organization,
application, installation, actor role, plugin execution role, capabilities,
and provider credential states. Client prompts, customer settings, and tool
arguments never supply those authority dimensions.

An absent or invalid BOS grant is an authentication error. It must never be
reported as unavailable business data.

### Provider authorization

Provider authorization is separate from BOS connection authorization:

- For an OAuth provider such as Google, BOS returns a short-lived
  authorization transaction. The user signs in directly with the provider,
  BOS stores the scoped grant, and the agent resumes the original operation
  once.
- For an API-key provider, BOS returns a short-lived HTTPS credential-entry
  page. The value goes directly to BOS and never through chat, client files, or
  command arguments.

## Local plugin development

Use this environment when changing canonical sources or testing an unreleased
checkout. It is distinct from customer installation.

### Regenerate packages

```bash
npm install
npm run build:packages
npm run check
npm test
```

`source/` and `products/` are canonical. `clients/` contains generated output.
Change canonical sources, regenerate, and verify generated parity.

### Test Codex locally

Add the repository checkout as a local marketplace:

```bash
codex plugin marketplace add ./
```

Install **BOS** and **Education Center** from the ChatGPT Desktop Plugins
Directory. Confirm that Education Center shows **Connect**, complete BOS OAuth,
and test in a new task. After source changes,
rebuild the packages, update or reinstall the plugin, and use another new task
so the managed cache cannot hide stale output.

For direct canonical-skill development on an authorized machine, use:

```bash
npm run dev:link:codex
```

This links active cached skill directories to canonical `source/` directories.
It is development infrastructure and is absent from customer archives.

### Test Claude locally

Validate and install the local marketplace:

```bash
claude plugin validate .
claude plugin marketplace add ./
claude plugin install education-center@bos-education-center
```

Select **Connect**, complete BOS sign-in, and test in a new Claude/Cowork task.
After source changes, update the marketplace and plugin before retesting.

### Local validation

```bash
npm run check
npm test
git diff --check
```

The package checks enforce generated parity, credential containment, immutable
MCP routes, marketplace structure, customer-neutral source, and disabled-product
exclusion.

## Build and release environments

### Artifact-only build

Generate client packages, deterministic client archives, the release manifest,
and the optional customer archive without claiming live production readiness:

```bash
npm run build:artifacts
npm run check:build
```

Outputs are written under ignored `dist/`. Repository-wide `*.zip` and
`*.tar.gz` files are ignored so generated archives cannot become tracked source.

### Complete release validation

Maintainers configure the release-test environment only:

- `EDUCATION_CENTER_BOS_API_KEY`: approved noninteractive live-smoke
  authorization.
- `EDUCATION_CENTER_SMOKE_TIME_ZONE`: customer overlay IANA timezone used by
  the bounded director-query smoke.

These values are release-gate inputs. They are never customer desktop
installation settings.

Run:

```bash
npm run release:check
```

The release gate regenerates all clients and archives, validates package and
credential safety, runs the full tests, discovers the live Education Center
tool contract, resolves one server-owned context, and executes a bounded
read-only enrollment query. Diagnostics contain sanitized status, tool names,
correlation IDs, and aggregate field-presence counts only.

`npm run release:customer` is an alias for the same complete validated release
workflow. Tags matching `v*` run the customer-release workflow and publish the
versioned and stable archive names.

## Other clients

Claude, ChatGPT/Codex, Gemini CLI, and Antigravity Desktop use host-managed
OAuth for the immutable BOS product resource.

### Gemini CLI and Antigravity 2.0 Desktop

Requirement: current Gemini CLI or
[Google Antigravity 2.0](https://antigravity.google/product/antigravity-2).
Google documents the native
[Antigravity plugin layout](https://antigravity.google/docs/ide/plugins?app=antigravity-ide-),
[desktop MCP setup and OAuth flow](https://antigravity.google/docs/mcp?authuser=0000),
and [Gemini CLI MCP OAuth command](https://geminicli.com/docs/tools/mcp-server/).

Give Hardik this instruction:

> Use the single Gemini client in `clients/gemini`. For Gemini CLI, install
> `clients/gemini/extensions/bos` and
> `clients/gemini/extensions/education-center`, restart Gemini CLI, run
> `/mcp auth education-center`, and complete BOS sign-in. For Antigravity 2.0
> Desktop, copy those same two complete extension directories into
> `~/.gemini/config/plugins/`, restart Antigravity, open Settings >
> Customizations, select Authenticate for `education-center`, complete BOS
> sign-in, and verify one authenticated Education Center read. Preserve the
> directory contents and do not request a BOS API key, token, client secret,
> environment variable, or installed application ID.

The same generated product directory contains `gemini-extension.json` for
Gemini CLI and `plugin.json` plus `mcp_config.json` for Antigravity Desktop.
Both load the same skills and product metadata. Runtime authentication uses
OAuth discovery and the host-managed resource-scoped grant.

### GitHub Copilot

1. Copy `clients/copilot/products/<product>/skills` into the repository's
   supported agent-skills directory.
2. For a runtime product, install its generated `.github/mcp.json` and follow
   that product's README for the current credential adapter.

## Repository map

| Path | Owner |
|---|---|
| `source/platform/` | Tenant-neutral BOS foundations |
| `source/capabilities/` | Reusable business capabilities |
| `source/verticals/` | Industry and franchise specialization |
| `source/runtime/` | Credential-free remote MCP templates |
| `products/` | Versioned product composition manifests |
| `clients/` | Generated client packages |
| `.agents/plugins/marketplace.json` | Repository Codex marketplace |
| `.claude-plugin/marketplace.json` | Repository Claude marketplace |
| `installer/` | Optional archive installation guidance |
| `scripts/` | Generation, validation, installation, and release tools |
| `tests/` | Package, security, portability, and workflow tests |
| `Vault/` | Canonical architecture, decisions, specifications, and reviews |
| `dist/` | Ignored release artifacts |

Private application skill groups may coexist in a managed marketplace while
remaining outside public customer releases. Disabled products are listed in
`clients/disabled-products.json` and excluded from generated marketplaces,
customer archives, installation instructions, and release gates.

## Project documentation

- [Architecture](Vault/docs/architecture.md)
- [Constitution](Vault/docs/CONSTITUTION.md)
- [Desktop marketplace and OAuth decision](Vault/decisions/2026-08-11-desktop-private-marketplace-oauth.md)
- [Detailed design](docs/DESIGN.md)
- [Implementation tasks](docs/IMPLEMENTATION_TASKS.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Skill hierarchy and composition](docs/SKILL_HIERARCHY_AND_COMPOSITION.md)
- [Security policy](SECURITY.md)

## Security invariant

Every tracked file and generated artifact must be safe to publish. The
repository contains no BOS API key, provider API key, OAuth client secret,
access token, refresh token, password, service-account key, private signing
key, customer data, or reusable bootstrap authority.

## License and trademarks

The source code and skills are licensed under Apache License 2.0. Product names,
logos, and marks remain governed by [TRADEMARKS.md](TRADEMARKS.md). See
[NOTICE](NOTICE) for attribution.
