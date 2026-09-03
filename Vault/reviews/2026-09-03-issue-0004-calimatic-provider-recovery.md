# Issue #0004 Calimatic provider-recovery Oracle review

Date: 2026-09-03

Product version: `0.4.79`

## Scope

Reviewed the complete actual working-tree diff for Issue #0004, including every
tracked and untracked file, canonical architecture and constitution changes,
Issue History, the provider-recovery RCA, platform and Education Center source
skills, generated Codex, Claude, Copilot, and Gemini clients, regression tests,
package ownership, repository boundaries, credential safety, and supplied
validation evidence.

## Findings

No material repository finding remains.

The client correction preserves the authenticated root BOS identity boundary,
validates the provider surface against `authorization_kind`, refuses a second
root BOS sign-in during provider recovery, polls the existing transaction once,
preserves the pending operation, and reports
`provider_recovery_identity_boundary` when the provider form remains absent.
The owning BOS server still must remove its separate browser-session gate and
serve the Calimatic credential collector from the transaction-bound URL. Issue
#0004 therefore remains active after this client-side approval.

## Screenshot receipt

Both supplied PNGs were visually inspected from their exact local artifacts and
their SHA-256 values were independently recomputed.

1. `/var/folders/01/sn57hs8566145w17svn1c9780000gn/T/codex-clipboard-0068e533-61a0-433b-91dd-0c7ae635aa73.png`
   - SHA-256:
     `90cd92d50d170a0ed3f872bf9d378aedf3b50dbf7bb375f3fda6495ff74f96bd`
   - Surface: Codex Desktop conversation with an embedded `dfsm.ai` browser.
   - Observed action/state: the browser displays **Sign in to authorize BOS**,
     offers **Open BOS sign in**, and then says **Signed in. Continuing to
     authorization...**. The conversation says the intended flow was the
     Calimatic portal-URL/API-key page and later acknowledges that root BOS
     authentication was launched instead.
2. `/var/folders/01/sn57hs8566145w17svn1c9780000gn/T/codex-clipboard-17c9386f-1d46-4ba4-a496-7ab618e35286.png`
   - SHA-256:
     `04f288296c83fc746e509613917d25562a3863ee1a2433e193a717c4dbdd707a`
   - Surface: cropped Codex Desktop provider-recovery conversation.
   - Observed action/state: **Advance to Calimatic credential form** is visible;
     the user states **BOS is already authenticated**; after **Bos get
     authorization status**, the client confirms the BOS MCP connection is
     authenticated, identifies the separate BOS web-session gate, and reports
     the provider transaction remains pending. No Calimatic credential form is
     visible.

These screenshots prove the reported 0.4.79 defect state. They are not evidence
that the server-owned recovery page has been corrected or deployed.

## Architecture and implementation evidence

- `Vault/docs/CONSTITUTION.md:11-24` preserves one host-managed BOS login and
  prohibits a second BOS browser login during provider recovery.
- `Vault/docs/architecture.md:46-66` makes the authenticated MCP result the root
  identity boundary and requires a provider URL to proceed directly to provider
  consent or secure credential collection.
- `Vault/specs/plugin-service-console.md:174-196` requires an API-key recovery
  URL to render the provider collector, refuses root BOS sign-in, preserves the
  transaction, and emits the bounded failure classification.
- `source/platform/bos-mcp-client/SKILL.md:188-227` distinguishes OAuth and API
  key recovery, keeps credentials out of model/client state, polls the existing
  transaction once, and prevents the browser page from overriding authenticated
  MCP state.
- `source/platform/authentication-context-integrity/SKILL.md:109-125`,
  `source/platform/bos-plugin-console/SKILL.md:106-130`, and
  `source/platform/bos-guided-support/references/support-state-machine.md:54-63`
  apply the same fail-closed boundary across auth, console, and support paths.
- `source/verticals/education-center/education-center-service-routing/SKILL.md:56-67`
  specializes the generic provider guard for Calimatic without owning another
  connection or credential.
- `tests/education-center-direct-calimatic-routing.test.mjs:38-65` covers API-key
  surface selection, authenticated-root preservation, the single bounded poll,
  failure classification, and all affected canonical sources.
- `npm run check` confirms canonical/generated parity across all active clients,
  repository-maintainer Oracle exclusion, valid package structure, and a
  credential-free tree.
- The diff contains no BOS server source, infrastructure, deployment, or
  database mutation. The RCA assigns transaction binding, browser surface,
  credential persistence, and deployment to the owning server repository.

## Validation

- Focused Calimatic routing tests: 4/4 passed.
- `npm run contract:check`: passed with one canonical BOS resource and no
  violations.
- `npm run release:check`: passed deterministic generation, package and
  credential validation, contract validation, and 249/249 tests.
- `git diff --check`: passed.

## Prevention

Keep root BOS OAuth, provider OAuth, and API-key collection as separately tested
states. Bind every recovery page to its authenticated provider transaction,
verify that the first surface matches `authorization_kind`, and reject any
provider page that attempts to regress an authenticated client to root BOS
sign-in.

APPROVED
