# Portal and production readiness

Observed: 2026-08-23

## Read-only portal evidence

- The OpenAI Platform plugin portal loads while signed into the Infinite State
  Machines organization.
- The portal displays **Create plugin**, which is consistent with draft-create
  access.
- The organization general-settings view returned an `organization.read`
  permission error, so business-verification status could not be confirmed from
  that page.
- No Education Operation Center marketplace draft was created.

## Production endpoint evidence

- Public URL:
  `https://dfsm.ai/mcp/apps/leaddirector/education-center`
- An unauthenticated MCP initialize request returns `401` and advertises
  protected-resource metadata.
- The protected-resource metadata identifies the exact production MCP resource,
  the `https://dfsm.ai` authorization server, `mcp:tools`, and
  `offline_access`.
- The authorization server advertises authorization, token, dynamic client
  registration, revocation, authorization-code, refresh-token, and PKCE S256
  support.
- An authenticated BOS context call has succeeded for the current owner
  connection, confirming the route and OAuth foundation are operational.

## Remaining portal-time checks

- Select and confirm the verified Infinite State Machines LLC identity.
- Confirm Apps Management Write on the exact submitting role.
- Capture the domain challenge generated for this submission and deploy only
  that exact token at the portal-approved challenge origin.
- Run Scan Tools after the annotation remediation is deployed.
- Confirm no MCP UI is discovered. If a UI is discovered, declare its exact
  content-security-policy domains.
- Test the dedicated reviewer credential from a clean browser session.
- Record the draft ID, exact commit, scan output, and review result after a draft
  is intentionally created.

## Public URL status

The company homepage is live. The current BOS privacy page does not cover the
full plugin/MCP data flow. Existing Lead Director privacy and terms pages contain
template language and product-specific identities that do not match this
submission. Stable, approved Education Operation Center website, privacy,
terms, and support URLs remain a publication gate.
