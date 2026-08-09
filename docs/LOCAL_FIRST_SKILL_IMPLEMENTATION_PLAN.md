# Local-First Skill and Package Implementation Plan

> Historical foundation plan. Current transport and release requirements are
> controlled by `DESIGN.md` and `IMPLEMENTATION_TASKS.md`: native remote
> Streamable HTTP, one client-configured BOS API key, and OS-neutral packages.

## Objective

Establish the complete BOS and Lead Director skill hierarchy locally, validate
skill discovery and composition in real Codex threads, then promote the proven
structure into the BOS Operations Center package builder and installer.

The package system must converge safely on the desired structure:

- create missing managed directories and files;
- recognize a correct existing installation and perform a no-op;
- update an older managed installation atomically;
- preserve unrelated user-owned skills and marketplace entries;
- replace package-owned files through recoverable backups while preserving
  customer-owned extension files; and
- produce deterministic evidence for every inspection, build, install, update,
  and verification.

## Controlling architecture facts

1. Codex discovers user-global skills from `~/.agents/skills`.
2. Codex discovers repository skills from `.agents/skills` between the current
   working directory and repository root.
3. Every agent in a repository receives the repository-root skills visible
   from its working directory.
4. Plugins distribute reusable skills and MCP connections.
5. The BOS plugin owns reusable BOS foundations and tenant-neutral MCP access.
6. Lead Director is an application running on BOS.
7. Lead Director repository skills apply BOS foundations and add
   application-specific source, architecture, test, and review requirements.
8. Skill descriptions drive implicit activation. Skill bodies drive workflow
   execution after activation.
9. `agents/openai.yaml` declares tool dependencies. Application skill bodies
   declare skill composition through stable qualified BOS identities.

## Verified local starting point

The current machine already has:

```text
~/.agents/plugins/marketplace.json
└── bos@bos-icode → ./plugins/bos

~/plugins/bos/
├── .codex-plugin/plugin.json
├── .mcp.json
├── skills/use-bos/SKILL.md
└── tests/
```

`codex plugin list` reports `bos@bos-icode` as installed and enabled. The plugin
has the identity `bos`, a tenant-neutral `use-bos` skill, and an MCP
configuration. This was the local prototype used to establish package source.

The Lead Director repository already has `.agents/skills`, including mixed
Lead Director/BOS planning, implementation, review, boundary, and
authentication skills. These are the extraction source for the foundation and
specialization split.

The BOS Operations Center repository currently has:

- a flat canonical `source/skills` directory;
- generated Codex, Claude, and Copilot skill copies;
- a fixed iCode Operations Center package;
- credential scanning;
- design and implementation documentation; and
- no committed baseline or automated test suite beyond release scripts.

## Target local structure

```text
~/.agents/
├── plugins/
│   └── marketplace.json
└── skills/
    └── <cross-project user skills only>/

~/plugins/
└── bos/
    ├── .codex-plugin/
    │   └── plugin.json
    ├── .mcp.json
    ├── .bos-package-state.json
    └── skills/
        ├── use-bos/
        ├── planning/
        ├── implementation/
        ├── review/
        ├── po-go-boundary-enforcement/
        └── authentication-context-integrity/

lead_director/
└── .agents/
    └── skills/
        ├── lead-director-planning/
        ├── lead-director-implementation/
        ├── lead-director-review/
        ├── lead-director-runtime-operations/
        ├── lead-director-reconciliation/
        └── <other Lead Director specializations>/
```

The plugin namespace presents foundation identities as:

```text
bos:use-bos
bos:planning
bos:implementation
bos:review
bos:po-go-boundary-enforcement
bos:authentication-context-integrity
```

## Selected primitives

| Required behavior | Selected primitive |
|---|---|
| User-wide BOS availability | Personal Codex plugin marketplace |
| Tenant-neutral BOS execution | BOS MCP server in the `bos` plugin |
| Repository-wide Lead Director guidance | `lead_director/.agents/skills` |
| BOS-to-application specialization | Stable qualified BOS identity referenced by a Lead Director skill |
| Product-specific skill selection | Versioned product manifest |
| Existing-installation handling | Inspect/plan/apply reconciler |
| Safe updates | Managed-path inventory, content hashes, staging directory, atomic replacement |
| User-content preservation | Managed ownership plus customer extension boundary |
| Local iteration pickup | Cachebuster update, plugin reinstall, new Codex thread |
| Repeatable validation | Fixture matrix plus live discovery smoke tests |

## Stage 0: Establish recovery and baseline

### LOCAL-000 — Commit the package baseline

**Outcome:** The existing BOS Operations Center prototype has a recoverable
source-control baseline.

**Work:**

- Review the currently untracked repository contents.
- Add the intended package, documentation, scripts, generated clients, tests,
  and policy files.
- Run `npm run release:check`.
- Create the initial commit only after explicit repository-owner approval.

**Acceptance:**

- `git status` identifies a clean or intentionally scoped baseline.
- `git ls-files` contains the package source.
- The baseline commit passes `npm run release:check`.

### LOCAL-001 — Capture the local skill and plugin inventory

**Outcome:** Migration decisions use a reproducible snapshot.

**Work:**

- Inventory:
  - `~/.agents/skills`;
  - `~/.codex/skills`;
  - `~/.agents/plugins/marketplace.json`;
  - `~/plugins/bos`;
  - installed plugin state from `codex plugin list`;
  - `lead_director/.agents/skills`;
  - duplicate `.claude/skills` trees; and
  - BOS Operations Center source and generated skills.
- Record path, skill name, description, owner, scope, content hash, duplicate
  paths, MCP dependencies, and proposed canonical source.
- Store sanitized inventory fixtures under package tests.
- Exclude credentials, customer data, caches, bytecode, and local tokens.

**Acceptance:**

- Every discovered `SKILL.md` appears exactly once in the inventory.
- Duplicate skill names and divergent copies are reported.
- The inventory identifies the current `bos@bos-icode` plugin as an adoptable
  local prototype.

## Stage 1: Implement the BOS foundation locally

### LOCAL-100 — Validate and adopt the existing local BOS plugin

**Outcome:** The existing `~/plugins/bos` structure becomes the controlled
local development target.

**Work:**

- Validate folder name, manifest name, semantic version, skills path, MCP
  configuration, and marketplace entry.
- Run the plugin validator.
- Validate the native remote MCP definition.
- Remove generated `__pycache__` content from the managed artifact set.
- Add a provisional `.bos-package-state.json` that records managed paths and
  hashes without claiming unrelated files.
- Preserve the current marketplace entry and its position.

**Acceptance:**

- Plugin validation passes.
- The remote MCP configuration tests pass.
- `codex plugin list` resolves `bos@bos-icode` to `~/plugins/bos`.
- A second adoption run reports `managed-current` and makes no file changes.

### LOCAL-101 — Extract `bos:planning`

**Outcome:** A generic BOS planning foundation is available through the plugin.

**Work:**

- Use the existing Lead Director `bos-planning` as extraction evidence.
- Retain BOS operating-system boundaries, planning sequence, risk handling,
  validation categories, and application-neutral invariants.
- Move Lead Director paths, Vault rules, exact application tests, and Oracle
  gates into the Lead Director specialization.
- Create `skills/planning/SKILL.md` and matching `agents/openai.yaml`.
- Keep the foundation concise and reference detailed BOS contracts only when
  required.

**Acceptance:**

- The description triggers on BOS platform planning.
- The skill contains no Lead Director repository paths.
- The skill is usable for another BOS application.
- Skill validation passes.

### LOCAL-102 — Extract implementation and review foundations

**Outcome:** `bos:implementation` and `bos:review` provide reusable platform
workflows.

**Work:**

- Extract common implementation sequencing, boundary preservation, evidence,
  validation, and review expectations.
- Keep application-specific source commands and approval gates in application
  specializations.
- Add UI metadata and BOS MCP dependencies when the workflow needs live BOS
  evidence.

**Acceptance:**

- Each skill has one focused trigger and workflow.
- Neither skill assumes Lead Director source layout.
- Both validate with the skill validator.

### LOCAL-103 — Extract boundary and authentication foundations

**Outcome:** The plugin contains reusable PO/GO and authentication-context
invariants.

**Work:**

- Extract `bos:po-go-boundary-enforcement`.
- Extract `bos:authentication-context-integrity`.
- Preserve fail-closed tenant, app, installation, role, plugin, and provider
  scope requirements.
- Put Lead Director scripts and exact test commands in the corresponding Lead
  Director specialization or repository references.

**Acceptance:**

- Foundation rules apply to Lead Director, Subscription Director, and future
  BOS applications.
- No foundation depends on one application's file layout.
- Auth and runtime scope tests cover missing and ambiguous context.

### LOCAL-104 — Reinstall the local plugin

**Outcome:** Codex loads the extracted foundation skills through the existing
`bos-icode` marketplace.

**Work:**

- Validate the completed local plugin.
- Update the Codex cachebuster through the supported helper.
- Reinstall `bos@bos-icode`.
- Start a new Codex thread for discovery testing.

**Acceptance:**

- `codex plugin list` reports the new version as installed and enabled.
- The new thread exposes all expected `bos:*` skills.
- The BOS MCP tool remains available.

## Stage 2: Implement Lead Director specializations locally

### LOCAL-200 — Create specialization pairs

**Outcome:** Lead Director applies the installed BOS foundations and adds its
application requirements.

**Initial mapping:**

| Existing mixed skill | BOS foundation | Lead Director specialization |
|---|---|---|
| `bos-planning` | `bos:planning` | `lead-director-planning` |
| `bos-implementation` | `bos:implementation` | `lead-director-implementation` |
| `bos-review` | `bos:review` | `lead-director-review` |
| `bos-po-go-boundary-enforcement` | `bos:po-go-boundary-enforcement` | `lead-director-po-go-boundary-enforcement` |
| `authentication-context-integrity` | `bos:authentication-context-integrity` | `lead-director-authentication-context-integrity` |

**Work:**

- Create each new specialization and remove the superseded mixed skill after
  validation.
- State the required qualified BOS foundation in the description.
- Direct the workflow to apply the BOS foundation first.
- Add Lead Director component ownership, architecture, Vault, tests, and Oracle
  review requirements.
- Keep exactly one callable specialization for each responsibility.

**Acceptance:**

- Every agent working inside Lead Director can discover the new skills.
- Each specialization names exactly one primary BOS foundation.
- The specialization contains the Lead Director delta.
- The BOS foundation remains the source for shared platform rules.

### LOCAL-201 — Add repository composition validation

**Outcome:** Lead Director CI detects broken foundation references and
duplicated BOS content.

**Work:**

- Add a validator that reads repository-local skill metadata and bodies.
- Confirm each declared `bos:*` dependency exists in the installed/local
  package test fixture.
- Detect missing composition declarations.
- Detect application paths inside BOS foundation fixtures.
- Detect substantial copied foundation sections in specializations.

**Acceptance:**

- Missing, misspelled, and ambiguous BOS dependencies fail.
- A valid specialization passes.
- The validator runs without requiring live BOS credentials.

### LOCAL-202 — Run activation and composition tests

**Outcome:** Real Codex threads demonstrate correct selection.

**Test matrix:**

| Working directory | Prompt class | Expected primary skill |
|---|---|---|
| Outside Lead Director | Generic BOS planning | `bos:planning` |
| Lead Director root | Lead Director feature planning | `lead-director-planning` plus `bos:planning` |
| Lead Director backend | BOS runtime mutation planning | Lead Director runtime specialization plus BOS boundary foundation |
| Lead Director client | UI implementation planning | `lead-director-implementation` plus `bos:implementation` |
| Unrelated repository | Lead Director-specific request | No implicit Lead Director skill |
| Any directory | Explicit BOS invocation | Named `bos:*` skill |

**Acceptance:**

- Expected skills appear in the new-thread skill list.
- Generic BOS prompts avoid Lead Director-only instructions.
- Lead Director prompts apply both foundation and specialization.
- Subagents spawned within the repository receive the same visible
  repository-root skills.

### LOCAL-203 — Retire mixed local skills

**Outcome:** The local environment has one unambiguous skill per responsibility.

**Work:**

- Compare old and new behavior using the activation matrix.
- Transfer any missing Lead Director delta into specializations.
- Disable or remove superseded mixed skills.
- Remove independent global copies of skills now supplied by `bos@bos-icode`.
- Preserve a recoverable inventory and backup.

**Acceptance:**

- Duplicate unqualified BOS skill names are absent.
- Local BOS foundations come from the installed plugin.
- Lead Director specializations come from its repository.
- User-global skills contain only cross-project personal workflows.

## Stage 3: Promote the proven model into package source

### PKG-300 — Import the local BOS prototype

**Outcome:** BOS Operations Center becomes the canonical source for the proven
local plugin.

**Work:**

- Compare `~/plugins/bos` against package sources by path and content.
- Import the tenant-neutral plugin manifest, MCP configuration, tests, and foundation
  skills into canonical package directories.
- Preserve provenance in the package inventory.
- Generate the local plugin from package source and compare it with the tested
  prototype.

**Acceptance:**

- Package output reproduces the tested local plugin.
- The generated plugin passes the same validator and remote MCP tests.
- The local plugin contains no independently edited managed file.

### PKG-301 — Establish layered canonical source

**Outcome:** Package source expresses platform, capability, vertical, and
product ownership.

**Target:**

```text
source/
├── platform/
├── capabilities/
├── verticals/
│   └── icode/
└── config/
products/
├── bos/
├── icode-operations-center/
└── lead-director/
```

**Work:**

- Move foundation skills into `source/platform`.
- Move reusable business procedures into `source/capabilities`.
- Move iCode-specific workflows into `source/verticals/icode`.
- Define versioned product manifests with explicit includes and supported
  clients.
- Keep a compatibility resolver until generated equivalence is proven.

**Acceptance:**

- Every skill resolves through exactly one canonical layer.
- Product includes are unique and deterministic.
- iCode excludes Lead Director-only content.
- BOS foundations exclude application-only content.

### PKG-302 — Implement product-aware deterministic builds

**Outcome:** The builder emits the correct plugin structure for each product.

**Work:**

- Preflight all manifests and source skills before changing generated output.
- Build into a repository-local staging directory.
- Validate staged output.
- Replace only generated directories atomically.
- Preserve client adapter manifests and configuration.
- Sort products, clients, skills, and files deterministically.

**Acceptance:**

- Two builds from the same source are byte-identical.
- Failed preflight preserves the last valid generated package.
- Each product contains exactly its declared skills.
- Codex plugin folder names match manifest names.

## Stage 4: Implement the idempotent installer/reconciler

### PKG-400 — Define installation state

**Outcome:** The installer can distinguish safe convergence from conflict.

**States:**

| State | Meaning | Action |
|---|---|---|
| `missing` | Target plugin or marketplace entry is absent | Create managed structure |
| `compatible-unmanaged` | Correct structure exists without package state | Verify and adopt with explicit evidence |
| `managed-current` | Managed files match desired version and hashes | No-op |
| `managed-stale` | Managed files match prior hashes and a package update exists | Atomic update |
| `partial` | Some required managed paths are absent | Create missing paths after conflict scan |
| `managed-modified` | A package-owned path has local modifications | Back up and replace |
| `conflict` | Marketplace identity or incompatible ownership is ambiguous | Stop and report |
| `invalid` | Manifest, marketplace, or directory structure violates schema | Stop and report |

The phrase “already in place” maps to `compatible-unmanaged` or
`managed-current`. The installer recognizes the structure and preserves it.
The phrase “create the correct structure” maps to `missing` or `partial`.

### PKG-401 — Add the managed-state manifest

**Outcome:** Updates know which files the package owns.

**Proposed `.bos-package-state.json` fields:**

- schema version;
- package and product identifier;
- installed version;
- client type;
- source build identifier;
- managed relative paths;
- SHA-256 hash for each managed file;
- marketplace identity and plugin identity;
- installation timestamp; and
- previous installed version.

Exclude credentials, access tokens, tenant identifiers, provider state, and
customer configuration.

### PKG-402 — Implement inspect and plan commands

**Outcome:** Users and tests can preview convergence without writes.

**Commands:**

```text
npm run install:inspect -- --client codex --product bos
npm run install:plan -- --client codex --product bos
```

**Output:**

- human-readable summary;
- optional JSON report;
- resolved target paths;
- current state;
- files to create, update, preserve, adopt, or conflict;
- marketplace changes; and
- proposed verification commands.

**Acceptance:**

- Inspect and plan perform no writes.
- Repeated plans against unchanged state are identical.
- Secrets and customer data never appear in reports.

### PKG-403 — Implement safe apply

**Outcome:** Installation converges to the desired structure.

**Algorithm:**

1. Resolve explicit client, product, marketplace, and target paths.
2. Validate every path remains within the selected installation root.
3. Inspect marketplace, plugin, managed state, and current hashes.
4. Stop on marketplace or ownership-identity conflicts.
5. Assemble desired output in a temporary directory.
6. Validate the staged plugin.
7. Back up replaced managed files to a timestamped recoverable directory.
8. Atomically replace managed files and create missing directories.
9. Merge the BOS marketplace entry while preserving unrelated entries and
   render order.
10. Write the managed-state manifest last.
11. Verify installed content against the desired hashes.
12. Emit the cachebuster and reinstall command required for Codex pickup.

**Acceptance:**

- Applying to `missing` creates the complete structure.
- Applying to `partial` creates required missing managed paths.
- Applying to `managed-current` changes zero bytes.
- Applying to `managed-stale` updates only managed paths.
- Applying to `managed-modified` backs up and replaces package-owned files.
- Applying to `conflict` changes zero bytes.
- Unrelated marketplace entries and user-owned plugin files remain unchanged.

### PKG-404 — Implement verify

**Outcome:** Installation health can be checked independently.

**Checks:**

- plugin directory and manifest identity;
- marketplace entry and source path;
- managed file hashes;
- skill frontmatter and folder names;
- required resources and scripts;
- MCP configuration;
- Codex installed/enabled state;
- generated cachebuster/version;
- absence of forbidden files and credentials; and
- application specialization dependency availability when a repository path
  is supplied.

### PKG-405 — Add fixture-based reconciliation tests

**Required fixtures:**

- empty home;
- existing `bos-icode` marketplace with unrelated plugins;
- existing correct unmanaged BOS plugin;
- current managed BOS plugin;
- stale managed BOS plugin;
- partial plugin tree;
- locally modified managed skill;
- extra user-owned plugin file;
- conflicting marketplace entry;
- mismatched plugin folder and manifest name;
- interrupted prior install;
- unsafe path traversal input; and
- invalid managed-state manifest.

**Acceptance:**

- Every state produces the expected plan, exit code, and filesystem result.
- Running apply twice produces an exact no-op on the second run.
- A simulated failure preserves the prior valid installation.
- Tests use temporary homes and never mutate the developer's real marketplace.

## Stage 5: Complete package validation and release

### PKG-500 — Expand release checks

Add validation for:

- product manifests;
- skill frontmatter;
- `agents/openai.yaml`;
- tool dependencies;
- qualified identity uniqueness;
- internal references;
- application-neutral BOS foundations;
- specialization composition fixtures;
- generated-output drift;
- plugin and marketplace schema;
- installer idempotency;
- absolute paths, credentials, and customer data; and
- deterministic archives and checksums.

### PKG-501 — Run local end-to-end installation

**Flow:**

1. Build and validate the package.
2. Inspect the current local BOS installation.
3. Plan adoption or update.
4. Apply through the package installer.
5. Update the cachebuster.
6. Reinstall `bos@bos-icode`.
7. Start a new Codex thread.
8. Run BOS-only and Lead Director composition prompts.
9. Exercise one read-only BOS MCP operation.
10. Verify a second installer run is a no-op.

### PKG-502 — Add clean-machine installation testing

Run the complete flow against an isolated temporary home before another client
machine:

- create `bos-icode` marketplace;
- create `~/plugins/bos`;
- install plugin;
- verify skill discovery;
- verify MCP startup;
- update plugin;
- preserve user files and unrelated marketplace entries; and
- verify repeat installation idempotency.

### PKG-503 — Complete cross-client packaging

After Codex local testing passes:

- generate Claude package structure;
- generate Copilot `.agents/skills` structure;
- apply equivalent managed-state and conflict rules where supported;
- preserve client-specific configuration;
- run install/update smoke tests for each client; and
- publish deterministic archives and checksums.

## Test gates

### Gate A — Local foundation

- BOS plugin validates.
- Broker tests pass.
- All foundation skills validate.
- A new Codex thread exposes expected `bos:*` identities.

### Gate B — Lead Director composition

- Repository-root discovery works from root, backend, and client directories.
- Specializations load their BOS foundations.
- Generic BOS tasks remain application-neutral.
- Lead Director tasks apply repository architecture and review gates.

### Gate C — Package reproduction

- Package output matches the locally proven plugin.
- Product selection is exact.
- Generated clients show no drift.

### Gate D — Installer convergence

- Missing, existing, stale, partial, and conflict states behave as specified.
- A second apply is a byte-for-byte no-op.
- User-owned content is preserved.

### Gate E — Release readiness

- Security and portability checks pass.
- Isolated-home installation passes.
- Codex live smoke tests pass.
- Cross-client packages pass their supported installation tests.

## Recommended execution order

```text
LOCAL-000 baseline
    → LOCAL-001 inventory
    → LOCAL-100 adopt existing bos@bos-icode
    → LOCAL-101..103 extract foundations
    → LOCAL-104 reinstall
    → LOCAL-200..203 Lead Director specialization tests
    → PKG-300 import proven plugin
    → PKG-301..302 layered product build
    → PKG-400..405 idempotent reconciler
    → PKG-500..503 release completion
```

Begin package implementation after Gate B passes. Begin another-machine testing
after Gate D passes.

## Initial implementation batch

The first implementation batch should complete:

1. LOCAL-000 with repository-owner approval;
2. LOCAL-001;
3. LOCAL-100;
4. LOCAL-101;
5. a new-thread activation test for `bos:planning`; and
6. a documented comparison between the existing Lead Director `bos-planning`
   and the new foundation/specialization split.

This batch proves discovery, namespace, extraction, adoption, and idempotent
local state before expanding the remaining foundations.

## Definition of done

- The local hierarchy matches the documented scope model.
- The existing `bos@bos-icode` installation is safely adopted.
- BOS foundations are reusable across applications.
- Lead Director skills specialize BOS foundations repository-wide.
- The package is the single canonical source for managed BOS plugin files.
- Product manifests generate exact client structures.
- The installer creates missing structure and recognizes correct existing
  structure.
- Updates replace only unchanged managed files.
- Conflicts stop before mutation and identify the exact files involved.
- Repeated build, plan, apply, and verify operations are deterministic.
- Live Codex testing confirms skill discovery, composition, and BOS MCP access.
