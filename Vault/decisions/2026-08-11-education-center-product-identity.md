# Education Center product identity and tenant branding

## Decision

Use `Education Center` as the generic product and vertical name for the
childhood education franchise-in-a-box package.

Use these package-owned technical identities:

- product and MCP group: `education-center`;
- vertical skills: `education-center-*`;
- MCP tool aliases: `education_center_*`;
- runtime server alias: `bos_education_center`;
- desktop authorization resource:
  `https://dfsm.ai/mcp/apps/leaddirector/education-center`.
- Codex registered app: `asdk_app_6a7cb1cc330c81918aa63d96aeeaba91`.

Claude and ChatGPT/Codex desktop installations authorize that immutable
resource through host-managed OAuth 2.1. Claude declares it directly; Codex
references the registered Education Center app through `.app.json`. Their
package source and generated clients contain no API-key binding. Copilot and Gemini retain their existing
client-specific adapters until separately migrated.

During customer initialization, complete the product connection's host-managed
authentication before eliciting settings. Then derive or propose the tenant's
customer-facing franchise or brand name as `brand_display_name`, present it with the other
required base values as a sourced recommendation, and persist the complete set
after the customer accepts or corrects it. An explicit brand label takes
precedence; a consistent organization or location label may supply a suggested
default. Apply the accepted brand wherever customer-facing drafts, reports,
summaries, or communications name it.

A typed customer extension may override
`terminology.brand_display_name` for its base skill. Keep both settings values
out of product names, skill names, MCP routes, server names, environment
variables, tool and capability names, authorization selectors, and persisted
record identifiers.

## Outcome

The distributed package remains reusable across education franchises. Each
tenant receives branded operating output without embedding customer identity in
canonical source or granting authority through configuration.
