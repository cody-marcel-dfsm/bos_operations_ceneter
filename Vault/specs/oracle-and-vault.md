# BOS Vault and Oracle specification

## Vault

The Vault provides one discoverable home for architecture, constitutional
rules, specifications, decisions, review evidence, and durable operational
knowledge. The checked-in manifest records exact source paths and SHA-256
digests. Search is local and sends no project knowledge to an external service.

## Oracle

The BOS Oracle supports two use cases:

- answer architecture and implementation-pattern questions from current
  canonical evidence;
- review a completed package change for architecture and release compliance.

For guidance, it cites the controlling source and separates known facts from
recommendations. For review, it inspects the actual diff and validation
evidence, reports actionable findings with exact locations, and ends with one
verdict: `APPROVED` or `REJECTED`.

Skill invocation supplies the workflow and context. Independent approval, when
required by an owning application or high-risk deployment, comes from that
repository's reviewer or external approval service.

## Package-specific review gates

- tenant neutrality and explicit authorization scope;
- absence of secrets and customer data;
- native remote MCP authentication, provider recovery, and log redaction;
- product-manifest completeness;
- canonical-source to generated-client parity;
- deterministic build, package validation, and tests;
- preservation of customer-owned extensions;
- version and release-manifest consistency.
