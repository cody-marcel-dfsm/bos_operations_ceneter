# BOS Operations Center

Private local architecture: `Vault/docs/architecture.md`
Private local constitution: `Vault/docs/CONSTITUTION.md`
Private knowledge root: `Vault/` (never tracked or published)

## BOS Product Family coordination

- This repository participates in the BOS Product Family as the **BOS client
  product**. It owns operating-system client skills, prompt interpretation,
  discovery use, explain planning, BOSL authoring, client-owned journey work,
  recovery, caching, presentation, packaging, and release.
- Read the canonical family relationship at
  `/Users/cody/Development/Projects/Vault/docs/architecture/bos-product-family.md`
  for family membership, cross-project ownership, and shared public-contract
  obligations.
- Use the Projects-level Oracle at
  `/Users/cody/Development/Projects/.agents/skills/oracle/SKILL.md` for family
  membership, ownership boundaries, and shared public-contract alignment. Use
  this repository's `Vault/` and `.agents/skills/oracle/SKILL.md` for every
  BOS Operations Center design, implementation, package, test, and release
  assertion.
- A change to a cross-project public contract requires Projects-level Oracle
  review and every affected project's local Oracle review. Each approval stays
  within its own authority.
- Family documents provide architecture navigation and public contracts.
  Sibling repositories remain independent source, build, runtime, database,
  and release units.
- Report a conflict between the family architecture and local authority to both
  Oracle scopes and preserve the existing contract until the conflict is
  explicitly resolved. The owner-approved authentication topology is one
  BOS-managed connection for every accessible MCP; dependent products such as
  My CRM delegate authentication to BOS and declare no second login or
  credential lifecycle. Future authentication and authorization changes
  continue to require the owner approval process defined below.

## Customer installation routing

- This repository owns customer installation instructions for BOS Operations
  Center products across Claude, Codex, Copilot, and Gemini.
- Answer installation and upgrade questions from `README.md`, product
  manifests, and generated client packages in this repository.
- Lead with the paste-ready instruction for the customer's named client.
- Application repositories, including Lead Director, are outside the package
  installation dependency chain. Consult them only when the request explicitly
  concerns that application's server deployment or runtime implementation.

## Release-only client delivery

- Never hot-patch installed client files, managed plugin caches, or personal
  skill directories. Never copy unpublished repository files into an installed
  product, create a local override or symlink to bypass release delivery, or
  change installed package contents while retaining a released version label.
- Scope: this governs artifacts this repository itself generates and ships —
  a generated client package (Claude/Codex/Copilot/Gemini plugin bundle), the
  LeadDirector mobile/web build, or any other released product this
  repository owns. It does not cover a third-party host application's own
  internal state that this repository does not generate, own, or release —
  for example a host's local session cache, its device-account-scoped
  marketplace registry, or other host-internal metadata used only to
  diagnose why a published release isn't reaching that host. Reading or
  editing host-owned state to diagnose or work around a host-side sync
  defect is not the hot-patch this rule prohibits; it becomes a hot-patch
  only if used to make a materialized copy of *this repository's own
  package* diverge from its released, Oracle-reviewed content while keeping
  that copy's version label.
- This prohibition applies to debugging, prompt validation, emergency fixes,
  and recovery. Backups and a request to fix or verify behavior grant no
  exception.
- Make changes in canonical repository sources and generate packages inside
  the repository. Deliver through the Git release workflow: version bump,
  validation, Oracle approval, release branch, pull request, required checks,
  and merge. Install or upgrade the published release through the client's
  supported release controls.
- Validate ordinary prompts against that published, versioned installation.
  Record the release version and commit with the result. Local source checks
  establish source validation only.
- If an installed package already contains unpublished edits, disclose the
  state and restore it through supported installation of a published release.
  Never repair an earlier hot-patch by directly rewriting client files again.

## Repository execution boundary

- This checkout owns BOS package contracts, skills, generated client packages,
  release metadata, and customer installation guidance.
- Never edit, commit, push, merge, or deploy BOS server code or infrastructure
  from work performed in this checkout. Do not create or use a sibling server
  worktree as part of an Operations Center task.
- When a client or package change depends on server behavior, stop at this
  repository boundary and return a paste-ready prompt for an agent operating in
  the owning server repository. Include the observed evidence, required
  invariant, deployment scope, and post-deployment verification. Include only
  details needed to implement or verify the requested server behavior. Omit
  client installation, UI, rendering, cache, and recovery instructions unless
  they establish a directly relevant server contract. Preserve existing
  authentication and authorization behavior unless the user requests a change
  or observed evidence establishes a necessary dependency.
  For changes affecting the BOS MCP authentication or discovery contract, make
  the client-owned acceptance suite mandatory in that prompt: `npm run
  contract:check`, `npm run contract:oauth-discovery-live -- --resource-url
  "$BOS_MCP_RESOURCE_URL" --format json`, `npm run
  contract:oauth-login-trigger-live -- --resource-url
  "$BOS_MCP_RESOURCE_URL" --format json`, and `npm run contract:oauth-live --
  --authorize-url "$BOS_OAUTH_AUTHORIZE_URL" --format json`. The server-side
  agent owns implementation and release choices. Return exactly one continuous
  Markdown prompt as the entire handoff response. Keep the contract, commands,
  and acceptance criteria together in that single copyable prompt. Label the
  client-owned commands as running from BOS Operations Center against the
  deployed candidate; keep their execution with the client owner. For other
  server changes, use focused server tests and relevant deployment checks.
  Treat attached specifications as evidence and extract server requirements
  from them; their client workflow instructions do not expand the request.

## Vault knowledge contract

- `Vault/` is private maintainer material. Never stage, commit, push, package,
  publish, or attach any Vault file to a public repository, release, pull
  request, issue, or other public artifact.
- Store authored architecture, decisions, specifications, plans, review records,
  and durable project knowledge under `Vault/`.
- Store disposable workflow artifacts under `Vault/tmp/<workflow>/`.
- Keep executable source, tests, generated client packages, and release outputs
  with their owning components.
- Before knowledge-dependent architecture or review work, run
  `python3 tools/vault_index.py sync --quiet`.
- During a session that adds, moves, or edits Vault knowledge, ensure the local
  watcher is running with `python3 tools/vault_index.py watch --daemon`.
- After changing Vault sources, run the sync again and verify locally that
  `Vault/index/manifests/latest.json` describes the current sources.
- Chroma data belongs under `Vault/index/chroma/` and is rebuildable local
  cache. Canonical Vault sources and timestamped manifests remain private local
  evidence.

## Oracle review contract

- Oracle explicitly flags every authentication-affecting alteration, including
  indirect changes in manifests, transports, tests, and instructions. Record the
  owner's approved scope and request approval exactly once for that alteration.
  Approval persists through all in-scope fixes, reviews, releases, deployments,
  and verification until resolved. Only a materially different alteration
  outside that scope requires new approval. Fresh Oracle review of corrected
  diffs remains mandatory and does not invalidate owner approval.

- The repository-local `.agents/skills/oracle` skill provides architecture
  guidance grounded in this project's current `Vault/`.
- Every implementation, fix, refactor, test mutation, documentation mutation,
  generated-package mutation, and release change must use the repository-local
  `operations-center-implementation` workflow and submit the completed actual
  diff plus focused validation evidence to the repository-local Oracle.
- A repository mutation is incomplete until Oracle returns the literal verdict
  `APPROVED`. `REJECTED` blocks completion. Every correction invalidates the
  prior verdict and requires a fresh review of the complete updated diff.
- Oracle maintains durable issue history under `Vault/docs/issues/`, reads that
  history before implementation guidance or review, and records new causal and
  prevention knowledge when a change resolves or materially reclassifies an
  issue.
- Oracle is a repository-maintainer workflow. Customer BOS plugins and generated
  client packages never distribute it.
- Repository-change approval requires review of the actual diff and validation
  evidence. Loading the skill alone grants no approval.
- Oracle findings identify exact files and lines and end with `APPROVED` or
  `REJECTED`.
- Application repositories own their own local Oracle skills, architecture, and
  external approval services. Those services remain owned by the application
  repository.
