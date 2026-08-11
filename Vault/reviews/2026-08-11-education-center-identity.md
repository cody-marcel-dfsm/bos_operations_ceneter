# Education Center identity and tenant-branding review

- **Date:** 2026-08-11
- **Scope:** Complete Education Center product rename, tenant brand
  parameterization, generated clients, installers, tests, documentation, and
  release artifacts.
- **Controlling sources:** `Vault/docs/architecture.md`,
  `Vault/docs/CONSTITUTION.md`,
  `Vault/specs/customer-skill-extensions.md`, and
  `Vault/specs/named-mcp-application-group-routing.md`.

## Findings

No material repository findings remain.

## Architecture evidence

- Product-owned identifiers are generic and internally consistent in
  `products/education-center/product.json:3-37`: the package and MCP group use
  `education-center`, the credential binding uses
  `EDUCATION_CENTER_BOS_API_KEY`, and all vertical includes use the
  `education-center-*` skill family.
- The canonical settings template declares an empty customer-owned brand value
  at `source/config/education-center.settings.template.json:1-6`. It contains no
  tenant identity or credential.
- Initialization preserves or asks for `brand_display_name`, refuses to infer
  it from package or public context, writes only the protected customer overlay,
  and confines it to display use at
  `source/verticals/education-center/education-center-customer-initialization/SKILL.md:16-87`.
- Service routing applies the global setting or a typed per-skill terminology
  override while sealing routes, environment variables, tool names,
  authorization selectors, and record identifiers at
  `source/verticals/education-center/education-center-service-routing/SKILL.md:12-43`.
- Installer validation requires the brand value, bounds it to inert single-line
  display text, and keeps it out of automatically derived client metadata at
  `scripts/install-package.mjs:511-635`.
- Installer convergence rewrites stale marketplace identity metadata while
  preserving unrelated marketplace entries, preventing a legacy marketplace
  label from surviving an Education Center upgrade.
- The generated Codex client preserves one exact remote route and one declared
  credential binding at
  `clients/codex/plugins/education-center/.mcp.json:1-9`. Package checks prove
  equivalent generated Claude, Copilot, and Gemini distributions.
- The durable architecture continues to separate customer settings from
  canonical source and package-owned routes at
  `Vault/docs/architecture.md:45-88`.

## Validation evidence

- `npm run build:artifacts`: passed; generated two active products, eight
  deterministic product archives, and both customer ZIP names.
- `npm run check:build`: passed.
- `npm run check`: package structure, generated parity, and credential scan
  passed.
- `npm test`: 120 passed, 0 failed.
- `git diff --check`: passed.
- Repository content and path scan found no removed hard-coded brand identity
  outside disposable third-party `unicode` package filenames.
- Vault index sync completed after the final authored-source changes.

## Release dependency

The read-only production smoke was run with an existing tenant-scoped BOS
credential after the repository validation gate. The
`/mcp/apps/leaddirector/education-center` initialization request returned HTTP
404, so the owning Lead Director application repository must still publish the
route and the `education_center_*` aliases. The package source change is
approved; production runtime certification remains pending on that external
deployment.

APPROVED
