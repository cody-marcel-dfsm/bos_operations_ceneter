# BOS Operations Center Packages

BOS Operations Center is the canonical source, package generator, validator,
and release system for portable BOS skills and remote MCP client adapters.
Claude Cowork/Desktop, ChatGPT/Codex Desktop, and the Gemini client install
native packages and authorize BOS through host-managed OAuth 2.1. The single
Gemini extension supports both Gemini CLI and Google Antigravity 2.0 Desktop.

## Choose your environment

| Environment | Use it for | Start here |
|---|---|---|
| ChatGPT/Codex Desktop customer | Install and operate Education Operation Center | [Codex installation](#chatgptcodex-desktop) |
| Claude Cowork/Desktop customer | Install and operate Education Operation Center | [Claude installation](#claude-coworkdesktop) |
| Gemini customer | Use Gemini CLI or Antigravity 2.0 Desktop | [Gemini installation](#gemini-cli-and-antigravity-20-desktop) |
| Local plugin development | Edit, regenerate, install, and test an unreleased checkout | [Local development](#local-plugin-development) |
| Maintainer release validation | Regenerate client packages and run credential-free local checks | [Release validation](#release-validation) |
| GitHub Copilot | Use the repository client adapter | [Other clients](#other-clients) |

Customer desktop installation does not use Codex Environment variables, setup
scripts, API-key prompts, cloud-secret names, or operating-system-specific
launchers. The desktop host owns the BOS OAuth grant. Underlying provider
authorization remains a separate BOS-hosted workflow.

## Install

The private Git marketplace is the normal pre-publication installation and
update channel. Installing a plugin grants no organization access. Select
**Connect** or **Sign in** when the host presents it, then complete BOS consent.

Current desktop marketplace release: `0.4.41`. If `0.4.40` is installed,
refresh the marketplace and upgrade or reinstall both plugins before connecting.

### ChatGPT/Codex Desktop

Requirement: ChatGPT Desktop with Codex and plugin support.
[OpenAI's plugin guide](https://developers.openai.com/plugins/build/plugins) documents the
desktop Plugins Directory, connection prompt, and new-task activation flow.

Open a new Codex task and paste:

> Add https://github.com/cody-marcel-dfsm/bos_operations_ceneter as a Codex
> plugin marketplace, install and enable `bos` and `education-center`, connect
> Education Operation Center to BOS through the host's sign-in flow, start a new task if
> required to load the plugin, and verify one authenticated Education Operation Center
> read. Do not request or configure a BOS API key, environment variable,
> secret-manager name, or installed application ID. If authorization is
> incomplete, report `authentication_required`; do not generate an
> unavailable-data report.

Codex reads the repository catalog at
`.agents/plugins/marketplace.json`, installs the plugins into its managed
cache, and loads the registered Education Operation Center app from the plugin's
`.app.json`. That app owns the immutable BOS MCP resource and host-managed OAuth
grant. Start a new task after installation or upgrade.

### Claude Cowork/Desktop

1. Open **Customize → Plugins**.
2. Add
   `https://github.com/cody-marcel-dfsm/bos_operations_ceneter` as a
   marketplace.
3. Install **BOS** and **Education Operation Center**.
4. Start a new Cowork task and make an Education Operation Center request.
5. Claude loads the packaged `education-center` connector and presents BOS
   sign-in automatically when authorization is required.
6. Complete the secure sign-in interaction; the agent resumes the request.

Claude reads `.claude-plugin/marketplace.json`. The Education Operation Center
plugin contains skills plus one `.mcp.json` declaration for its immutable HTTPS
resource. Installing the plugin registers that connector automatically; users
never add or type its URL. Claude discovers OAuth from the resource and stores
and refreshes the resulting grant. The package contains no API-key field,
authorization-header template, or reusable credential.

### Updates

- **Independent Claude Git marketplace:** A release on the tracked Git ref makes
  the new version discoverable. In Claude Desktop, open **Customize → Plugins →
  Browse → Code**, select `bos-education-center`, open **Marketplace options**,
  and select **Check for updates**. The similarly named **Refresh marketplace**
  control on the Anthropic tab refreshes `claude-plugins-official`; it does not
  refresh this independently added Git marketplace. The equivalent Claude Code
  command is `claude plugin marketplace update bos-education-center`. Claude
  Code accounts may instead enable marketplace auto-update. A publisher-side
  build cannot force a refresh in another user's account.
- **Claude organization marketplace:** Maintainers publish each new Claude plugin version by merging a version-bump
  pull request into the connected repository's default branch. With **Sync
  automatically** enabled under Claude Organization Settings → Plugins, that
  merge tells Claude to synchronize its hosted marketplace copy for every
  organization user.
- **Official Anthropic marketplace:** Submit the new version through Claude's
  plugin submission form. Anthropic review and publication provide the central
  distribution path for unrelated personal accounts.
- **Claude installed plugin:** After the BOS marketplace update check completes,
  open the installed plugin and select **Update**. Claude replaces the installed
  cached version in place; uninstalling and reinstalling is unnecessary.
- **Private ChatGPT/Codex Git marketplace:** Run
  `codex plugin marketplace upgrade bos-education-center`, update or reinstall
  the affected plugin, and start a new task. OpenAI tracks the resulting Git
  snapshot; the pull-request history is not an OpenAI update trigger.
- **Public ChatGPT/Codex Plugins Directory:** Submit, obtain approval for, and
  publish the new plugin version through the OpenAI Platform. The public
  directory uses submitted snapshots rather than the repository marketplace.
- Start a new task so the host loads the updated package.
- Reauthorize only when the host reports that the BOS grant is missing,
  expired, revoked, or incorrectly scoped.

Server-only tool-catalog changes require reconnection and tool rediscovery.
They do not require a different endpoint or a new package.

### Customer settings and extensions

On first use, every Education Operation Center skill validates customer settings
before its normal workflow. Missing, incomplete, or invalid settings invoke
`education-center-customer-initialization` automatically, preserve the original
request through setup, and resume it after the accepted settings are revalidated.
The initializer derives safe non-secret values, proposes sourced defaults for
uncertain values, and lets the customer accept the complete recommendation in one reply.
The customer-owned overlay is
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

The BOS plugin includes `bos-guided-support`, a visual client-side support skill
that works before MCP is connected. When a user is stuck, paste:

> Help me get BOS connected and working. Show my progress through Install, Load,
> Register, Sign in, Discover, and Verify. Give me one action at a time, ask for
> a screenshot when the current state is unclear, and confirm success with one
> authenticated read. Never ask me for a BOS API key or token.

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
  authorization transaction. The agent presents that path automatically in the
  active request, the user signs in directly with the provider, BOS stores the
  scoped grant, and the agent verifies readiness and resumes the original
  operation once.
- For an API-key provider, BOS returns a short-lived HTTPS credential-entry
  page and the agent presents it automatically in the active request. The value
  goes directly to BOS and never through chat, client files, or command arguments.

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

Install **BOS** and **Education Operation Center** from the ChatGPT Desktop Plugins
Directory. Confirm that Education Operation Center shows **Connect**, complete BOS OAuth,
and test in a new task. After source changes,
rebuild the packages, update or reinstall the plugin, and use another new task
so the managed cache cannot hide stale output.

For direct canonical-skill development on an authorized machine, use:

```bash
npm run dev:link:codex
```

This links active cached skill directories to canonical `source/` directories.
It is development infrastructure and is absent from installed customer
packages.

### Test Claude locally

Validate and install the local marketplace:

```bash
claude plugin validate .
claude plugin marketplace add ./
claude plugin install education-center@bos-education-center
```

Start a new Claude/Cowork task and make an eligible Education Center request.
Claude loads the packaged connector and presents BOS sign-in automatically when
required. Never add a custom connector or enter the resource URL separately.
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

## Release validation

Release validation is credential-free and local. It regenerates canonical
client packages, checks generated parity and credential containment, and runs
the complete test suite. It creates no ZIPs, tarballs, customer archives, or
release manifests and performs no live MCP call.

Run:

```bash
npm run release:check
```

Publish a release through a release branch and merged pull request. That merge
provides Claude's documented organization-marketplace synchronization trigger
only when the repository is connected to an organization marketplace with
**Sync automatically** enabled. Independent marketplaces refresh per account,
and official Anthropic marketplace versions use the submission portal. The
generated Claude `plugin.json` is the single version authority; the Claude
marketplace catalog intentionally omits duplicate version fields.

The desktop host verifies live BOS access after installation through its
host-managed OAuth connection. Repository release commands never accept or
retrieve a reusable BOS access token.

## Other clients

Claude, ChatGPT/Codex, OAuth-capable Copilot hosts, Gemini CLI, and Antigravity Desktop use host-managed
OAuth for the immutable BOS product resource. A Claude runtime plugin declares
the connector directly so installation registers it automatically.

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
> Desktop, run `scripts/install-antigravity.mjs` once from the synced repository.
> This is a clean install: it deletes prior BOS product folders and symlinks from
> `~/.gemini/config/plugins/` without backups, then creates one symlink for every
> generated Gemini product. It locates the repository from its own file path.
> This bootstrap path is for an uncustomized installation and stops if it detects
> customer-owned extension metadata.
> After each Git pull,
> restart Antigravity, open Settings >
> Customizations, select Authenticate for `education-center`, complete BOS
> sign-in, and verify one authenticated Education Operation Center read. Preserve the
> directory contents and do not request a BOS API key, token, client secret,
> environment variable, or installed application ID.

The same generated product directory contains `gemini-extension.json` for
Gemini CLI and `plugin.json` plus `mcp_config.json` for Antigravity Desktop.
Both load the same skills and product metadata. Runtime authentication uses
OAuth discovery and the host-managed resource-scoped grant.

### GitHub Copilot

1. Copy `clients/copilot/products/<product>/skills` into the repository's
   supported agent-skills directory.
2. Install the runtime product's generated `.github/mcp.json` for Copilot CLI,
   or copy its server entry into `.vscode/mcp.json` for Copilot in VS Code.
3. Run `/mcp auth <group>` in Copilot CLI or select `Auth` above the VS Code
   server entry, then complete BOS sign-in.

Copilot cloud agent and code review currently lack remote MCP OAuth support, so
the BOS runtime plugin is unavailable on those two hosts.

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
| `scripts/` | Generation, validation, installation, and release tools |
| `tests/` | Package, security, portability, and workflow tests |
| `Vault/` | Canonical architecture, decisions, specifications, and reviews |

Private application skill groups may coexist in a managed marketplace while
remaining outside public customer releases. Disabled products are listed in
`clients/disabled-products.json` and excluded from generated marketplaces,
installation instructions, and release checks.

## Project documentation

- [Architecture](Vault/docs/architecture.md)
- [Constitution](Vault/docs/CONSTITUTION.md)
- [Desktop marketplace and OAuth decision](Vault/decisions/2026-08-11-desktop-private-marketplace-oauth.md)
- [OAuth-only runtime product decision](Vault/decisions/2026-08-16-all-runtime-products-oauth-only.md)
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
