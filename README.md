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
update channel. Installing a plugin grants no organization access. Complete BOS
consent when the host presents **Connect**, **Sign in**, or **Authenticate**.
The package-owned required BOS app declaration renders the native authentication
action and resolves the immutable resource. Its protected-resource challenge
then identifies a signed-out runtime connection and activates OAuth. The
user completes consent, and the agent refreshes tools and resumes the request.

Current desktop marketplace release: `0.4.76`. If `0.4.75` is installed,
refresh the marketplace and upgrade or reinstall both plugins before connecting.

### ChatGPT/Codex Desktop

Requirement: ChatGPT Desktop with Codex and plugin support.
[OpenAI's plugin guide](https://developers.openai.com/plugins/build/plugins) documents the
desktop Plugins Directory, connection prompt, and new-task activation flow.

Open a new Codex task and paste:

> Clone or update https://github.com/cody-marcel-dfsm/bos_operations_ceneter,
> add its `clients/codex` directory as a Codex plugin marketplace, install and
> enable `bos` and `education-center`, connect
> BOS once through the host's sign-in flow, start a new task if
> required to load the plugin, and verify one authenticated Education Operation Center
> read. Do not request or configure a BOS API key, environment variable,
> secret-manager name, or installed application ID. If authorization is
> incomplete, verify the root package-owned required `.app.json`, use the native BOS
> **Login**, **Connect**, or **Authenticate** action, wait for the user to select
> it and complete browser consent, refresh tools, and resume. The server's 401
> challenge activates runtime OAuth discovery.
> Treat `reauthenticationRequired` as sign-in recovery. If the plugin-page
> action is absent after the registered BOS app loads, preserve the request
> and report an authentication-activation defect.
> Do not launch authentication, generate an unavailable-data report, or use
> generic app permissions for MCP OAuth.

For the Plugins settings form, enter the repository URL above, use `main` as
the Git ref, and leave **Sparse paths** empty. The repository-root
`.agents/plugins/marketplace.json` routes Codex to both generated plugins.

Codex reads the generated catalog at
`clients/codex/.agents/plugins/marketplace.json`, installs the plugins into its managed
cache, and loads the required registered BOS app from the plugin's `.app.json`.
That declaration owns Login display; the resolved BOS resource owns OAuth
activation and the host-managed grant. Education Operation
Center uses that connection without another MCP binding or login. Start a new
task after installation or upgrade. A complete installation must pass
`npm run install:verify:codex-runtime`; this checks the plugin registry,
marketplace registration, installed package versions, required registered-app
binding, and required callable tools together. A package cache alone never
proves that the current task has a callable BOS tool surface.

If Codex reports a fresh package cache while either plugin is absent from the
plugin registry or required Education Operation Center tools are absent, run
the repository's bounded recovery command from a terminal:

```bash
npm run clean-install:codex -- \
  --confirmation "DELETE ALL BOS CODEX PLUGIN STATE"
```

The command removes only product-declared retired accidental BOS account-app
records, the
`bos-education-center` marketplace packages, and cache/catalog records carrying
the canonical BOS MCP resource or retired app identity. It backs up the Codex
global state file before removing those catalog records, stops a running ChatGPT
client, performs the cleanup while the client is stopped, and reopens it
automatically. Before reporting success it verifies that the retired accidental
BOS account apps, installed products, marketplace, wrappers, and targeted caches
are absent while the permanent established account record remains untouched. It
never reinstalls a marketplace or plugin and preserves unrelated plugin state.
Install the intended package explicitly after confirming the client is clean.

### Claude Cowork/Desktop

1. Open **Customize → Plugins**.
2. Add
   `https://github.com/cody-marcel-dfsm/bos_operations_ceneter` as a
   marketplace.
3. Install **BOS** and **Education Operation Center**.
4. Open **Customize → Connectors**. Add the package-owned BOS Web connector when
   it is not already present through your organization
   or Anthropic's Connector Directory:
   - Name: `BOS`
   - URL: `https://dfsm.ai/mcp/apps/bos/platform`
5. Select **Connect** on that Web connector and complete BOS sign-in.
6. Start a new Cowork task and request one authenticated Education Operation
   Center read to verify the connection.

Run `npm run install:verify:claude-runtime` after installation and each update.
The verifier follows Claude's active `plugin list --json` `installPath`, checks
that both active packages match the current release, and reports inactive cache
versions separately. Claude may retain inactive versions for seven days so live
sessions can finish. Those retained directories are never accepted as evidence
that a product is installed.

For a bounded clean recovery, quit every Claude session and run:

```bash
npm run clean-install:claude -- \
  --confirmation "DELETE ALL BOS CLAUDE PLUGIN STATE"
```

This removes the two BOS plugin registrations, the BOS marketplace registration,
and the exact `~/.claude/plugins/cache/bos-education-center` tree, then installs
both products from the current repository and verifies their active paths.

### Local client cache reset

To clear BOS package and catalog cache artifacts from local ChatGPT/Codex and
Claude clients, inspect the exact plan and then apply it:

```bash
./scripts/reset-bos-client-caches.sh --dry-run
./scripts/reset-bos-client-caches.sh \
  --confirmation "DELETE BOS CHATGPT AND CLAUDE CACHES"
```

The command deletes only validated BOS package caches under
`~/.codex/plugins/cache` and `~/.claude/plugins/cache`, plus individual matching
BOS catalog-cache files under `~/.codex/cache`. It never unregisters plugins,
changes account state, edits client configuration, removes personal skills,
touches Gemini or Copilot, or accesses repository files. The legacy
`scripts/uninstall-bos-all-clients.sh` entrypoint delegates to this same bounded
cache reset for safety.

Claude reads `clients/claude/.claude-plugin/marketplace.json`. The BOS plugin owns the account
connector metadata. Education Operation Center contributes skills and contains no
connector or MCP declaration. The BOS account-level Web connector has the persistent
**Connect** control, discovers OAuth from the immutable MCP resource, and stores and
refreshes the resulting grant across tasks.

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

The desktop host authorizes one immutable BOS resource:

```text
https://dfsm.ai/mcp/apps/bos/platform
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
  Calimatic uses this path: the BOS page asks for the Calimatic portal URL and
  API key, stores the validated installation-scoped credential, and the agent
  resumes the blocked request once.

## Local plugin development

Use this environment when changing canonical sources or testing an unreleased
checkout. It is distinct from customer installation.

### Regenerate packages

```bash
npm install
python3 -m pip install -r tools/requirements-dev.txt
python3 tools/vault_index.py sync --quiet
npm run build:packages
npm run check
npm test
```

The repository-local Oracle uses the same Chroma-backed Vault workflow as the
sibling BOS repository. Durable designs, decisions, specifications, issue
history, and reviews live under `Vault/`. During Vault editing, run
`python3 tools/vault_index.py watch --daemon`; query related implementation and
regression history with `python3 tools/vault_index.py query "<question>"`.

The BOS server repository or CI can verify the portable client/server
connection contract directly:

```bash
npm run contract:check
```

The command reads `contracts/single-bos-mcp-connection.v1.json`, writes a
machine-readable JSON verdict to standard output, and exits nonzero for any
additional connection artifact, subservice MCP declaration, retired
subservice connection identifier, or root-resource mismatch.

Every server release affecting MCP authentication must also pass the client-owned
signed-out discovery probe against the deployed candidate environment:

```bash
npm run contract:oauth-discovery-live -- \
  --resource-url "$BOS_MCP_RESOURCE_URL" \
  --format json
```

For staging, `BOS_MCP_RESOURCE_URL` is the deployed candidate's exact BOS
platform resource. The probe requires the HTTP 401 canonical
protected-resource challenge and structured `authentication_required` error.
The installed registered-app connection supplies the host with the BOS identity
and OAuth activation route. The pre-consent tool manifest exposes capability
descriptors and per-tool OAuth scopes without customer data or business
execution. Validate that selected-tool contract against the deployed candidate:

```bash
npm run contract:oauth-tool-auth-live -- \
  --resource-url "$BOS_MCP_RESOURCE_URL" \
  --tool bos_get_context \
  --format json
```

The probe requires `bos_get_context` to declare an OAuth `securitySchemes`
entry and its signed-out invocation to return `isError: true` with
`_meta["mcp/www_authenticate"]`, including `resource_metadata`, `error`, and
`error_description`, without structured business data. After the user
authenticates, the host refreshes authority-scoped tool state, calls
`bos_get_context`, and resumes the original request.

The BOS server integration suite must also generate a valid, short-lived DCR
authorization URL for the canonical resource and pass it to the live OAuth
contract probe:

```bash
npm run contract:oauth-live -- --authorize-url "$BOS_OAUTH_AUTHORIZE_URL" --format json
```

The probe stops at the first redirect. It requires a 302/303/307 response to
`accounts.google.com` with `prompt` containing `select_account`; an HTTP 500,
the wrong provider, or automatic account selection fails the contract. After
the selected Google identity returns, the BOS server resolves organization and
role from that verified identity on every authorization. The client never
chooses or stores an organization mapping.

The live contract and registered-app diagnostic tools emit one redacted NDJSON
event to standard error for every outbound request and one correlated response
or error event. Events include `request_id`, method, sanitized URL, headers,
bounded body, status, and duration. Authorization, cookies, OAuth values,
account identifiers, and organization identifiers are redacted. Standard output
remains the machine-readable contract result. Tracing is enabled by default;
set `BOS_HTTP_DEBUG=0` only when quiet output is explicitly required.

Diagnose the installed BOS declaration and its authenticated GPT connector
resolution without starting authentication:

```bash
npm run diagnose:codex-app -- --format json
```

The command records the local `plugin/read`, account-plugin listing, and exact
connector metadata GET. A declared BOS app paired with connector HTTP 404 is a
client registration/display failure. It is not an MCP transport or OAuth
failure and must never hide the plugin-page **Connect** action.

`source/` and `products/` are canonical. `clients/` contains generated output.
Change canonical sources, regenerate, and verify generated parity.

### Test Codex locally

The BOS product contract is authored only in `products/bos/product.json`.
Inspect its established connector with `npm run product:codex -- inspect`.
Apply supported mutable name and description metadata with `npm run
product:codex -- sync`; the command patches the permanent ID and post-verifies
that same record and BOS resource. When the established record is missing or
its resource binding differs, the command reports the exact registry-owner
correction and performs zero account mutation because the available create
route mints a different identity. The command never enters new-product
provisioning for BOS. `provision` applies
only to a different disabled product explicitly authored as
`UNPROVISIONED_NEW` and reconciles an interrupted prior creation before
retrying.

Add the repository checkout as a local marketplace:

```bash
codex plugin marketplace add ./clients/codex
```

Install **BOS** and **Education Operation Center** from the ChatGPT Desktop Plugins
Directory. Confirm the BOS plugin loads its package-owned required `.app.json` and the
host displays its native **Login**, **Connect**, or **Authenticate** action when
needed. For a signed-out BOS-dependent prompt, the resolved registered app makes
the installed capability available, and the requested BOS tool's OAuth descriptor
permits selection without business execution. Its signed-out
`_meta["mcp/www_authenticate"]` result renders the simple inline action in the
current chat before the host loads authority-scoped tools. The BOS resource
remains protected. If the OAuth tool descriptor or challenge is absent, preserve
the request and report the exact tool-auth-contract defect. If both exist and the
host still omits the action, report a client authentication-activation defect. The
agent does not invoke CLI login or launch authentication. Complete the
browser consent yourself; the agent then refreshes tools and resumes. Test
Education Operation Center
in a new task. After source changes,
rebuild the packages, update or reinstall the plugin, and use another new task
so the managed cache cannot hide stale output. Run
`npm run install:verify:codex-runtime` after reopening Codex. Use
`npm run clean-install:codex -- --confirmation "DELETE ALL BOS CODEX PLUGIN STATE"`
with Codex fully quit when verification identifies orphaned registry or catalog
state.

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
claude plugin validate ./clients/claude
claude plugin marketplace add ./clients/claude
claude plugin install bos@bos-education-center
claude plugin install education-center@bos-education-center
```

Under **Customize → Connectors**, add or select the account-level `BOS` Web
connector, select **Connect**, complete BOS sign-in once, and test the installed
subservices in a new Claude/Cowork task.
After source changes, update the marketplace and plugin before retesting.

### Local validation

```bash
python3 tools/vault_index.py sync --quiet
npm run check
npm test
git diff --check
```

The package checks enforce generated parity, credential containment, immutable
MCP routes, marketplace structure, customer-neutral source, and disabled-product
exclusion.

Every repository mutation then receives a repository-local Oracle review of the
complete actual diff and focused validation evidence. `REJECTED` blocks
completion; every correction requires a fresh review until the verdict is
`APPROVED`.

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
OAuth for the immutable BOS resource. Claude provisions it as one account-level
Web connector owned by the BOS plugin. Subservice plugins use that connection.

### Gemini CLI and Antigravity 2.0 Desktop

Requirement: current Gemini CLI or
[Google Antigravity 2.0](https://antigravity.google/product/antigravity-2).
Google documents the native
[Antigravity plugin layout](https://antigravity.google/docs/ide/plugins?app=antigravity-ide-),
[desktop MCP setup and OAuth flow](https://antigravity.google/docs/mcp?authuser=0000),
and [Gemini CLI MCP OAuth command](https://geminicli.com/docs/tools/mcp-server/).

Give Hardik this instruction:

> Use the single Gemini client in `clients/gemini`. For Gemini CLI, install
> both products with `npm run clean-install:gemini -- --confirmation
> "DELETE ALL BOS GEMINI EXTENSION STATE"`, restart Gemini CLI, run
> `/mcp auth platform`, and complete BOS sign-in once. For Antigravity 2.0
> Desktop, run `./scripts/clean-install-antigravity.sh` once from the synced repository.
> This is an intentionally destructive clean install: it deletes prior BOS product
> folders and symlinks from `~/.gemini/config/plugins/`, including local
> customizations, without backups. The installer shows this warning and requires
> you to type `DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS` before it changes any
> files. It then creates one symlink for every generated Gemini product and
> locates the repository from its own file path.
> After each Git pull,
> restart Antigravity, open Settings >
> Customizations, select Authenticate for `platform`, complete BOS
> sign-in, and verify one authenticated Education Operation Center read. Keep the
> synced repository in place and do not request a BOS API key, token, client secret,
> environment variable, or installed application ID.

Run `npm run install:verify:gemini-runtime` after Gemini CLI restarts. It compares
the managed copies under `~/.gemini/extensions` with every generated source file
and validates Gemini's native install metadata. Run
`npm run install:verify:antigravity-runtime` after Antigravity restarts; it
requires every BOS product path to resolve to the current repository symlink and
release metadata.

The same generated product directory contains `gemini-extension.json` for
Gemini CLI and `plugin.json` plus `mcp_config.json` for Antigravity Desktop.
Both load the same skills and product metadata. Runtime authentication uses
OAuth discovery and the host-managed resource-scoped grant.

### GitHub Copilot

1. Install `clients/copilot/products/bos` for the BOS connection and copy the
   required subservice skills from `clients/copilot/products/<product>/skills` into the repository's
   supported agent-skills directory.
2. Install the BOS product's generated `.github/mcp.json` for Copilot CLI,
   or copy its server entry into `.vscode/mcp.json` for Copilot in VS Code.
3. Run `/mcp auth platform` in Copilot CLI or select `Auth` above the VS Code
   server entry, then complete BOS sign-in.
4. Run `npm run install:verify:copilot-runtime -- --target <repository>
   --product education-center`. The verifier compares the target repository's
   MCP entry and product skills directly with the generated package. Copilot's
   repository adapter has no BOS package-cache layer.

Copilot cloud agent and code review currently lack remote MCP OAuth support, so
the BOS runtime plugin is unavailable on those two hosts.

## Repository map

| Path | Owner |
|---|---|
| `source/platform/` | Tenant-neutral BOS foundations |
| `source/capabilities/` | Reusable business capabilities |
| `source/verticals/` | Industry and franchise specialization |
| `products/bos/product.json` | Sole BOS product, connector identity, and MCP resource authority |
| `products/` | Versioned product composition manifests |
| `clients/` | Generated client packages |
| `.agents/skills/` | Repository-maintainer skills excluded from customer products |
| `clients/codex/.agents/plugins/marketplace.json` | Generated Codex marketplace |
| `clients/claude/.claude-plugin/marketplace.json` | Generated Claude marketplace |
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
- [Detailed design](Vault/docs/DESIGN.md)
- [Implementation tasks](Vault/docs/IMPLEMENTATION_TASKS.md)
- [Implementation status](Vault/docs/IMPLEMENTATION_STATUS.md)
- [Skill hierarchy and composition](Vault/docs/SKILL_HIERARCHY_AND_COMPOSITION.md)
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
