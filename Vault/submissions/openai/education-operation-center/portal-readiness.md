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

## BOS dependency evidence

- Education Operation Center contains no endpoint or authentication binding.
- The BOS plugin owns `https://dfsm.ai/mcp/apps/bos/platform` and the OAuth
  connection used by all subservices.
- Portal validation must confirm that Education Operation Center presents no
  separate Connect action and operates after one BOS sign-in.

## Remaining portal-time checks

- Select and confirm the verified Infinite State Machines LLC identity.
- Confirm Apps Management Write on the exact submitting role.
- Capture the domain challenge generated for this submission and deploy only
  that exact token at the portal-approved challenge origin.
- Validate the Education Operation Center skills against the BOS tool catalog.
- Test the dedicated reviewer credential from a clean browser session.
- Record the draft ID, exact commit, scan output, and review result after a draft
  is intentionally created.

## Public URL status

The company homepage is live. Stable, approved Education Operation Center
website, privacy, terms, and support URLs remain a publication gate.
