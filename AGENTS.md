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
- Request Projects-level Oracle review through `python3
  /Users/cody/Development/Projects/tools/projects_oracle.py --review "<request>"` for family
  membership, ownership boundaries, and shared
  public-contract alignment. Request repository review through `npm run
  oracle:review`. Ordinary agents never load or act as either Oracle; each
  utility starts the independent approver process with its own skills and
  authority.
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
- Client tests and builds discover BOS contracts from the configured BOS URL
  or a tenant-neutral synthetic HTTP service owned by this repository. Never
  copy, import, package, or read BOS Service schemas, examples, manifests,
  archives, or sibling source. Consumer schemas remain BOC-owned.
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

## Oracle approval-process contract

- Before any repository mutation, the ordinary workflow submits a concise
  **Problem**, **Cause**, and **Recommended change** proposal through `npm run
  oracle:proposal -- "<proposal>"`; each section contains no more than three
  sentences. The isolated Oracle verifies the cause and ownership boundary,
  classifies authentication, public API-contract, and architecture impact, and
  either approves automatic continuation or flags the exact protected change
  requiring owner approval. Restoration of already-approved behavior reuses
  its scoped approval; a material proposal change requires fresh proposal
  review. Proposal review writes a separate durable proposal record, never a
  commit-acceptance receipt, and completed-tree Oracle review remains mandatory.

- The Oracle process explicitly flags every authentication-affecting
  alteration, including indirect changes in manifests, transports, tests, and
  instructions. The implementation agent supplies existing approval evidence;
  Oracle alone classifies the change and requests owner approval when required.
  Record the owner's approved scope and request approval exactly once for that
  alteration.
  Approval persists through all in-scope fixes, reviews, releases, deployments,
  and verification until resolved. Only a materially different alteration
  outside that scope requires new approval. Fresh Oracle review of corrected
  diffs remains mandatory and does not invalidate owner approval.

- `.agents/skills/oracle` is approver-only instruction material loaded by
  `tools/oracle_approval.py`. An implementation, planning, review, or release
  agent must not load, invoke, quote, or impersonate that skill.
- Every implementation, fix, refactor, test mutation, documentation mutation,
  generated-package mutation, and release change must use the repository-local
  `operations-center-implementation` workflow and submit the completed actual
  diff plus focused validation evidence through `npm run oracle:review`.
- A repository mutation is incomplete until Oracle returns the literal verdict
  `APPROVED`. `REJECTED` blocks completion. Every correction invalidates the
  prior verdict and requires a fresh review of the complete updated diff.
- Oracle reads durable issue history under `Vault/docs/issues/`. The
  implementation agent applies Oracle-required issue-history corrections and
  resubmits the complete candidate.
- Oracle is a repository-maintainer workflow. Customer BOS plugins and generated
  client packages never distribute it.
- Repository-change approval requires review of the complete staged tree and
  validation evidence by the utility. Before starting its isolated read-only
  approver, the utility synchronizes the private Vault index, runs the required
  semantic query, and binds that query result and index snapshot into the
  receipt evidence. Loading the skill never grants approval.
- An approved utility run writes `.git/oracle/approval.json` and emits
  `Oracle-Verdict`, `Oracle-Reviewed-Tree`, and `Oracle-Receipt-SHA256` commit
  trailers. Local hooks verify the exact receipt, tree, base commit,
  authorities, and approval status; CI verifies the committed accepted-state
  trailers and tree. No Git-note publication protocol is required. The security boundary is process
  separation: ordinary agents are trusted to invoke the utility and never load
  or impersonate the Oracle skill; the isolated Oracle subprocess alone issues
  approval for the exact staged tree. Any candidate
  mutation invalidates the receipt and requires a fresh utility review.
- A GitHub merge commit is accepted only when it has exactly two parents, its
  pull-request parent carries valid Oracle accepted-state trailers, and the
  merge commit tree exactly equals that Oracle-approved pull-request tree.
  Update and reapprove the branch when the target branch would change the
  resulting tree; octopus merges and conflict-resolution rewrites are rejected.
- Oracle findings identify exact files and lines and end with `APPROVED` or
  `REJECTED`.
- Application repositories own their own local Oracle utilities, approver-only
  skills, architecture, and approval services. Those services remain owned by
  the application repository.
