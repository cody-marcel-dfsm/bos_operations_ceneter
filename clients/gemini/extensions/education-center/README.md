# Education Operation Center for Gemini

Education Operation Center helps directors and adult staff at education centers coordinate instructor scheduling, family scheduling, and class scheduling; handle partner relationship interactions and invoicing; and access enrollment information and statuses through BOS. It brings focused education expertise to your AI workspace while BOS owns execution authority, business state, and permissions. Service infrastructure, authoritative data stores, and private implementation IP remain outside the agent host; authorized inputs and results, public skills, and permitted scoped caches can reach the agent. Trial reconciliation, camp capacity planning, reviewed family communications, and invoice exceptions are supporting workflow examples. In a synthetic example, Example Learning Center could reconcile example.test partnership invoices against payment records in its configured accounting system and prepare a source-linked exception ledger. Its skills can contribute domain goals and constraints to an ad hoc dynamic workflow; composition and control are owned by BOS when the required authoring and runtime contracts are available. The plugin requires BOS and its authenticated connection; deterministic workflow execution follows discovered HTTPS contracts, preserving human judgment, approvals, roles, provider boundaries, and source evidence. Available operations depend on authorized discovery, configuration, and provider readiness. Request an invite at https://dfsm.ai/apps/bos/#request-invite.

This one Gemini extension supports Gemini CLI and Google Antigravity 2.0 Desktop.
Both surfaces load the same packaged skills and fixed BOS product identity.

## Gemini CLI

Install this extension from a terminal with `gemini extensions install clients/gemini/extensions/education-center`.
Gemini CLI copies the extension into its managed extension directory.
Install BOS first. This product uses the BOS connection and its native authentication action.
Install required independent product `my-crm` from its own distribution before using dependent workflows.

For a bounded recovery, run `npm run clean-install:gemini -- --confirmation
"DELETE ALL BOS GEMINI EXTENSION STATE"`. Restart Gemini CLI after installation
or update. Run `npm run install:verify:gemini-runtime`, `/extensions list`, and
confirm the extension is enabled and `/skills list` to confirm its skills are
discoverable. Use `gemini extensions update education-center` for later releases.

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
Confirm the BOS connection is authenticated, then enable this plugin and its skills.
