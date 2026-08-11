# Education Center product identity and tenant branding

## Decision

Use `Education Center` as the generic product and vertical name for the
childhood education franchise-in-a-box package.

Use these package-owned technical identities:

- product and MCP group: `education-center`;
- vertical skills: `education-center-*`;
- MCP tool aliases: `education_center_*`;
- runtime server alias: `bos_education_center`;
- credential binding: `EDUCATION_CENTER_BOS_API_KEY`.

For an existing Codex installation, preserve the already active pre-rename
process binding as a compatibility alias when the newly declared binding is
absent. The installer reuses the binding name without copying, displaying, or
persisting the bearer. Fresh installations use
`EDUCATION_CENTER_BOS_API_KEY`.

During customer initialization, ask for and persist the tenant's
customer-facing franchise or brand name as `brand_display_name` in the
customer-owned `config/customer-settings.json` overlay. Apply it wherever
customer-facing drafts, reports, summaries, or communications name the brand.

A typed customer extension may override
`terminology.brand_display_name` for its base skill. Keep both settings values
out of product names, skill names, MCP routes, server names, environment
variables, tool and capability names, authorization selectors, and persisted
record identifiers.

## Outcome

The distributed package remains reusable across education franchises. Each
tenant receives branded operating output without embedding customer identity in
canonical source or granting authority through configuration.
