
## Fixed validation contract — controlling owner direction, 2026-10-29

Apply `tools/validation-contract.md`. Before implementation, the native proposal
Oracle selects `docs_only`, `bug_fix`, `deep_bug_fix` or `feature` and fixed exact
categories/test files. Its generated `tools/validation-selection.json` binds the
source baseline, catalog, runtime and original decision. Implementation, build and
release use the same selected commands. Complete every selected category: empty,
skipped, cancelled, partial or failing tests never pass. Bug fixes retain an actual
unchanged-test fail-before/pass-after reproduction; deep fixes cover all relevant
interactions and features receive thorough acceptance. Genuine docs-only changes
use minimal sanity. This replaces blanket full-suite/baseline requirements for new
selected contracts, without removing security, privacy or independent publication
gates. Unknown impact expands scrutiny. Keep regression small and curated by
recurrence rationale; do not accumulate every feature test. Changed acceptance
needs an explicit Oracle revision linked to the original contract and evidence.
Ordinary agents invoke the native Oracle and never adopt its approver role.

# BOS Operations Center

Private local architecture: `Vault/docs/architecture.md`
Private local constitution: `Vault/docs/CONSTITUTION.md`
Private knowledge root: `Vault/` (never tracked or published)

Private callback authoring design: `Vault/docs/design/bosl-callback-authoring.md`
Private callback implementation tasks: `Vault/docs/implementation/bosl-callback-implementation.md`
Private notification client design: `Vault/docs/design/journey-notifications-client.md`
Private notification implementation tasks: `Vault/docs/implementation/journey-notifications-implementation.md`
Private native continuation design: `Vault/docs/design/native-callback-continuation.md`
Private native continuation tasks: `Vault/docs/implementation/native-callback-continuation.md`

## Canonical main checkout and project agent context

- Work on `main` in `/home/cody/Projects/bosops_staging`.
  Run the project-specific implementation agent from this directory and use
  this project's skills, validation commands, and Oracle approval process.
- Preserve staged, unstaged, and untracked work. Fetch the configured remote
  default branch before implementation or release, record the base commit,
  and integrate newer remote changes semantically in this canonical checkout.
- Do not create, switch to, or use Git worktrees for planning, implementation,
  validation, review, or release. Inspect existing worktree sources solely to
  recover changes into canonical `main`; preserve them until recovery is verified.
- Validate the complete Oracle-selected contract against the integrated candidate
  on `main`; include recurrence regression only when selected, and retain Oracle approval. Recheck remote divergence before publication.
- Publish through the required reviewed release pull request by creating and
  pushing its branch ref from canonical `main` without switching the checkout.
  Preserve every exact Oracle tree and required GitHub check.

## BOS Product Family coordination

- This repository participates in the BOS Product Family as the **BOS client
  product**. It owns operating-system client skills, prompt interpretation,
  discovery use, explain planning, BOSL authoring, client-owned journey work,
  recovery, caching, presentation, packaging, and release.
- Read the canonical family relationship at
  `/home/cody/Projects/Vault/docs/architecture/bos-product-family.md`
  for family membership, cross-project ownership, and shared public-contract
  obligations.
- Request Projects-level Oracle review through `python3
  /home/cody/Projects/tools/projects_oracle.py --review "<request>"` for family
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
  credential lifecycle. Deployment of specifically protected authentication and authorization effects
  follows the publication-authority process defined below.

## Owner-approved feedback recommendation compatibility exception

The owner-approved transport exception is limited to the read-only
`feedback.recommendations.query` operation. Consume its exact freshly advertised
`bos_list_context_tools` name through existing authenticated `bos_execute`, using
the current BOS login, the selected primary installation, and exactly `{}`.
Preserve current server authorization, permissions, ranking, restricted-grant
ceilings, organization isolation, and sanitized results. Deterministic HTTPS
remains the default for other new business operations; this exception grants no
generic proxy, additional authority selector, credential access, or second login.
The personal recommendation skill stays outside generated customer packages.
Existing client execution supports this operation; this maintainer notice changes
no package contents or release version. See private Constitution principle 15
and the client-owned discovery design for detailed governance and acceptance.

## Native callback observation — approved scoped compatibility exception

For the requested callback-continuation scope, consume exactly the freshly
advertised `journeys.notifications.read` and `journeys.state.read` through
existing authenticated `bos_execute` and its fresh selected authorized context.
BOS Service owns their closed schemas, original author/source pins, current
authorization, committed journal/replay and canonical state semantics. BOC owns
closed consumption, protected queue/cursor persistence, verified current-task
and registration-generation continuation, state refetch and terminal retirement.
Active held reads and finite scheduled same-conversation observation disclose
their latency and lifetime; immediate event-triggered wake requires actual host
support and native evidence. This exact exception adds no generic proxy, token
export, second login, alternate state store, provider/source or mutation authority,
new API/protocol version, persistent server worker or unbounded scheduled work.
Existing deterministic HTTPS/SSE and lifecycle mutation boundaries remain in
force. Scope admission requires current actual native tools and discovery;
package parity, source tests and captured frames supply no native wake proof.

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

## Public API version request gate

Creating, bumping, replacing, or splitting a public API version requires the
human user's explicit request for that exact version change. Owner approval,
general fix or release authorization, Oracle guidance, inferred compatibility,
and pre-existing implementation never substitute for that request. Every Oracle
must reject an unrequested API version change. Correct behavior and preserve
authorized improvements within the current API version; behavior corrections
never imply a new API version or a feature rollback. Package and build release
numbers and identity-envelope protocols are distinct from public API versions.
An explicit request authorizes its exact scope through ordinary independent
proposal and completed-tree review, with automatic continuation after approval.
This request gate takes precedence over generic protected-change approval rules;
specific protected-publication authority remains independent.

## Oracle approval-process contract

- Run Oracle reviews covered by the owner's normal plan automatically, without
  spending-approval questions or a separate $0 approval. Missing per-review
  prices create no approval gate for covered usage. Additional paid API/credit
  funding, purchases and persistent billable costs retain explicit spending
  approval; unavailable included allowance authorizes no automatic paid fallback.

- Before repository mutation, submit the concise Problem, Cause and Recommended change proposal through `npm run oracle:proposal`. Independent proposal and completed technical reviews finish without human deployment permission. They reject technical defects, custody failures and unrequested public API versions. Authentication labels, filenames and ordinary compatible corrections create no human gate.
- The reviewer separately identifies concrete credential-trust, permission-authority, tenant-isolation or incompatible-public-contract effects over the complete effective publication source range. Missing authority for such an effect leaves technical review, commits, review-only pushes and PR review available. Only actual distributed-plugin publication/deployment checks matching scoped human authority.
- Main promotion uses `python3 tools/publication_admission.py` after the current native technical decision. The workflow binds the original immutable technical receipt, complete effective baseline-to-candidate source, exact effects and destination; earlier effective protected changes survive later ordinary commits. Current independently source-bound SUPERSEDED/REVERTED evidence can retire an effect. Late direct-human evidence is assessed separately and never rewrites technical approval. Preserve exact existing scoped authority through in-scope repairs and preserve all cost controls.

- `.agents/skills/oracle` is approver-only instruction material loaded by
  `tools/oracle_approval.py`. An implementation, planning, review, or release
  agent must not load, invoke, quote, or impersonate that skill.
- Every implementation, fix, refactor, test mutation, documentation mutation,
  generated-package mutation, and release change must use the repository-local
  `operations-center-implementation` workflow and submit the completed actual
  diff plus focused validation evidence through `npm run oracle:review`.
- A repository mutation is incomplete until Oracle returns the literal verdict
  `APPROVED` for the complete current candidate. Every correction invalidates
  the prior verdict and requires a fresh independent exact-tree verdict.
  Evidence carries forward only through the review-series checks below.
- The first completed assessment covers the full candidate and relevant
  dependencies, consolidating all findings before returning them. Findings have
  stable IDs, exact locations, root cause, reproduction, required behavior,
  affected paths, a concrete repair and acceptance checks. Repair all open
  findings together and account explicitly for each resolution.
- `tools/oracle_approval.py` retains content-bound rounds in `.git/oracle/series/`
  across in-scope repair proposals. Follow-up assessment checks the changes since
  the preceding candidate, repairs and affected dependencies, with a complete
  current-candidate consistency check and all approval gates. Reuse requires
  unchanged source/dependency hashes, authorities, tool/configuration and
  environment plus unchanged validation artifact bytes; record invalidation
  reasons and rerun affected checks. A new finding in unchanged reviewed code is
  a recorded missed finding with its coverage gap explained.
- `INCOMPLETE` and `ERROR` describe unfinished assessments and infrastructure
  failures; they establish no code defect and issue no receipt. Retain valid
  checkpoints and resume unfinished coverage. After two failed repair rounds,
  use the consolidated unresolved-finding repair plan before another repair.
  A fresh complete-current-tree verdict remains mandatory after any mutation;
  prior verdicts never carry forward with reused evidence.
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
- Oracle findings identify exact files and lines. Completed assessments return
  `APPROVED` or `REJECTED`; unfinished runs return `INCOMPLETE` or `ERROR`.
- Application repositories own their own local Oracle utilities, approver-only
  skills, architecture, and approval services. Those services remain owned by
  the application repository.

## Deployment-host bootstrap — owner direction, 2026-10-27

The owner authorized this host to implement and publish the scoped native acceptance
repair and explicitly instructed creation of missing governance. Canonical private
family and Vault authorities here are newly bootstrapped from existing ownership
and safety requirements, not recovered historical Mac records. Preserve original
failed proposals. Host path alignment supplies no source approval, native acceptance
or additional spending/publication authority. Use Projects architectural review and
this repository's independent proposal/source review before publishing the repair.

## Validation delivery limits

The controlling delivery budgets are docs_only120s, bug_fix180s,
deep_bug_fix300s and feature300s end to end, including network/build/effects and
verification (verified Git publication for source-only work). The host's original
request clock survives retries and revisions; local PASS is only phase PASS.
Rank/pare checks before freezing the contract, then run the whole selected set.
Small bugs get deterministic focused tests only; auth/cross-area work is deep.
No automatic broader regression or partial/empty/skipped PASS. Use low reasoning
for simple work and medium for hard work, never above medium or paid fallback.
Authenticated platform JEV may assist prioritization without granting authority.
