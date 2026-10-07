# BOS Platform for Gemini

BOS is a service gateway: give AI agents controlled execution of complex business workflows through permissioned state machines, with your roles, rules, and approval gates. Your service infrastructure, authoritative business state and data stores, and private implementation IP stay outside the agent host. Authorized inputs and results, public skills, and permitted scoped caches can reach the agent. BOS Operations Center helps your AI workspace understand the objective, discover supported services, and present evidence; BOS retains execution authority, state, transitions, and recovery. When the required authoring and runtime contracts are available, the client can author an ad hoc dynamic workflow. BOS is the required foundation for dependent products and owns the authenticated BOS platform MCP connection. MCP discovers authorized contracts; deterministic HTTPS APIs execute the sanctioned work, with server-authorized organization, application, installation, and role selection per operation and server-enforced scope, evidence, and approvals. Availability depends on authorized discovery, configuration, and provider readiness. Access is invite-only: request an invite at https://dfsm.ai/apps/bos/#request-invite.

This one Gemini extension supports Gemini CLI and Google Antigravity 2.0 Desktop.
Both surfaces load the same packaged skills and fixed BOS product identity.

## Gemini CLI

Install this extension from a terminal with `gemini extensions install clients/gemini/extensions/bos`.
Gemini CLI copies the extension into its managed extension directory.
Run `/mcp auth BOS-Platform` and complete BOS sign-in in the browser.
Gemini CLI discovers BOS OAuth, stores and refreshes the resource-scoped grant,
and connects to the fixed HTTPS MCP route declared by this extension.

This package owns its scoped MCP connection at `https://dfsm.ai/mcp/apps/bos/platform`.

For a bounded recovery, run `npm run clean-install:gemini -- --confirmation
"DELETE ALL BOS GEMINI EXTENSION STATE"`. Restart Gemini CLI after installation
or update. Run `npm run install:verify:gemini-runtime`, `/extensions list`, and
confirm the extension is enabled and `/skills list` to confirm its skills are
discoverable. Use `gemini extensions update bos` for later releases.

## Antigravity 2.0 Desktop

Run `./scripts/clean-install-antigravity.sh` once from the synced BOS Operations Center
repository. This is an intentionally destructive clean install: it deletes prior BOS
Operations Center product entries, including local customizations, without backups,
while preserving independently distributed required products,
then links every generated Gemini product into `~/.gemini/config/plugins/`.
It resolves the repository from the installer's own location, independent of the
current working directory. Before changing files, it displays the deletion warning and
requires `DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS` as typed confirmation.
After each Git pull, restart Antigravity and run `npm run install:verify:antigravity-runtime`.
Open Settings > Customizations, find the `BOS-Platform` MCP server,
select Authenticate, complete BOS sign-in in the browser, and return to Antigravity.
The desktop host stores and refreshes the resource-scoped OAuth grant.
