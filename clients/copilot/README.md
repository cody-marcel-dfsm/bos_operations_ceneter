# BOS Operations Center Copilot Packages

Select a product under `products/<product>/skills` and install those
skills into the target repository's `.agents/skills` directory. Install the BOS
product once for the shared `.github/mcp.json` connection. Subservice products
add workflows through that connection and include no additional MCP registration.
Run `npm run install:verify:copilot-runtime -- --target <repository> --product <product>`
to compare the repository files directly with the selected generated package.
