# BOS Operations Center Copilot Packages

BOS is a service gateway for controlled AI workflow execution, with service authority,
business state, and private implementation IP outside the agent host. Education Operation
Center adds scheduling, partner interactions, invoicing, and enrollment expertise through BOS.
Access is invite-only: [Request an invite](https://dfsm.ai/apps/bos/#request-invite).

Select a product under `products/<product>/skills` and install those
skills into the target repository's `.agents/skills` directory. Install the BOS
product once for the shared `.github/mcp.json` connection. Subservice products
add workflows through that connection and include no additional MCP registration.
Run `npm run install:verify:copilot-runtime -- --target <repository> --product <product>`
to compare the repository files directly with the selected generated package.
