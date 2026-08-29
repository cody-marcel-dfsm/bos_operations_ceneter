# Marketplace submission assets

Current BOS marketplace package release: `0.4.51`.

## BOS connection submission

The BOS marketplace plugin is the sole connection-owning package.

| Field | Value |
|---|---|
| Product | BOS — Business Operating System |
| MCP resource | `https://dfsm.ai/mcp/apps/bos/platform` |
| Authentication | Host-managed OAuth 2.1 |
| Connection action | Connect once to BOS |
| Tool scope | Server-evaluated for each authenticated request |

The BOS submission includes the registered app or host-native connector metadata
required by the target marketplace. It contains no API key, bearer token,
authorization header template, customer authority identifier, or provider
credential.

## Subservice submissions

Education Center, CRM, Marketing Director, and other BOS-maintained subservice
plugins contain skills, descriptions, icons, privacy and support links, test
prompts, and reviewer instructions. They contain no registered BOS app,
connector, MCP server declaration, OAuth grant, or Connect instruction.

Reviewer tests install BOS plus the subservice, connect BOS once, and verify an
authorized subservice operation through the BOS tool catalog.
