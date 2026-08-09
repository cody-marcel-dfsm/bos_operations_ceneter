# BOS Operations Packages Implementation Tasks

## Objective

Implement the architecture in [DESIGN.md](DESIGN.md) as a sequence of
independently reviewable changes. Preserve the current iCode Operations Center
distributions throughout the migration.

Use
[LOCAL_FIRST_SKILL_IMPLEMENTATION_PLAN.md](LOCAL_FIRST_SKILL_IMPLEMENTATION_PLAN.md)
as the execution plan. It establishes and tests the hierarchy locally before
promoting the proven BOS plugin into this package and completing the
product-aware builder, idempotent installer, and release system.

## Delivery order

```text
Local inventory and recovery baseline
    → local BOS foundation plugin
    → Lead Director repository specializations
    → local activation and composition tests
    → package source promotion
    → selective package generation
    → idempotent installation and update
    → canonical source migration
    → reusable capability extraction
    → customer configuration and authentication contracts
    → release packaging and end-to-end verification
```

The skill scope, namespace, and application-specialization contract is defined
in
[SKILL_HIERARCHY_AND_COMPOSITION.md](SKILL_HIERARCHY_AND_COMPOSITION.md).

## Milestone 1: Product-aware packaging foundation

### BOSPKG-001 — Establish the canonical source directories

**Outcome:** The repository has explicit platform, capability, vertical, and
product boundaries while the existing package continues to build.

**Scope:**

- Add `source/platform/`, `source/capabilities/`, and `source/verticals/icode/`.
- Add `products/icode-operations-center/product.json`.
- Keep `source/skills/` as the active canonical source until BOSPKG-006.
- Document the temporary compatibility boundary in the product manifest.

**Acceptance criteria:**

- The product manifest has a versioned schema identifier, product identifier,
  display name, included skills, and supported clients.
- Every included skill identifier resolves to one existing canonical skill.
- `npm run build` still generates the same ten iCode skills for all three
  clients.
- `npm run release:check` passes.

**Dependencies:** None.

### BOSPKG-002 — Define and validate the product-manifest schema

**Outcome:** Invalid product composition fails before generated directories are
changed.

**Scope:**

- Add a versioned JSON schema or equivalent explicit validator.
- Validate required fields, supported clients, unique includes, safe relative
  identifiers, and unknown fields.
- Reject missing skills, duplicate includes, directory traversal, and
  unsupported schema versions.
- Add valid and invalid manifest fixtures.

**Acceptance criteria:**

- Validation reports the product file and exact invalid field.
- The validator exits nonzero for every invalid fixture.
- Tests cover missing, duplicate, unknown, unsafe, and nonexistent includes.
- Validation runs in `npm run check`.

**Dependencies:** BOSPKG-001.

### BOSPKG-003 — Build products from manifest selection

**Outcome:** The builder copies only the skills selected by each product.

**Scope:**

- Refactor `scripts/build-packages.mjs` to load product manifests.
- Resolve skill identifiers across the temporary `source/skills/` layout and
  the target canonical directories.
- Build each declared product/client combination.
- Preserve client-specific adapter files outside generated skill directories.
- Sort products, clients, and skills for deterministic output.

**Acceptance criteria:**

- Removing a skill from a manifest removes it from every generated client for
  that product.
- Adding a valid skill includes it in every declared client.
- Undeclared skills never appear in a distribution.
- Two consecutive builds produce byte-identical generated skill trees.
- A failed preflight leaves existing generated directories unchanged.

**Dependencies:** BOSPKG-002.

### BOSPKG-004 — Add safe, atomic generated-directory replacement

**Outcome:** Interrupted or invalid builds cannot leave a partially generated
package.

**Scope:**

- Assemble each product/client skill tree in a repository-local temporary
  directory.
- Validate the assembled tree before replacing the target.
- Replace only the generated portion of each client package.
- Clean temporary build state after success or failure.

**Acceptance criteria:**

- A simulated copy or validation failure preserves the last valid generated
  tree.
- Adapter manifests and MCP configuration remain untouched.
- Temporary directories are absent after the command exits.
- The build emits a concise product/client/skill summary.

**Dependencies:** BOSPKG-003.

## Milestone 2: Client package composition

### BOSPKG-005 — Model client adapters independently from product skills

**Outcome:** Codex, Claude, and Copilot retain their native package structure
while sharing one selected skill set.

**Scope:**

- Define adapter metadata for each supported client.
- Map product identifiers to client package destinations.
- Preserve Codex marketplace/plugin files, Claude plugin/MCP files, and
  Copilot instructions during generation.
- Validate that each declared client has the required adapter files.

**Acceptance criteria:**

- Each generated product is installable from its client-specific root.
- Missing adapter files fail release validation with an actionable message.
- Product identity and version agree across the product manifest and client
  metadata.
- Client packages contain the same selected skill identifiers.

**Dependencies:** BOSPKG-003.

### BOSPKG-006 — Migrate canonical skills into architectural layers

**Outcome:** `source/platform/`, `source/capabilities/`, and
`source/verticals/icode/` become the only canonical skill sources.

**Initial mapping:**

| Current skill | Initial destination |
|---|---|
| `bos-mcp-client` | `source/platform/bos-mcp-client` |
| `bos-google-review-outreach` | `source/capabilities/review-outreach` |
| `icode-class-operations` | `source/verticals/icode/class-operations` |
| `icode-student-operations` | `source/verticals/icode/student-operations` |
| `icode-instructor-operations` | `source/verticals/icode/instructor-operations` |
| Remaining mixed iCode skills | `source/verticals/icode/` until extracted by BOSPKG-008 |

**Scope:**

- Move canonical skill directories and their resources.
- Update product includes and internal relative references.
- Remove the builder's `source/skills/` compatibility resolver.
- Remove `source/skills/` after generated output equivalence is verified.

**Acceptance criteria:**

- No generated client file is treated as canonical input.
- Every product include resolves through exactly one architectural layer.
- Internal skill references and resource links pass validation.
- The iCode package retains the intended ten workflow entry points.
- `npm run release:check` passes after the compatibility path is removed.

**Dependencies:** BOSPKG-004, BOSPKG-005.

### BOSPKG-007 — Add generated-output drift detection

**Outcome:** CI detects client copies that differ from canonical source and
product manifests.

**Scope:**

- Build into a temporary comparison location during checks.
- Compare expected and checked-in generated trees by path and content.
- Report added, removed, and changed files.
- Add the check to the validation workflow.

**Acceptance criteria:**

- Editing a generated skill directly causes CI to fail.
- Editing canonical source without rebuilding causes CI to fail.
- A clean rebuild clears the failure.
- Drift output names the product, client, and affected files.

**Dependencies:** BOSPKG-004, BOSPKG-006.

## Milestone 3: Reusable capability extraction

### BOSPKG-008 — Split mixed iCode workflows into capabilities and adapters

**Outcome:** Reusable operating procedures are independent from iCode-specific
terminology and policy.

**Delivery slices:**

1. `paid-attribution` plus an iCode attribution adapter.
2. `daily-operations-planner` plus iCode planner modules.
3. `communications` plus iCode parent policies and terminology.
4. `invoice-reconciliation` plus Bright Horizons and Calimatic modules.
5. `appointment-reconciliation` plus an iCode trial adapter.

**Acceptance criteria for each slice:**

- The generic capability contains no customer names, tenant identifiers,
  mailbox addresses, account identifiers, or location-specific policy.
- The iCode adapter declares its required generic capability.
- Provider and BOS capability requirements are explicit and machine-checkable.
- The iCode product preserves the current workflow behavior and terminology.
- Contract tests cover the generic capability and its iCode composition.

**Dependencies:** BOSPKG-006.

### BOSPKG-009 — Add provider capability-contract metadata

**Outcome:** Package validation can prove that each workflow declares the BOS
capabilities and providers it needs.

**Scope:**

- Define metadata for business capability, provider requirement, mutation
  behavior, and required authorization.
- Cover the stable BOS operations named in the design, including
  communications, calendar, ads, attribution, classes, students, reviews, and
  Lead Director.
- Validate references during build and release checks.

**Acceptance criteria:**

- Unknown BOS capabilities and undeclared adapter dependencies fail validation.
- Read and mutation requirements are distinguishable.
- Provider-specific modules sit behind stable business-capability identifiers.
- Contract metadata contains no credential values or customer authority.

**Dependencies:** BOSPKG-002, BOSPKG-008.

### BOSPKG-010 — Validate Lead Director repository composition

**Outcome:** Lead Director consumes BOS foundations without republishing them.

**Scope:**

- Define the contract used by repository-local `lead-director-*` skills to
  apply the corresponding `bos:*` foundations.
- Reject legacy repository skills that duplicate BOS foundation
  responsibilities.
- Reject any Lead Director companion product that republishes BOS foundations.

**Acceptance criteria:**

- Lead Director repository skills remain visible to every agent in the
  repository.
- Lead Director has no redundant generated plugin distribution.
- BOS foundation skills contain no Lead Director repository paths, Vault
  requirements, application-only commands, or release gates.
- Composition checks confirm that each Lead Director specialization names its
  required qualified `bos:*` foundation.
- All declared Lead Director workflows have valid capability contracts.
- All supported client package checks pass.

**Dependencies:** BOSPKG-005, BOSPKG-008, BOSPKG-009.

## Milestone 4: Configuration and authenticated operation

### BOSPKG-011 — Define the public customer-configuration contract

**Outcome:** Clients can store non-secret operating context without mixing it
with package source or access authority.

**Scope:**

- Define a versioned schema for organization/location selection, timezone,
  terminology, provider mappings, workflow defaults, and allowed exceptions.
- Define a client-neutral interface plus client-specific storage adapters.
- Add redacted example configurations.
- Reject secret-bearing field names and values.

**Acceptance criteria:**

- Configuration survives a package rebuild/update in installation tests.
- The schema cannot contain BOS keys, provider keys, OAuth secrets/tokens,
  passwords, cookies, service-account material, or private keys.
- Customer configuration cannot select an unauthorized tenant or capability.
- Invalid or ambiguous organization/location scope produces a clear user-facing
  resolution request.

**Dependencies:** BOSPKG-005, BOSPKG-009.

### BOSPKG-012 — Implement native remote authentication and authorization state handling

**Outcome:** Every secured workflow follows one consistent BOS connection,
scope resolution, provider setup, verification, and retry sequence.

**Scope:**

- Represent BOS client authorization, tenant resolution, capability
  authorization, and provider credential health as distinct states.
- Generate native remote Streamable HTTP configuration for Codex and Claude.
- Forward the client-managed `BOS_API_KEY` as an HTTPS Bearer header.
- Consume BOS-returned provider OAuth and HTTPS credential-collection actions
  without persisting or echoing credentials.
- Implement the recovery sequence defined in the design.
- Permit one retry after verified recovery.

**Acceptance criteria:**

- Diagnostics identify tenant, plugin, capability, and credential state using
  BOS-returned evidence.
- A missing or invalid `BOS_API_KEY` stops the affected operation with no
  secondary BOS login flow.
- Recovery verifies state before retrying and retries no more than once.
- Provider credentials are submitted directly to the BOS-hosted HTTPS flow and
  remain absent from model messages, logs, responses, generated files, customer
  configuration, and retries.

**Dependencies:** BOSPKG-009, BOSPKG-011.

### BOSPKG-013 — Enforce tenant isolation and no-fallback behavior

**Outcome:** Secured workflows cannot silently switch execution paths, tenants,
providers, or data sources.

**Scope:**

- Add negative tests for unauthenticated, alternate-tenant, direct-provider,
  native-connector, browser-session, local-data, and mock-data fallback.
- Add cross-tenant credential and configuration isolation tests.
- Verify that partial capability availability stops only affected operations.

**Acceptance criteria:**

- Every prohibited fallback test fails closed.
- Tenant A configuration or credentials cannot satisfy a Tenant B request.
- Results name the resolved operational scope.
- Mock or fixture output is explicitly labeled and cannot be returned as a real
  organization operation.

**Dependencies:** BOSPKG-012.

## Milestone 5: Release engineering

### BOSPKG-014 — Expand release validation and security scanning

**Outcome:** `npm run release:check` verifies package structure, source
integrity, portability, and credential safety.

**Scope:**

- Validate manifests, capability contracts, client adapters, and internal
  references.
- Scan generated artifacts in addition to source files.
- Detect absolute local paths, credential filenames, private-key formats,
  token patterns, and customer-data fixtures.
- Produce a machine-readable check report for CI.

**Acceptance criteria:**

- Each validation category has a positive and negative test.
- Failures identify the exact file and rule.
- The scanner covers the files that will enter release archives.
- The check runs on the repository's supported Node version in CI.

**Dependencies:** BOSPKG-007, BOSPKG-009, BOSPKG-011.

### BOSPKG-015 — Generate deterministic release archives

**Outcome:** Each product/client distribution can be delivered without cloning
the repository.

**Scope:**

- Add a release command that builds and validates first.
- Create one archive per product/client combination in `dist/`.
- Normalize file ordering, timestamps, permissions, and archive names.
- Emit checksums and a release manifest.

**Acceptance criteria:**

- Two releases from the same commit produce identical checksums.
- Archives contain only the selected product, client adapter, documentation,
  and credential-free public metadata.
- Extracted archives pass package validation.
- `dist/` remains generated and excluded from source control except for its
  placeholder.

**Dependencies:** BOSPKG-014.

### BOSPKG-016 — Complete client installation and authenticated smoke tests

**Outcome:** Release evidence covers installation, first connection, normal
operation, recovery, and update behavior for supported clients.

**Test matrix:**

| Flow | Codex | Claude | Copilot |
|---|---:|---:|---:|
| Install product package | Required | Required | Required |
| Load customer configuration | Required | Required | Required |
| Connect BOS | Required | Required | Required |
| Resolve tenant/capabilities | Required | Required | Required |
| Complete provider setup | Required | Required | Required |
| Run one read workflow | Required | Required | Required |
| Run one authorized mutation workflow | Required | Required | Required |
| Recover expired authorization | Required | Required | Required |
| Update while preserving configuration | Required | Required | Required |

**Acceptance criteria:**

- Every matrix cell has a recorded pass/fail result and reproducible procedure.
- Tenant isolation and no-fallback tests pass for every client.
- Release archives contain no credentials or customer data after testing.
- The release checklist links to smoke-test evidence and archive checksums.

**Dependencies:** BOSPKG-013, BOSPKG-015.

### BOSPKG-018 — Replace local broker transport with remote Streamable HTTP

**Outcome:** Every supported client reaches BOS directly through its native
remote MCP transport on macOS, Windows, and Linux.

**Scope:**

- Replace subprocess MCP definitions with HTTPS endpoint definitions.
- Remove the Python broker, compiled executable, loopback listeners, broker
  tests, and platform-specific broker build dependencies.
- Give restricted product profiles unique MCP server names and endpoints.
- Move tool filtering, routing, and provider-recovery state to the BOS service.

**Acceptance criteria:**

- Generated Codex and Claude runtime products contain `type: http`, an HTTPS
  URL, and an environment-derived Authorization header.
- Generated client packages contain no `command`, `stdio`, executable, Python
  runtime, or local credential listener.
- The Video Ads product targets only `/mcp/video-ads` through the
  `video-ads` server identity.
- Missing `BOS_API_KEY` fails at the BOS service boundary and cannot initiate a
  second BOS authentication mechanism.

**Dependencies:** BOSPKG-012, BOSPKG-015.

### BOSPKG-019 — Produce an OS-neutral customer distribution

**Outcome:** One deterministic ZIP installs from macOS, Windows, or Linux
without a compiled client transport.

**Scope:**

- Package all generated Codex, Claude, and Copilot distributions.
- Publish versioned and stable OS-neutral ZIP names.
- Run validation and release jobs on a platform-neutral CI runner.
- Document native installation and GCP-managed `BOS_API_KEY` configuration.

**Acceptance criteria:**

- The ZIP contains all three client distributions and no platform binary.
- ZIP contents and checksums are deterministic.
- The complete release build passes on Linux CI.
- Client smoke-test evidence covers macOS, Windows, and Linux where each host
  client is supported.

**Dependencies:** BOSPKG-018.

### BOSPKG-017 — Rename and document the standalone repository

**Outcome:** The repository identity matches its multi-product purpose before
public release.

**Scope:**

- Rename the package/repository identity to `bos-operations-packages`.
- Keep `iCode Operations Center` as the iCode product display name.
- Update README, package metadata, contribution guidance, security
  documentation, and release instructions.
- Confirm trademark and attribution text for each named product.

**Acceptance criteria:**

- Repository-level metadata uses `bos-operations-packages`.
- Generated client packages use their product-specific identifiers and display
  names.
- Documentation distinguishes repository, platform, and product terminology.
- All build, check, release, and smoke-test commands pass after the rename.

**Dependencies:** BOSPKG-010, BOSPKG-016.

## Recommended first implementation batch

Complete LOCAL-000 through LOCAL-104 from the local-first plan before
BOSPKG-001. This establishes the source-control baseline, inventories existing
skills, adopts the installed `bos@bos-icode` prototype, extracts the first BOS
foundations, and verifies their discovery in a new Codex thread.

Complete LOCAL-200 through LOCAL-203 next to prove Lead Director composition.
Then implement BOSPKG-001 through BOSPKG-004 in one feature branch. That batch
promotes the locally proven structure into the product-aware build foundation
while preserving the current generated package behavior.

## Definition of done for every task

- The task's acceptance criteria are covered by automated tests where
  practical.
- `npm run build` and `npm run release:check` pass.
- Canonical source and regenerated client output are committed together.
- Documentation reflects the implemented behavior.
- Generated packages contain no credentials, customer data, or local user
  paths.
- Security, tenant isolation, and no-fallback invariants remain intact.
