# Desktop private marketplace and OAuth client review

- **Date:** 2026-08-11
- **Scope:** Claude Cowork/Desktop and ChatGPT/Codex Desktop packaging,
  installation, OAuth handoff, generated-client parity, release artifacts, and
  customer guidance.
- **Controlling sources:** `Vault/docs/architecture.md`,
  `Vault/docs/CONSTITUTION.md`, and
  `Vault/decisions/2026-08-11-desktop-private-marketplace-oauth.md`.

## Findings

No material findings remain.

## Architecture evidence

- `Vault/docs/architecture.md:31-39` assigns desktop MCP authorization to the
  hosts' OAuth 2.1 flow and prohibits client API-key fields, authorization
  templates, and credential environment bindings.
- `Vault/docs/architecture.md:61-74` preserves the immutable named MCP route and
  requires server-derived actor, organization, installation, role, plugin, and
  capability scope without authorization fallthrough.
- `Vault/docs/architecture.md:99-116` makes native private marketplaces the
  pre-publication distribution path and defines Connect/Sign in, update, cache,
  and new-task behavior without OS-specific launchers.
- `scripts/lib/package-model.mjs:237-253` materializes only the package-owned
  HTTPS resource for Claude and Codex.
- `scripts/build-packages.mjs:51-115` generates explicit `oauth_2_1` desktop
  metadata, omits Claude `userConfig`, and keeps host-specific manifests.
- `scripts/build-packages.mjs:306-316` generates the repository-level Codex
  marketplace alongside the existing Claude marketplace.
- `scripts/install-package.mjs:350-375` recognizes the OAuth desktop package,
  rejects embedded credential material, and returns the host Connect action
  without inspecting or registering an environment key.
- `README.md:8-23` routes customers and maintainers to explicit operating
  environments. `README.md:25-101` provides the paste-ready Codex flow, the
  Claude Cowork/Desktop flow, updates, archive fallback, and customer settings.
- `README.md:131-226` separates local plugin development from artifact-only
  builds and maintainer release validation.

## Security and parity evidence

- Generated Claude and Codex Education Center `.mcp.json` files contain one
  HTTPS URL and no header or `bearer_token_env_var`.
- Generated Claude runtime manifests contain no `userConfig` credential field.
- Education Center is `ON_INSTALL` in both Codex marketplace catalogs.
- `scripts/check-package.mjs:175-300` fails generated-package validation when a
  desktop package contains a credential binding or diverges from the canonical
  route.
- `tests/installer.test.mjs:191-253` proves host-managed state, ignores a legacy
  environment key, avoids an Education Center `codex mcp add`, and rejects
  credential material added to an OAuth package.
- `tests/package-model.test.mjs:682-767` proves URL-only Claude/Codex parity and
  absence of Claude user configuration. Lines 959-1019 guard credential-free
  customer guidance, environment navigation, and separation of customer,
  developer, and maintainer instructions. Lines 1021 onward guard both
  repository marketplace catalogs.
- Canonical skill updates are regenerated across every declared client. The
  shared guidance distinguishes Claude/ChatGPT/Codex OAuth from the preserved
  Copilot and Gemini adapters.

## Validation evidence

- `npm run build:packages`: generated two active products for all four clients.
- `npm test`: 125 passed, 0 failed.
- `npm run check`: package structure, generated parity, and credential scan
  passed.
- `npm run build:artifacts`: generated eight deterministic client archives and
  the optional OS-neutral customer archive.
- `npm run check:build`: release archive inventory passed and the customer
  archive excludes the obsolete OS-specific launcher.
- `git diff --check`: passed.
- `git ls-files '*.zip' '*.tar.gz'`: returned no tracked archives.
- `dist/` is ignored, and `.gitignore` excludes repository-wide `*.zip` and
  `*.tar.gz` files.

## Rollout condition

The client package is ready for private-marketplace testing. Production
connection readiness remains gated on the server-side OAuth protected-resource
and authorization-server contract. Until that service is deployed, the client
must report `authentication_required` and must not represent authentication
failure as unavailable business data.

APPROVED
