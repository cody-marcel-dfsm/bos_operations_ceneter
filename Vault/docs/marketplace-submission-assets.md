# Marketplace identity and submission asset inventory

Status: execution inventory for Track C
Owner: product and release operations
Last audited: 2026-08-09

## Purpose and scope

This document is the durable inventory and production checklist for public
marketplace assets for the BOS, Education Operation Center, and Video Ads client
products. It covers Claude, OpenAI ChatGPT and Codex, Gemini CLI, and GitHub
Copilot.

Marketplace packages are client-side skill groupings connected to fixed,
human-readable BOS MCP routes. Marketplace publication does not select or
provision a BOS application. For example, Education Operation Center connects to:

```text
https://dfsm.ai/mcp/apps/leaddirector/education-center
```

This inventory does not approve a route, runtime, tool catalog, release, or
marketplace submission. Live route and tool evidence comes from the owning
application repository and Track B. Generated-client validation and release
approval come from Tracks F through J.

## Status vocabulary

- **Ready**: a canonical repository asset exists and contains the required
  information.
- **Partial**: useful source material exists, but it is incomplete or has not
  been adapted to the marketplace field.
- **Missing**: no canonical asset exists.
- **External**: completion requires an account owner, public website, owning
  application repository, marketplace portal, or live client action.
- **Conditional**: required only when the selected listing or MCP response uses
  the applicable feature.

## Canonical product identity

| Field | BOS | Education Operation Center | Video Ads | Status | Canonical source |
| --- | --- | --- | --- | --- | --- |
| Stable package name | `bos` | `education-center` | `video-ads` | Ready | `products/*/product.json` |
| Display name | BOS — Business Operating System | Education Operation Center | Video Ads | Ready | `products/*/product.json` |
| Publisher | Infinite State Machines LLC | Infinite State Machines LLC | Infinite State Machines LLC | Ready | `products/*/product.json` |
| Category | Productivity | Productivity | Marketing | Ready | `products/*/product.json` |
| Current version | 0.4.30 | 0.4.30 | 0.1.3 | Ready | `products/*/product.json` |
| Application name | None (skills-only) | `leaddirector` | `leaddirector` | Ready for packaging; runtime certification pending | `products/*/product.json` |
| MCP group name | None (skills-only) | `education-center` | `video-ads` | Ready for packaging; runtime certification pending | `products/*/product.json` |
| Short description | Present | Present | Present | Ready as source copy | `products/*/product.json` |
| Long description | Present | Present | Repeats short copy | Partial | Product/release operations |
| Starter prompts | Three | Three | Three | Ready as source copy | `products/*/product.json` |
| Keyword set | Minimal Claude keywords | Minimal Claude keywords | Minimal Claude keywords | Partial | Generated Claude manifests |
| Audience and eligibility | Unspecified | Authorized adult education-center staff is stated | Unspecified | Partial | Product owner |
| Geographic availability | Unspecified | Unspecified | Unspecified | Missing | Business owner and counsel |
| Support lifecycle | Latest release only in `SECURITY.md` | Same | Same | Partial | Product/release operations |

The product JSON files are the canonical source for name, version, category,
route identity, short description, and starter prompts. Generated client files
are evidence of propagation and are never the source to edit.

## Shared public asset inventory

| Asset | Status | Evidence or gap | Owner | Completion test |
| --- | --- | --- | --- | --- |
| Publisher legal name | Ready | Infinite State Machines LLC is consistent in product and plugin manifests. | Business owner | Matches every marketplace account and public page. |
| Publisher website | Partial | Generated Codex and Claude plugins for BOS and Education Operation Center use `https://dfsm.ai`; no product-specific public listing page is recorded. | Web/product operations | Public HTTPS product page identifies publisher and each listed product. |
| Privacy policy URL | Partial | `https://dfsm.ai/apps/bos/privacy.html` is live, but the audited copy focuses on websites, lead forms, and campaigns. It does not yet disclose the client plugin/MCP data flows, customer-authorized provider data, tool outputs, retention, deletion, or subprocessors needed for marketplace review. | Privacy/counsel and web operations | Published policy accurately covers all submitted products and MCP processing. |
| Terms URL | Missing/external | No canonical public terms URL is recorded in repository manifests or product metadata. | Counsel and web operations | Public HTTPS terms page matches publisher and submitted products. |
| Support URL | Missing/external | `SECURITY.md` provides a security contact, but no public customer support page or SLA is recorded. | Support and web operations | Public HTTPS page provides contact method, expected response, setup help, and escalation path. |
| Security URL | Partial | Repository `SECURITY.md` defines vulnerability reporting and credential containment; no canonical public web URL is recorded. | Security and web operations | Public HTTPS security page and private vulnerability channel are operational. |
| Data-handling disclosure | Missing | No marketplace-specific disclosure maps user inputs, MCP requests/responses, provider data, retention, subprocessors, and deletion. | Privacy/counsel with BOS runtime owner | Disclosure reconciles with live MCP behavior and privacy policy. |
| Account/data deletion instructions | Missing | The live privacy page names a privacy-request email, but no product-specific connection revocation and operational-data deletion procedure is recorded. | Privacy/support and BOS runtime owner | Reviewer can follow a public deletion/revocation procedure. |
| Trademark policy | Ready in repository | `TRADEMARKS.md` exists. | Legal | Public packaging links or includes the policy where required. |
| Open-source license | Ready | Apache-2.0 is declared and `LICENSE` exists. | Release operations | Every public repository contains the license. |
| Product logos/icons | Missing | No PNG, SVG, JPG, WebP, or GIF product asset exists outside repository internals. | Brand/design | Approved master plus harness-required exports exist for all three products. |
| Marketplace screenshots | Missing | No marketplace screenshots exist. | Product/design and harness owners | Approved, privacy-safe screenshots demonstrate representative workflows in each claimed harness. |
| Demo video | Conditional/missing | No listing demo exists. | Product/design | Produce only when a portal requires it or review benefits materially. |
| Long listing descriptions | Partial | BOS and Education Operation Center have product-owner-selected long marketplace copy; Video Ads still repeats its short description. | Product marketing with product owners | Every submitted product has approved long copy explaining audience, workflows, authorization, and limitations without overstating tools. |
| Example prompts | Ready as source | Each product declares three default prompts. | Product owner | Prompts pass live positive tests and contain no customer identity. |
| Tool/action catalog | Missing/external | Skill inventories describe workflows, while the authoritative server-advertised tools and annotations belong to the live named routes. | Lead Director/BOS application owner | Versioned export lists every tool, purpose, input/output schema, read/write behavior, side effects, and annotations. |
| Review test cases | Missing | No canonical marketplace reviewer packet contains five positive and three negative cases per OpenAI submission. | QA with product owners | Cases run successfully against reviewer credentials and record expected results. |
| Reviewer demo account/key | External | Public artifacts correctly contain no credentials. | BOS operations/security | Time-bounded reviewer credential and safe review tenant are delivered through the portal's secret channel. |
| Generated client packages | Ready as build output | `clients/` contains the canonical Codex, Claude, Copilot, and Gemini outputs. | Release engineering | Generated parity and credential-free local checks pass on the release commit. |
| Release notes/changelog | Missing | Versions exist, while no per-product marketplace release notes or changelog is canonical. | Product/release operations | Each submitted version has product-specific changes, compatibility, migration, and known limitations. |
| Public repository metadata | Partial | Repository URL is in Claude manifests; repository name currently uses `bos_operations_ceneter`. Public visibility, About copy, topics, and release state require account-level verification. | Repository owner | Public repository metadata, topics, releases, and support links are verified live. |
| Customer/credential scan | Ready as repository control | Security and package tests prohibit credentials; final evidence belongs to Track J. | Release engineering | Scan passes on exact submission artifacts. |

## Product listing copy work orders

Product/release operations owns one listing packet per product. Each packet must
contain the following fields and receive product-owner approval:

1. Stable package name and display name.
2. Short description that fits each harness limit.
3. Long description covering audience, primary workflows, expected source
   systems, approval boundaries, and meaningful limitations.
4. Category and keywords.
5. Three to five tested starter prompts.
6. Exact fixed MCP route and authentication summary for reviewers.
7. Read/write and external-side-effect summary derived from the authoritative
   live tool catalog.
8. Supported countries and any age, role, or organization restrictions.
9. Version, release notes, support lifecycle, and compatibility matrix.
10. Website, privacy, terms, support, security, and data-handling URLs.

Copy must describe the client skill grouping and its fixed named route. It must
not claim that marketplace installation provisions, selects, or changes a BOS
application.

## Visual asset work order

Brand/design owns the master visual kit. Maintain source artwork outside
generated clients, then let harness packaging copy approved exports as needed.

Required minimum kit per product:

- square master icon with safe margins and legibility at small sizes;
- transparent and solid-background variants;
- raster exports in the exact dimensions and formats required by each current
  portal at submission time;
- one clean product hero image when supported;
- three privacy-safe workflow screenshots: discovery/installation, a typical
  read result, and a confirmation-controlled mutation or delivery result;
- alt text and a short caption for every image; and
- an asset provenance record confirming ownership and permission to publish.

Screenshots must use synthetic reviewer data. Remove API keys, customer names,
student/family information, provider tokens, internal IDs, browser bookmarks,
notifications, and unrelated account details.

## Tool and action disclosure work order

The owning BOS application repository exports one catalog for each named route:

- `/mcp/apps/leaddirector/education-center`; and
- `/mcp/apps/leaddirector/video-ads`.

The BOS platform package is skills-only and has no MCP catalog.

For every server-advertised tool, record:

- stable tool name and user-facing purpose;
- input and output schema;
- data sources read;
- data destinations written;
- external communication or publication effect;
- whether explicit user confirmation is required;
- idempotency and retry behavior;
- personal or sensitive data returned;
- required provider authorization; and
- marketplace annotations, including OpenAI `readOnlyHint`, `openWorldHint`,
  and `destructiveHint`.

Track C cannot synthesize this catalog from skill prose. Track B supplies the
live catalog; Track J verifies that the submitted disclosure matches the
deployed route.

## Claude checklist

Official basis: [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces).
Claude Code uses a repository marketplace manifest and installable plugin
directories. Plugin names are stable identifiers, and explicit versions must be
bumped on release.

### Repository marketplace publication

- [x] Repository-root `.claude-plugin/marketplace.json` exists.
- [x] Marketplace declares publisher name and three product entries.
- [x] Each generated product has `.claude-plugin/plugin.json`.
- [x] Product manifests contain display name, version, short description,
  author, homepage, repository, license, keywords, MCP reference, and sensitive
  API-key configuration.
- [ ] Confirm public repository visibility and correct the public repository
  slug if the current `bos_operations_ceneter` spelling is unintended.
- [ ] Add a marketplace owner support email if approved for public use.
- [ ] Complete product-specific long copy and product pages.
- [ ] Produce icons and screenshots for any Anthropic discovery or partner
  surface that accepts them.
- [ ] Complete public privacy, terms, support, security, and data-handling URLs.
- [ ] Validate every plugin install from the public repository in Claude Code.
- [ ] Validate update behavior with a real version bump.
- [ ] Prepare release notes and a support/rollback statement.

### Anthropic central discovery

Repository marketplace publication is actionable without a central Anthropic
submission. A separate Anthropic partner, directory, Claude Desktop, or Cowork
listing is an **external and conditional** track until Anthropic supplies the
applicable portal and current field requirements. The harness owner records the
portal URL, submission ID, submitted fields, reviewer correspondence, and final
decision when that route is available. Repository readiness must not be called
Anthropic directory approval.

## OpenAI ChatGPT and Codex checklist

Official basis: [OpenAI plugin submission](https://developers.openai.com/plugins/deploy/submission).
OpenAI accepts skills-only, MCP-only, or combined skills-and-MCP plugins. BOS
products are combined submissions when their skills and named MCP route are
published together.

Create a separate submission record for BOS, Education Operation Center, and Video
Ads unless OpenAI explicitly approves a combined catalog listing.

- [ ] Confirm the publishing OpenAI organization and project.
- [ ] Grant the submitter Apps Management write access.
- [ ] Complete business verification for Infinite State Machines LLC and ensure
  the verified identity matches the website, support, privacy, and terms pages.
- [ ] Enter product name, short description, approved long description, logo,
  category, website, support URL, privacy URL, and terms URL.
- [ ] Submit the fixed production MCP URL directly as a new MCP-backed plugin;
  do not reference an existing integration ID.
- [ ] Confirm with OpenAI whether each fixed path is treated as a Universal URL.
  Escalate any shared-host, separate-path constraint through OpenAI support
  before changing BOS route architecture.
- [ ] Complete control-of-domain verification using the portal-provided token at
  `/.well-known/openai-apps-challenge`. The runtime/web owner performs this
  external deployment.
- [ ] Supply authentication instructions and time-bounded demo credentials in
  the portal's protected reviewer channel.
- [ ] Supply a content security policy when a plugin UI or tool response
  requires external fetch domains.
- [ ] Run Scan Tools against the deployed named route.
- [ ] Reconcile every discovered tool name, description, schema, output, and
  annotation with the authoritative route catalog.
- [ ] Set accurate `readOnlyHint`, `openWorldHint`, and `destructiveHint` for
  every tool.
- [ ] Review MCP responses against the published privacy policy and remove
  unnecessary personal data, auth secrets, debug payloads, and undisclosed
  internal identifiers.
- [ ] Upload or import the final skill bundle.
- [ ] Enter tested starter prompts.
- [ ] Supply five positive and three negative test cases with expected behavior
  for each submission.
- [ ] Choose supported countries/regions.
- [ ] Add product-specific release notes.
- [ ] Complete all portal policy attestations.
- [ ] Record submission ID, submitted version/commit, review status, findings,
  remediation, and approval date in a release record.

The shared `dfsm.ai` host creates an external review consideration: OpenAI's
domain challenge is host-based rather than path-based. Multiple product routes
on the same host may require coordination with OpenAI or an approved parent
origin challenge mechanism. This is a portal/runtime coordination issue and
does not authorize a change to the fixed human-readable route model.

## Gemini CLI checklist

Official basis: [Gemini CLI extension release](https://geminicli.com/docs/extensions/releasing/).
The Gemini gallery automatically indexes eligible public GitHub repositories;
the official discovery steps are a public repository plus the
`gemini-cli-extension` GitHub topic.

Because the current repository contains three extensions below
`clients/gemini/extensions/`, product/release operations must choose and record
one of these release topologies before gallery publication:

1. one public repository per product extension; or
2. an officially supported multi-extension repository layout confirmed against
   current Gemini CLI behavior.

Checklist per listed extension:

- [x] Generated `gemini-extension.json` exists with name, version, description,
  sensitive API-key setting, and fixed named MCP endpoint.
- [x] Deterministic Gemini generated package exists under `clients/gemini`.
- [ ] Select and document the public repository topology.
- [ ] Ensure `gemini-extension.json` is at the installable repository root.
- [ ] Add product README, long description, starter prompts, support links,
  license, security information, and screenshots.
- [ ] Make the release repository public.
- [ ] Add the `gemini-cli-extension` GitHub topic.
- [ ] Validate direct installation from the exact public repository URL.
- [ ] Publish a tagged GitHub release and mark the intended stable version as
  Latest.
- [ ] Validate update discovery from the published release.
- [ ] Verify the extension appears in the gallery after indexing and record the
  listing URL/date.

There is no manual Gemini gallery application to mark submitted under the
current official process. Public repository setup, topic assignment, GitHub
release publication, and gallery indexing are external account actions.

## GitHub Copilot checklist

Official basis: [GitHub Copilot plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins)
and the [Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference).
Copilot plugins can bundle skills and MCP configuration and can be installed
from a marketplace or repository. A repository marketplace uses
`.github/plugin/marketplace.json`; Copilot also recognizes a Claude marketplace
manifest for compatibility.

- [x] Product-specific Copilot skill trees and product metadata are generated.
- [x] Deterministic Copilot generated packages exist under `clients/copilot`.
- [x] The repository has a Claude marketplace manifest that current Copilot CLI
  documentation says it can discover.
- [ ] Decide whether Copilot will share the Claude marketplace manifest or own
  a canonical `.github/plugin/marketplace.json`.
- [ ] Generate/verify a Copilot-native `plugin.json` for each product with its
  MCP configuration and skills; the current audited Copilot tree is a product
  and skills distribution rather than a documented native marketplace plugin.
- [ ] Add marketplace owner email, metadata description/version, product
  descriptions, and approved support links.
- [ ] Validate direct install of each plugin from the public repository.
- [ ] Validate marketplace registration, browse, install, enable, update, and
  uninstall in Copilot CLI.
- [ ] Validate the same installed plugin in the GitHub Copilot app/cloud agent
  surfaces claimed by the release.
- [ ] Document organization policy requirements, including MCP/plugin enablement
  and any `extraKnownMarketplaces` configuration.
- [ ] Record public marketplace repository URL and installation commands.

The current official GitHub model supports public or team-owned repository
marketplaces. Inclusion in a GitHub-operated default marketplace or MCP Registry
is **external and conditional**; record a separate application only when GitHub
provides an applicable submission route. A working repository marketplace is
the first Copilot publication gate.

## Ownership and parallel handoffs

| Work item | Accountable owner | Inputs | Unblocks |
| --- | --- | --- | --- |
| Product long copy, categories, keywords, prompts | Product/release operations | Product manifests and live workflow tests | All listings |
| Icons, hero art, screenshots, alt text | Brand/design | Approved product copy and synthetic demo environment | Listing forms and public repositories |
| Privacy, terms, data handling, deletion | Counsel/privacy and web operations | Live route/tool catalog and provider data map | OpenAI submission and public trust gate |
| Support and security pages | Support/security and web operations | `SECURITY.md`, operations runbooks | All public listings |
| Live tool/action catalogs | Owning BOS/Lead Director repository | Deployed named routes | OpenAI Scan Tools, reviewer docs, screenshots |
| Reviewer tenants and credentials | BOS operations/security | Named route certification | OpenAI and any partner review |
| Claude publication record | Claude harness owner | Tracks C, F, J | Track K |
| OpenAI portal record | OpenAI harness owner | Tracks C, G, J | Track K |
| Gemini repository/gallery record | Gemini harness owner | Tracks C, H, J | Track K |
| Copilot marketplace record | Copilot harness owner | Tracks C, I, J | Track K |

These work items can proceed in parallel after product names and named routes
are frozen. Privacy copy and screenshots must wait for an accurate live tool and
data-flow catalog. Submission clicks wait for Track J release approval.

## Submission record template

Create one durable release/submission record per product and harness containing:

- product, harness, package version, git commit, and generated-tree checksum;
- fixed MCP route and live route certification reference;
- marketplace/repository URL and listing identifier;
- publisher account and verified legal identity;
- exact listing copy and asset file checksums;
- public policy/support URL snapshots and effective dates;
- tool catalog version and scan result;
- reviewer credential owner and expiry, without storing the secret;
- test-case results and Track J release evidence;
- submission date, status, reviewer findings, responses, and decision;
- published listing URL and publication date; and
- rollback owner and last known good version.

## Track C completion gate

Track C is complete only when:

1. all three product listing packets have approved short and long copy;
2. approved icons and privacy-safe screenshots exist in required formats;
3. website, privacy, terms, support, security, data-handling, and deletion URLs
   are public and accurate;
4. live tool/action catalogs exist for every submitted named route;
5. reviewer test cases, countries, release notes, and support lifecycle are
   approved;
6. public repository topology and marketplace metadata are final for Claude,
   Gemini, and Copilot;
7. OpenAI identity, permissions, domain verification plan, and reviewer
   environment are ready; and
8. each harness has an assigned submission owner and an empty submission record
   ready to receive Track J evidence.

At this audit, Track C is **in progress**. Text identity, starter prompts,
generated manifests, licensing/security repository files, and deterministic
release metadata are available. Visual assets, long copy, marketplace-specific
data disclosures, public terms/support/security pages, authoritative live tool
catalogs, reviewer cases, and account/portal actions remain open.
