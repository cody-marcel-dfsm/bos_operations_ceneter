# Skill Hierarchy and Application Composition

## Decision

BOS provides installable, reusable foundation skills. Each application
provides repository-local skills that apply the BOS foundation and add the
application's architecture, terminology, validation, and operating rules.

Skill availability follows the user and working-directory scope:

```text
Codex system skills
    ↓ available everywhere
user-global skills
    ↓ available to the user in every working directory
installed BOS plugin skills
    ↓ available wherever the user has the BOS plugin
repository-root skills
    ↓ available to every agent working in the repository
nested-directory skills
    ↓ available to every agent working in that subtree
```

The `.agents` directory is the standard repository discovery surface. It does
not partition skills by individual agent. Every agent operating in a working
directory receives the skills visible from that directory.

## Scope hierarchy

| Scope | Canonical location | Availability | Owner |
|---|---|---|---|
| System | Bundled with Codex | Every user and project | Codex |
| User-global | `~/.agents/skills/<skill>/SKILL.md` | The user in every working directory | User |
| Installed package | BOS plugin `skills/<skill>/SKILL.md` | Users with the BOS plugin installed | BOS package |
| Customer extension | Installed plugin `skills/<base>-<site>/SKILL.md` | Customer installation | Customer |
| Repository root | `<repo>/.agents/skills/<skill>/SKILL.md` | Every agent working anywhere in the repository | Repository |
| Nested directory | `<repo>/<subtree>/.agents/skills/<skill>/SKILL.md` | Every agent working inside that subtree | Subtree owner |

Codex scans `.agents/skills` from the current working directory through the
repository root. A root skill therefore applies throughout the repository. A
nested skill narrows availability to the nested working-directory tree.

Use each scope for one purpose:

- Keep platform-provided skills in the system scope.
- Keep personal workflows that apply across unrelated repositories in the
  user-global scope.
- Distribute reusable BOS workflows and BOS MCP access through the BOS plugin.
- Express customer terminology, defaults, policies, and exceptions in a
  distinct customer-owned extension skill that invokes a qualified packaged
  skill.
- Keep application-specific source, architecture, runtime, test, and deployment
  workflows at the application repository root.
- Use nested skills only when a module needs a workflow that should remain
  limited to that subtree.

## BOS package namespace

Publish the client package with the plugin identity `bos`. Keep each packaged
skill focused on a reusable BOS goal:

```text
bos
└── skills/
    ├── use-bos/
    ├── planning/
    ├── implementation/
    ├── review/
    ├── po-go-boundary-enforcement/
    ├── authentication-context-integrity/
    └── ...
```

The plugin identity supplies the external qualification:

```text
bos:use-bos
bos:planning
bos:implementation
bos:review
bos:po-go-boundary-enforcement
bos:authentication-context-integrity
```

Qualified identities preserve package ownership and allow application
repositories to define complementary local skills without colliding with the
BOS foundation.

Installed package skills are read-only managed files. A customer extension has
a distinct name, declares its qualified base skill in
`.bos-extension.json`, and contains only the customer's typed additions.
`manage-customer-extension` creates and updates these overlays from natural
language requests. Customer-configurable values take precedence over matching
base defaults; system instructions, BOS authority, package invariants, MCP
transport, credentials, and tool grants retain their owning authority. Package
updates back up and replace managed files while preserving extension
directories absent from the package inventory.

Cross-client customer-owned discovery roots are `~/.agents/skills` for Codex,
`~/.claude/skills` for Claude, and repository `.agents/skills` for Copilot.
Managed BOS local installations may keep extensions beside packaged skills.

Packaged BOS skills must remain application-neutral. They may define:

- authenticated BOS MCP access;
- tenant and application scope resolution;
- provider and capability discovery;
- platform planning, implementation, and review workflows;
- PO/GO/data-access invariants;
- authentication and runtime-context invariants;
- evidence, mutation, recovery, and fail-closed rules; and
- reusable business capabilities selected by product manifests.

Application source paths, repository architecture documents, application-only
tests, and application release gates belong in repository-local specialization
skills.

## Application specialization

An application repository defines thin skills that compose a BOS foundation
with the application's local requirements.

Lead Director should expose repository-wide skills such as:

```text
lead_director/
└── .agents/
    └── skills/
        ├── lead-director-planning/
        ├── lead-director-implementation/
        ├── lead-director-review/
        ├── lead-director-authentication-context-integrity/
        ├── lead-director-po-go-boundary-enforcement/
        ├── lead-director-runtime-operations/
        ├── lead-director-reconciliation/
        └── lead-director-performance-testing/
```

Every agent working in `lead_director/` or one of its subdirectories can use
these skills.

The composition model is:

```text
bos:planning
    + Lead Director component ownership
    + Lead Director architecture and Vault requirements
    + Lead Director test and Oracle gates
    = lead-director-planning

bos:implementation
    + Lead Director source layout and implementation contracts
    + Lead Director focused validation
    = lead-director-implementation

bos:review
    + Lead Director constitution and architecture evidence
    + Lead Director deployment readiness
    = lead-director-review

bos:po-go-boundary-enforcement
    + Lead Director router, PO, GO, repository, and test ownership
    = lead-director-po-go-boundary-enforcement
```

Other applications follow the same pattern:

```text
bos:planning
├── lead-director-planning
├── subscription-director-planning
└── icode-operations-planning
```

The BOS skill owns the reusable invariant. The application skill owns the
specialization. Application skills preserve the BOS invariant and contain only
the additional application context.

## Composition contract

The Agent Skills format currently provides tool dependencies through
`agents/openai.yaml`. It does not provide a formal skill-to-skill dependency
field. Express skill composition through all of the following:

1. Give the BOS foundation a stable plugin-qualified identity.
2. State the required BOS foundation in the application skill description.
3. Direct the application skill to load and apply that BOS skill first.
4. Declare required MCP tools in `agents/openai.yaml`.
5. Record package-level capability dependencies in the BOS product manifest.
6. Validate the composition contract in package and repository checks.

A Lead Director specialization should follow this shape:

```markdown
---
name: lead-director-planning
description: Plan Lead Director application work by applying the installed BOS planning workflow and Lead Director repository architecture, Vault, component, testing, and review requirements.
---

1. Load and apply `bos:planning` as the foundational workflow.
2. Read the Lead Director component map and canonical architecture.
3. Add Lead Director-specific constraints, validation, and review gates.
4. Preserve every BOS platform invariant.
```

The application skill should reference the qualified BOS identity. It should
avoid copying the BOS workflow body. This keeps BOS fixes centralized and
allows every application specialization to receive the updated foundation.

## Selection behavior

Skill activation uses explicit invocation or description matching. Directory
depth and duplicate names do not create inheritance or merging.

Apply these selection rules:

1. Honor an explicitly invoked skill.
2. Use an application specialization when the request concerns that
   application's repository, source, runtime, tests, or deployment.
3. Load the BOS foundation named by the specialization.
4. Use a direct BOS skill for tenant-scoped operations or platform work that
   has no application-specific source context.
5. Use a user-global skill for a cross-project personal workflow.
6. Use a system skill for the underlying general capability.

Keep descriptions narrow enough to distinguish platform and application
requests. Use `bos:*` for reusable platform behavior and
`lead-director-*` for Lead Director specialization.

## Canonical ownership

Each skill has one editable source:

| Skill class | Editable source |
|---|---|
| BOS foundation | `source/platform/` |
| Reusable BOS business capability | `source/capabilities/` |
| Industry or franchise adapter | `source/verticals/<vertical>/` |
| Product selection | `products/<product>/product.json` |
| Lead Director specialization | `lead_director/.agents/skills/` |
| Generated client skill | Generated from this package; read-only |
| User-global custom workflow | `~/.agents/skills/` |

Generated Codex, Claude, and Copilot directories remain build outputs. Global
skill directories should not contain independent copies of BOS package skills.

## Migration plan

### Phase 1: Inventory and classify

Create a machine-readable inventory of current BOS, user-global, and Lead
Director skills. Record:

- skill name and path;
- owner and intended scope;
- canonical source;
- duplicate locations;
- BOS foundation or application specialization role;
- MCP and capability requirements; and
- target product manifests.

Classify every skill as system, user-global, BOS platform, reusable capability,
vertical adapter, product selection, application specialization, or retired.

### Phase 2: Extract BOS foundations

Refactor the existing mixed Lead Director/BOS skills into application-neutral
BOS foundations:

- `bos:planning`;
- `bos:implementation`;
- `bos:review`;
- `bos:po-go-boundary-enforcement`; and
- `bos:authentication-context-integrity`.

Move reusable instructions into this package's canonical source layers.
Remove Lead Director paths, Vault requirements, application-only test commands,
and Lead Director release gates from the BOS foundation.

### Phase 3: Create Lead Director specializations

Create or revise repository-root Lead Director skills:

- `lead-director-planning`;
- `lead-director-implementation`;
- `lead-director-review`;
- `lead-director-runtime-operations`; and
- other focused Lead Director workflows.

Make each specialization load its required `bos:*` foundation and add only the
Lead Director delta.

### Phase 4: Establish package identity

Publish the Codex client plugin with the stable identity `bos`. Generate the
selected BOS foundation, capability, and vertical skills from this repository.
Preserve product-specific display names through product manifests.

Use the plugin namespace for package ownership and product manifests for skill
selection. Install the `bos` plugin once to supply foundations and the single
BOS MCP connection. An iCode companion plugin supplies iCode vertical skills
and uses that connection. The Lead Director source repository contributes its
local specializations and applies the installed BOS foundations.

### Phase 5: Remove duplicate exposure

After package installation and composition tests pass:

- remove global copies of packaged BOS skills;
- remove manually maintained client copies;
- generate client distributions from canonical package source;
- keep Lead Director specializations in its repository; and
- remove legacy repository skills that duplicate BOS foundation
  responsibilities;
- preserve user-global skills that genuinely apply across unrelated projects.

### Phase 6: Enforce boundaries

Add validation that fails when:

- a generated client skill differs from canonical source;
- a BOS foundation contains an application-specific repository path or gate;
- an application specialization omits its required qualified BOS foundation;
- a Lead Director legacy BOS workflow directory remains;
- a companion product republishes BOS foundation skills under another plugin
  namespace;
- a packaged skill also exists as an independently maintained global copy;
- product manifests reference unknown skills or capabilities;
- two package entries expose the same qualified identity; or
- a packaged artifact contains credentials, customer data, or machine-specific
  paths.

## Acceptance criteria

The hierarchy is complete when:

- system skills remain platform-managed;
- user-global skills are available across the user's working directories;
- the installed BOS plugin exposes stable `bos:*` foundations;
- every agent working inside Lead Director can access its repository-root
  specializations;
- Lead Director specializations apply BOS foundations and contain only the
  application delta;
- another application can specialize the same BOS foundation independently;
- each skill has one canonical editable source;
- generated client packages stay synchronized; and
- package validation detects scope, composition, identity, dependency, and
  credential-safety violations.
