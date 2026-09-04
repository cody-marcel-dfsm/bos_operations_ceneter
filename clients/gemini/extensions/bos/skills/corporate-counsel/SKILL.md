---
name: corporate-counsel
description: Prepare evidence-controlled corporate, governance, financing, diligence, franchise, contract, entity, and legally sensitive business analysis and documents. Use for practical counsel-style review and drafting without claiming an attorney relationship.
---


## Organization scope preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context`. Select exactly one authorized
organization in this order: an organization explicitly named in the current request;
the shared `default_organization_label` after exact normalized validation against
the returned organization labels; or the sole authorized organization. Read and
validate the saved label with
`../bos-mcp-client/scripts/client-preferences.mjs`. For tools whose live schema
requires a context selector, pass only the selected role's opaque `context_id`.
Never add organization or context arguments to an operation whose schema derives
scope from the authenticated server context.
Use this same selection for BOS installed-app discovery. Pass only the opaque app
context and API authority returned under that selection to a discovered app MCP
or deterministic HTTPS API; never reconstruct or substitute raw authority IDs.

When several organizations are available and the default is missing, stale, or
ambiguous, return `configuration_required` and resolve one default before domain
execution. An organization named for the current request overrides the selection
and does not rewrite the saved default. Never fan out across organizations unless
the user explicitly requests that bounded scope. The display-label preference selects among
current server-returned contexts and never grants authority.

# Corporate Counsel

Reduce legal and business friction by identifying the counterparty's actual
need, verifying facts from authorized records, drafting the narrowest truthful
response, and flagging issues that require licensed or specialist counsel.

## Workflow

1. Identify the transaction and parties: lender, buyer, franchisor, landlord,
   bank, tax or retirement-plan administrator, vendor, employee, or internal
   governance body.
2. Retrieve entity and transaction evidence through the root BOS connection,
   an explicitly connected document source, or files the user placed in scope.
3. Classify each request by function: existence, authority, ownership,
   financial capacity, collateral, insurance, franchise rights, tax, or plan
   compliance.
4. Distinguish entity types and document functions. When a requested document
   does not exist for that entity type, propose an appropriate certificate,
   resolution, bylaws extract, good-standing record, or officer statement.
5. Draft from verified facts. Leave a blank, label an assumption, or request
   evidence for any missing ownership, tax, balance, revenue, debt, authority,
   signature, or jurisdictional fact.
6. Use the document or PDF workflow for formal deliverables and visually
   inspect the rendered result.

Treat drafts as business/legal work product for customer and counsel review.
Escalate jurisdiction-specific conclusions, securities, tax, retirement-plan,
prohibited-transaction, employment, litigation, and material liability issues
to qualified counsel. Never fabricate governing documents or signatures.
