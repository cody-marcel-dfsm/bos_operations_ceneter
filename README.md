# BOS Operations Center Packages

## One BOS login across your authorized organizations and apps

One BOS identity login gives the agent access to the organizations, applications,
installations and eligible assigned roles that identity is currently authorized
to use. GPT and Claude authenticate that identity through OAuth; Muse currently
uses one user-issued BOS identity API key. Both methods use the same discovery,
context-selection and per-operation authorization rules. The agent matches an
explicit requested context or the calling plugin's confirmed defaults against
fresh authorized choices, asks for clarification when necessary, and reuses the
same connection when the context changes. Each operation independently checks
current membership, role, capability, plugin consent and provider policy.
Separate BOS identities retain their own logins, credentials and
authority. Provider consent stays with its provider. Existing restricted grants
and integration keys retain their original limits and migration rules.


## Give AI agents controlled execution over your services — without giving up your infrastructure.

BOS is a service gateway. Companies give AI agents controlled execution of complex workflows through permissioned state machines, with their roles, rules, and approval gates. Your service infrastructure, authoritative business state and data stores, and private implementation IP stay outside the agent host. Authorized inputs and results, public skills, and permitted scoped caches can reach the agent.

BOS is for companies bringing AI into business operations, operations teams that need governed workflow execution, and builders exposing services through supported public contracts. This repository supplies the client skills that help an AI workspace discover capabilities, plan work, and present evidence. BOS Service retains execution authority, state, transitions, and recovery. MCP provides authenticated discovery; deterministic HTTPS APIs execute sanctioned operations.

### Education Operation Center

Education Operation Center helps directors and adult staff at education centers coordinate instructor scheduling, family scheduling, and class scheduling; handle partner relationship interactions and invoicing; and access enrollment information and statuses. It requires BOS plus independently distributed My CRM for generic CRM records and customer journeys. Education Operation Center retains education expertise; My CRM supplies CRM expertise through BOS's existing authenticated connection. Trial reconciliation, camp capacity planning, reviewed family communications, and invoice exceptions are supporting examples. Customer-facing school branding comes from the customer's own settings.

Available workflows depend on authorized discovery, configuration, and provider readiness. Custom ad hoc workflows require the supported authoring and runtime contracts. Discovery and installation confer no business authority; every execution follows server-enforced scope and applicable approvals. Requests, prepared drafts, approved actions, and completed execution remain distinct.

BOS is pre-launch with invite-only access. [Request an invite](https://dfsm.ai/apps/bos/#request-invite) to discuss your workflow. Invitees and existing users can follow the installation instructions below; requesting an invite creates no automatic access.

## Choose your environment

| Environment | Use it for | Start here |
|---|---|---|
| ChatGPT/Codex Desktop customer | Install and operate Education Operation Center | [Codex installation](#chatgptcodex-desktop) |
| Claude Cowork/Desktop customer | Install and operate Education Operation Center | [Claude installation](#claude-coworkdesktop) |
| Gemini customer | Use Gemini CLI or Antigravity 2.0 Desktop | [Gemini installation](#gemini-cli-and-antigravity-20-desktop) |
| Local plugin development | Edit, regenerate, install, and test an unreleased checkout | [Local development](#local-plugin-development) |
| Maintainer release validation | Regenerate client packages and run credential-free local checks | [Release validation](#release-validation) |
| Muse Code | Install native BOS and Education Operation Center skill plugins | [Muse installation](#muse-code) |
| GitHub Copilot | Use the repository client adapter | [Other clients](#other-clients) |

OAuth-capable desktop hosts own BOS consent, token storage and refresh. Muse
currently uses one existing user-issued identity API key in private host
configuration, as described below. Both methods share current authorized
discovery and operation permissions. Package files and conversations receive
no credential. Provider authorization remains a separate BOS-hosted workflow.

## Install

### Required independent CRM product

Education Operation Center declares My CRM as a required independent product dependency for generic CRM records and customer journeys. Install and verify its separately distributed package using the [published My CRM installation and verification guidance](https://github.com/cody-marcel-dfsm/mycrm#validate). Both use BOS's existing connection; no additional BOS login or connection is required. Complete installation verification checks My CRM's required skills and advertised operations. Missing or disabled My CRM blocks dependent CRM work; focused education workflows remain owned by Education Operation Center.

The linked guide documents Codex installation. My CRM also provides an independent [Muse Code package](https://github.com/cody-marcel-dfsm/mycrm#muse-code). Native Muse authentication and workflow acceptance require published-release verification. This release has not established My CRM installation and verification in Claude, Copilot, Gemini, or Antigravity. Verify a supported My CRM distribution for your host before using dependent CRM workflows; this repository's education packages alone do not establish that dependency's availability.

The Git marketplace is the normal pre-publication installation and
update channel. Installing a plugin grants no organization access. On
OAuth-capable hosts, complete BOS consent through **Connect**, **Sign in**, or
**Authenticate**. Muse uses the private identity-key configuration below.
The package-owned BOS MCP declaration supplies the resource. Its
protected-resource challenge
then identifies a signed-out runtime connection and activates OAuth. The
user completes consent, and the agent refreshes tools and resumes the request.

To sign out, ask **“Sign out of BOS.”** The skill invokes the service's
discovered current-connection logout and ends the request. The next protected
BOS request uses the host's native OAuth authentication action. Service logout
availability depends on the deployed BOS contract; the skill reports when that
operation is unavailable.

The BOS product displays as **BOS Platform**. MCP hosts use **BOS-Platform**
as the connection identifier; the platform resource URL remains unchanged.
Upgrading replaces the former `platform` identifier. Hosts may require native
sign-in again when a connection identifier changes; valid-session continuity
has not been verified for this migration.

Current source package release: `0.0.213`. If `0.0.212` is installed,
follow the ordinary [update instructions](#updates) after your host catalog
offers the current release shown above, then verify that the installed package
reports that version. The [release-line transition](#moving-to-the-00x-package-line)
applies only to installations still on `0.4.211`. Source preparation and host
marketplace publication are separate steps.

Version labels identify separate release streams. **BOS Service release/build**
comes from actual current host/server metadata, including a serving revision
when supplied; an unavailable value is reported as **unavailable**. **Client
package release** identifies the installed plugin or extension package.
**Skill component version** comes from each skill's `metadata.version`.
Host versions, MCP protocol versions, and schema identifiers retain their own
labels. Package and skill versions advance independently of the service; static
client manifests carry their own package versions.

### ChatGPT/Codex Desktop

Requirement: ChatGPT Desktop with Codex and plugin support.
[OpenAI's plugin guide](https://developers.openai.com/plugins/build/plugins) documents the
desktop Plugins Directory, connection prompt, and new-task activation flow.

Open a new Codex task and paste:

> Add https://github.com/cody-marcel-dfsm/bos_operations_ceneter
> at its published `main` ref as a Codex plugin marketplace, install and
> enable `bos` and `education-center`, connect **BOS Platform** through the
> host's sign-in flow using the native **BOS-Platform** action, start a new task if
> required to load the plugin, and verify one authenticated Education Operation Center
> read. Do not request or configure a BOS API key, environment variable,
> secret-manager name, or installed application ID. If authorization is
> incomplete, verify the BOS package-owned `.mcp.json`, use BOS Platform's native
> **Login**, **Connect**, or **Authenticate** action, wait for the user to select
> it and complete browser consent, refresh tools, and resume. The server's 401
> challenge activates runtime OAuth discovery.
> Treat `reauthenticationRequired` as sign-in recovery. If the plugin-page
> action is absent after the packaged product MCP resource loads, preserve the request
> and report an authentication-activation defect.
> Do not launch authentication, generate an unavailable-data report, or use
> generic app permissions for MCP OAuth.

For the Plugins settings form, enter the repository URL above, use `main` as
the Git ref, and leave **Sparse paths** empty. The repository-root
`.agents/plugins/marketplace.json` routes Codex to both generated plugins.

Codex reads the generated catalog at
`clients/codex/.agents/plugins/marketplace.json`, installs the plugins into its managed
cache, and loads the BOS platform resource from the BOS plugin's `.mcp.json`.
The framework manages BOS authentication and refresh. Education Operation Center
uses that connection while the server enforces its application permissions.
Start a new
task after installation or upgrade. A complete installation must pass
`npm run install:verify:codex-runtime`; this checks the plugin registry,
marketplace registration, installed package versions, required package MCP
binding, and required callable tools together. A package cache alone never
proves that the current task has a callable BOS tool surface.

If Codex reports a fresh package cache while either plugin is absent from the
plugin registry or required Education Operation Center tools are absent, run
the repository's bounded recovery command from a terminal:

```bash
npm run clean-install:codex -- \
  --confirmation "DELETE ALL BOS CODEX PLUGIN STATE"
```

The command removes the installed BOS plugins and their validated local package
cache. It performs no account mutation, connector lookup, marketplace removal,
or private API request. Reinstall the intended package from the existing local
marketplace afterward.

### Claude Cowork/Desktop

Choose the intended Claude account and personal or organization workspace using
actual host/organization policy and marketplace availability. Confirm access with
the workspace owner when those requirements are unclear.

1. Open **Customize → Plugins**.
2. Add
   `https://github.com/cody-marcel-dfsm/bos_operations_ceneter` as a
   marketplace.
3. Install **BOS** and **Education Operation Center**. The BOS plugin ships
   its own package-owned MCP connection (`mcpServers: "./.mcp.json"`), so no
   separate connector setup is required.
4. Select **Authenticate**/**Connect** on the BOS plugin and complete its
   native sign-in.
5. Start a new Cowork task and request one authenticated Education Operation
   Center read to verify the connection.

Each host keeps its own BOS connection and grant to the same intended BOS
identity. Select the intended BOS context from fresh authorized choices after
sign-in. Reuse a provider connection when current server-returned readiness and
authority permit the operation; follow the advertised connection or recovery
action when required.

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

To clear BOS package cache artifacts from local ChatGPT/Codex and
Claude clients, inspect the exact plan and then apply it:

```bash
./scripts/reset-bos-client-caches.sh --dry-run
./scripts/reset-bos-client-caches.sh \
  --confirmation "DELETE BOS CHATGPT AND CLAUDE CACHES"
```

The command deletes only validated BOS package caches under
`~/.codex/plugins/cache` and `~/.claude/plugins/cache`. It never unregisters plugins,
changes account state, edits client configuration, removes personal skills,
touches Gemini or Copilot, or accesses repository files. The legacy
`scripts/uninstall-bos-all-clients.sh` entrypoint delegates to this same bounded
cache reset for safety.

Claude reads `clients/claude/.claude-plugin/marketplace.json`. The BOS plugin
owns its package-owned `.mcp.json` declaration; dependent plugins own only
their relevant skills and declare no separate MCP binding. The BOS plugin's
native **Authenticate**/**Connect** control discovers
OAuth from its immutable product MCP resource, and stores and refreshes the
resulting grant across tasks.

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
- **Custom ChatGPT/Codex Git marketplace:** Run
  `codex plugin marketplace upgrade bos-education-center`, update or reinstall
  the affected plugin, and start a new task. OpenAI tracks the resulting Git
  snapshot; the pull-request history is not an OpenAI update trigger.
- **Public ChatGPT/Codex Plugins Directory:** Submit, obtain approval for, and
  publish the new plugin version through the OpenAI Platform. The public
  directory uses submitted snapshots rather than the repository marketplace.
- Start a new task so the host loads the updated package.
- Reauthorize only when the host reports that the affected product grant is missing,
  expired, revoked, or incorrectly scoped.

Server-only tool-catalog changes require reconnection and tool rediscovery.
They do not require a different endpoint or a new package.

### Moving to the 0.0.x package line

The client package moves from published `0.4.211` to `0.0.212`. Existing
releases retain their original identities. The package ordinal remains 212;
the service reports its own actual release/build, and skill component versions
retain their independent compatibility floors. This change creates no new
public API, MCP protocol or schema version.

Maintainers prepare this single transition with
`npm run version:next -- --release-line client-zero-minor-line`, then generate
packages and complete the normal reviewed publication workflow. The declaration
in `package-manifest.json` binds both native preparation and committed release
admission to predecessor commit
`0b6a53982a8250b96d2de6da67dc8e7b64d5ab63`, version `0.4.211`, and target
`0.0.212`. Ordinary later releases advance numerically within `0.0.x`.

After publication, confirm that the selected host catalog or source actually
offers the target before replacing an installation. Preserve customer settings
and extensions through the host's supported controls, then verify the installed
package version and source commit when available. Start a fresh session and
follow current BOS connection readiness; a host may require fresh approval or
sign-in.

| Host delivery path | Supported transition and evidence boundary |
| --- | --- |
| Claude Code Git marketplace | Refresh the marketplace, then update both plugins. Claude Code treats the manifest version as an opaque string and updates when it differs; its documented algorithm admits this label change. [Version/update rules](https://code.claude.com/docs/en/plugins/loading#versions-and-updates). |
| Claude Desktop or organization catalog | Use the relevant marketplace update or organization synchronization above. Proceed when that account's catalog offers `0.0.212`; local source changes cannot force a hosted snapshot refresh. Desktop acceptance of this transition requires verification in that published catalog. |
| Codex Git marketplace or public directory | Refresh the Git marketplace, or wait for the reviewed public submission to publish. If the host does not select the target through update, use its supported plugin remove/add controls against the catalog that offers it and verify the installed result. OpenAI documents these separate distribution paths without guaranteeing selection of a numerically lower version. [Plugin distribution](https://developers.openai.com/plugins/build/plugins), [public submission](https://developers.openai.com/plugins/deploy/submission). |
| Muse Code | Updates re-read the recorded source and compare manifest digests. A Git marketplace refresh can leave an installed plugin pointing at its earlier source snapshot; remove and install from the current catalog in that case. Preserve data by omitting `--delete-data`; inspect and approve the new runtime capabilities again. [Source/update rules](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/marketplaces-and-updates/). |
| Gemini CLI | Git installations detect remote commit changes; GitHub Release installations follow the selected latest release tag. Update from the published source and verify `0.0.212`; if a local-path installation does not select it, use supported uninstall/install against that published bundle. Restart Gemini afterward. [Update detection](https://geminicli.com/docs/extensions/releasing/), [installation controls](https://geminicli.com/docs/extensions/reference/). |
| Copilot managed package | Run the repository's supported managed installation workflow from the published target. Its ownership/hash plan records the package version without a numeric ordering gate; preserve customer-owned configuration and verify installed metadata. |
| Antigravity package | Use the documented installation from the published release and its runtime verifier. The package description identifies the client package release; package-owned plugin metadata has no numeric update selector. Native host transition acceptance remains a published-installation check. |

Source tests establish the exact local transition and generated metadata.
Live host migration results require the published target, the installed version
and an observed host outcome; preparation alone supplies no such result.

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

BOS validates OAuth or identity-key proof, then discovers current authorized
organization/application/installation/assigned-role contexts. The BOS client
matches explicit requests or confirmed plugin defaults to safe returned labels
and fresh handles. Every operation revalidates the selected context, permissions,
consent and provider state. Business arguments carry no raw authority selector.

An absent or invalid BOS identity credential is an authentication error. It must never be
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

Build clients for the BOS service gateway: help customers discover supported workflows and keep execution, authoritative state, and permissioning with BOS. Integrate through published contracts; independent plugins retain their domain expertise and release ownership.

BOS Operations Center is the canonical source, package generator, validator,
and release system for portable BOS skills and remote MCP client adapters.
Claude Cowork/Desktop, ChatGPT/Codex Desktop, and the Gemini client install
native packages and authorize BOS through host-managed OAuth 2.1. The single
Gemini extension supports both Gemini CLI and Google Antigravity 2.0 Desktop.

Use this environment when changing canonical sources or testing an unreleased
checkout. It is distinct from customer installation.

### Regenerate packages

```bash
npm install
python3 -m pip install -r tools/requirements-dev.txt
npm run build:packages
npm run check
npm test
```

Maintainers use a private, untracked local knowledge store for architecture,
decisions, specifications, issue history, and reviews. Its contents are never
part of this public repository or its release artifacts.

The BOS server repository or CI can verify the portable client/server
connection contract directly:

```bash
npm run contract:check
```

The command reads `contracts/product-mcp-connections.v1.json`, writes a
machine-readable JSON verdict to standard output, and exits nonzero for any
additional connection artifact, subservice MCP declaration, retired
subservice connection identifier, or root-resource mismatch.

An independently published product can validate its package against the same
public BOS dependency and authentication-handoff contract without copying its
source into this repository:

```bash
node scripts/verify-product-mcp-contract.mjs \
  --external-product-root /absolute/path/to/product-package \
  --format json
```

The package declares BOS as its connection owner and required dependency.
It retains its application skills and uses BOS authentication and recovery.
See `contracts/external-product-dependency.v2.md` and
`contracts/external-product-dependency.v2.schema.json`. Legacy v1 packages can
be checked explicitly with `--external-contract-version 1`; passing that legacy
check does not establish migration to the BOS-owned connection.

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
The installed package MCP resource supplies the OAuth discovery route. After
the user authenticates, the host refreshes authority-scoped tool state, calls
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

The live contract tools emit one redacted NDJSON
event to standard error for every outbound request and one correlated response
or error event. Events include `request_id`, method, sanitized URL, headers,
bounded body, status, and duration. Authorization, cookies, OAuth values,
account identifiers, and organization identifiers are redacted. Standard output
remains the machine-readable contract result. Tracing is enabled by default;
set `BOS_HTTP_DEBUG=0` only when quiet output is explicitly required.

Validate the generated Codex package binding with `npm run check`. After a
fresh client load, run the screenshot-gated native login acceptance with
`npm run acceptance:codex-login -- --screenshot <png> --review <receipt.json> --json`.

`source/` and `products/` are canonical. `clients/` contains generated output.
Change canonical sources, regenerate, and verify generated parity.

### Validate published clients

Implement and validate changes in this repository, then publish a versioned
release through the reviewed Git pull-request workflow. Install from the merged
Git release. Installed client files and managed caches must retain the published
package bytes. Direct copies, development symlinks, and local overrides are
prohibited, including during prompt validation.

For Codex, configure the published Git marketplace:

```bash
codex plugin marketplace add https://github.com/cody-marcel-dfsm/bos_operations_ceneter.git --ref main
codex plugin marketplace upgrade bos-education-center
codex plugin add bos@bos-education-center
codex plugin add education-center@bos-education-center
```

Use supported marketplace removal first if the same marketplace is registered
against an unpublished working checkout. Start a new task after installation
and run `npm run install:verify:codex-runtime`. Verify the ordinary customer
prompt and record the installed release version, commit, and observed result.
The host owns OAuth and presents its native sign-in action when the protected
resource returns the canonical HTTP 401 `WWW-Authenticate` challenge. If the
valid challenge exists and the host omits the action, report a client
authentication-activation defect.

For Claude, use the published Git marketplace and its supported marketplace
update and plugin update controls. Test in a new Claude/Cowork task and record
the same release evidence. Source tests and builds remain local validation.

### Local validation

```bash
python3 tools/vault_index.py sync --quiet
npm run check
npm test
git diff --check
```

The package checks enforce generated parity, credential containment, immutable
MCP routes, marketplace structure, customer-neutral source, and disabled-product
exclusion. They also resolve repository-owned skill references in instructions
and supporting documents through each active product and its declared product
dependencies, rejecting unavailable skills, disabled dependencies, dependency
cycles, and dependencies missing a supported client.

Every repository mutation then receives a repository-local Oracle review of the
complete actual diff and focused validation evidence. `REJECTED` blocks
completion; every correction requires a fresh review until the verdict is
`APPROVED`.

### Maintainer notification transport acceptance

The deterministic notification transport case has two modes. Keep its inputs and
receipts in the private Vault. Neither mode establishes native Muse idle wake.

Validate a candidate owner's bounded public synthetic wire transcript with the
current reviewed client parser:

```bash
npm run acceptance:notifications -- --transcript "$PRIVATE_WIRE_JSON" --evidence-out "$NEW_PRIVATE_RECEIPT_JSON"
```

The transcript uses `bos-journey-notification-wire-observation/v1`, one
`mcp-client-only-hello-world` identity, the full discovered notification descriptor,
two raw SSE streams, the first ready cursor as `resume_cursor`, and a sanitized
HTTP 200 `awaiting_client` state observation. It retains the source/revision/image
tuple and actual public state GET hrefs. Limit the file to 512 KiB, each stream to
eight raw strings and eight parsed frames, and each raw string to 64 KiB. Keep
headers, credentials, context handles and signed lifecycle actions out. A PASS
proves independent validation of supplied wire bytes, contract-facts projection
and replay consistency;
deployment provenance and the state HTTP observation remain supplied evidence.

After the reviewed client release is published and installed through supported
controls, run the authenticated reviewer mode against the existing packaged BOS
resource:

```bash
npm run acceptance:notifications -- --reviewer-config "$PRIVATE_REVIEWER_CONFIG" --bosl-file "$PRIVATE_CLIENT_ONLY_BOSL" --source-revision "$SERVICE_SOURCE_COMMIT" --server-revision "$SERVICE_REVISION" --image-digest "$SERVICE_IMAGE_DIGEST" --evidence-out "$NEW_PRIVATE_RECEIPT_JSON"
```

Use the configured synthetic reviewer identity and its existing hashed authority.
The authority must allow `read` and `write`, and bind
`effect_bindings.notification-transport` to operation
`lead-director.journeys.register`, effect `write`, and the SHA-256 of the exact
`JSON.stringify` BOSL object. The object must contain one terminal client node
with empty journey/node inputs and outputs; it permits no server/provider step.
The case verifies the published package and current reviewer scope, discovers its
contracts, registers that document, observes ready before Start, validates a
change and opaque-cursor replay, refetches current state, and completes the
returned client lifecycle. It revokes the isolated reviewer grant and records
partial cleanup explicitly. The definition remains registered. Active work is
bounded to 90 seconds, 64 request-budget units, two streams and eight lifecycle
actions; unavailable prerequisites return INCOMPLETE. Receipt paths must be new
files under this checkout's private `Vault/tmp`.

Released 0.4.199 rejects the event-stream descriptor; 0.4.200 accepts the
descriptor but its full-contract projection assumes binary response headers.
Publish and install reviewed 0.4.201 before enabling customer notification
discovery/readiness. Candidate-only captured-wire acceptance can precede service
promotion. Actual deployed execution and host-specific wake each retain their
own acceptance evidence.

## Versioned skill sources

Each canonical skill carries its own semantic version and exact inter-skill
requirements in portable Agent Skills frontmatter:

```yaml
metadata:
  version: "1.0.0"
  requires: "{\"bos-mcp-client\":\"1.0.0\"}"
```

`metadata.requires` is a JSON object encoded as a string because the
[Agent Skills specification](https://agentskills.io/specification) defines
metadata values as strings. An empty requirement set is `"{}"`. Read the
skill's frontmatter to identify its version. Package release numbers remain
independent of skill versions and public API versions.

`skill-release-manifest.json` maps every canonical skill/version to the exact
repository release, source directory, complete supporting-file hashes and
executable modes. Per-product effective guidance hashes also bind the existing
generated preflights. Product generation adds its own exact preflight dependency
pins while preserving canonical source requirements and all supporting files.
The five native clients continue to install through their published packages.

To change a skill, bump it before rebuilding:

```bash
npm run skill:version -- bos-cache-maintenance patch
npm run build:packages
npm run check
```

The version command also bumps affected reverse dependents and updates their
exact pins, including generated preflight dependencies. Build/check compare all
earlier committed skill identities even when CI is checking an already
committed candidate. Removal and reintroduction preserve version floors and
effective guidance identities. A changed body, support file, executable mode or effective
generated guidance requires a strictly newer skill version; unchanged versions
can be reused across repository releases. Complete Git history is required.

For a reviewed source import into another repository, run the published tool
from that destination's canonical `main` checkout. Supply the publisher's full
40-character release commit, matching repository release and exact skill version:

```bash
node /path/to/published-client/scripts/import-skill.mjs \
  --repository https://github.com/cody-marcel-dfsm/bos_operations_ceneter.git \
  --commit FULL_RELEASE_COMMIT_SHA \
  --release EXACT_REPOSITORY_RELEASE \
  --skill bos-cache-maintenance@EXACT_SKILL_VERSION \
  --target source/imports/bos-cache-maintenance
```

The importer reads bare Git objects, verifies the complete transitive dependency
closure and every file/mode before materializing source, and retains the immutable
commit/release/version pins in `.skill-import.json`. Exact dependency cycles
terminate deterministically. Conflicting pins, symlinks, unsafe paths, missing,
extra or changed files fail before destination writes. Imports are bounded to
100 skills, 1,000 files and 100 MiB, with a three-minute overall deadline.
An existing canonical skill name outside the import's own target is a conflict,
including an identical dependency; each source directory retains its references
and supporting files. Existing authored changes are preserved; tool-owned
unchanged imports can receive newer skill versions
with rollback on replacement failure. Imported source then follows the consumer's
own review, build and release process. The tool writes only repository `source/`
content; installed skills and plugin caches retain their supported release path.
Each publisher retains its own source and release ownership; this introduces no
sibling source/build dependency, registry, service or public API version.

## Release validation

Release validation is credential-free and local. It regenerates canonical
client packages, checks generated parity and credential containment, and runs
the complete test suite. It deterministically regenerates each active
product's manifest-owned OpenAI skill-snapshot ZIP. It creates no ad-hoc
release ZIPs, tarballs, customer archives or other ad-hoc release artifacts.
Its one requested skill release
manifest is the canonical `skill-release-manifest.json`; validation performs no
live MCP call.

Run:

```bash
npm run release:check
```

To update an existing legacy OpenAI BOS listing, export its required internal
package name from an exact accepted commit already published on `origin/main`:

```bash
node scripts/build-marketplace-update.mjs "$PUBLISHED_COMMIT" "$LEGACY_LISTING_NAME"
```

Supply the listing name through private runtime configuration. The exporter
preserves the released version and every other package byte and file mode,
verifies deterministic archive parity, and keeps the output under private
`Vault/tmp/marketplace-update/`. Reviewer credentials belong in the portal's
review details. Upload, MCP connection, scans, and submission are separate
steps after release validation and publication.

For a legacy listing whose original ZIP has no MCP declaration and whose MCP
app is already associated separately in the dashboard, the owner-approved
marketplace-only option is:

```bash
node scripts/build-marketplace-update.mjs "$PUBLISHED_COMMIT" "$LEGACY_LISTING_NAME" --preserve-existing-mcp
```

This omits only the manifest's MCP declaration in addition to the required
name change. All other files retain release parity. Never install this export
as a standalone client package. Verify upload acceptance, the retained
dashboard association, native login and authorized discovery before claiming
that the existing connection works.

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

## Muse Code

Install the native packages from a published BOS Operations Center release checkout:

```bash
muse plugins validate clients/muse/plugins/bos
muse plugins validate clients/muse/plugins/education-center
muse plugins install clients/muse/plugins/bos
muse plugins install clients/muse/plugins/education-center
```

Merge `clients/muse/plugins/bos/muse-settings.template.json` into your Muse user settings at `$XDG_CONFIG_HOME/muse/settings.json`, or `~/.config/muse/settings.json` when unset. Preserve other settings and keep `schema_version: 1`. Configure exactly one `BOS-Platform` entry with the packaged resource URL; review any conflicting entry before replacing it. Remove duplicate BOS registrations through host controls. Muse’s native plugin MCP entries cannot use OAuth, so this connection belongs in user settings.

Configure the user's existing BOS identity API key directly in Muse's private credential configuration for the single BOS-Platform connection. Muse currently uses that key for the same authorized organization/app/role discovery and operations available through OAuth. Keep the key out of chat and plugin packages. Start a new Muse process after changing connection settings, then check `/mcp` and `/skills`. A missing, expired or revoked key uses Muse's supported key recovery; choosing another authorized organization or app reuses the same key.

Install [My CRM’s independently distributed Muse package](https://github.com/cody-marcel-dfsm/mycrm#muse-code) for its eight CRM skills. Education Operation Center and My CRM reuse the single BOS connection. All product packages preserve the canonical logos described in [the branding standard](brand/README.md).

To upgrade, sync the next published release, run `muse plugins update bos` and `muse plugins update education-center`, and start a new session. This repository’s package checks verify source composition and credential-free connection declarations. Native installation, login, discovery, recovery, and authenticated operations require separate published-release acceptance.

Host references: [native manifests](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/manifest/), [MCP configuration](https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/).

## Other clients

Claude, ChatGPT/Codex, OAuth-capable Copilot hosts, Gemini CLI, and Antigravity
Desktop use the BOS foundation’s host-managed OAuth connection. Dependent
products declare BOS as their required connection owner and retain their
application skills. The server validates exact organization, application,
installation, role, capability, and provider scope on every operation.

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
> `/mcp auth BOS-Platform`, and complete BOS sign-in once. For Antigravity 2.0
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
3. Run `/mcp auth BOS-Platform` in Copilot CLI or select `Auth` above the VS Code
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
| `skill-release-manifest.json` | Generated exact skill versions, requirements, release and file inventory |
| `.agents/skills/` | Repository-maintainer skills excluded from customer products |
| `clients/codex/.agents/plugins/marketplace.json` | Generated Codex marketplace |
| `clients/claude/.claude-plugin/marketplace.json` | Generated Claude marketplace |
| `scripts/` | Generation, validation, installation, and release tools |
| `tests/` | Package, security, portability, and workflow tests |

Private application skill groups may coexist in a managed marketplace while
remaining outside public customer releases. Disabled products are listed in
`clients/disabled-products.json` and excluded from generated marketplaces,
installation instructions, and release checks.

## Project documentation

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
