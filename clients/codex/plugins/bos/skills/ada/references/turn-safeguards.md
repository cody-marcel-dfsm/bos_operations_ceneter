# Local turn safeguards

`scripts/turn-safeguards.mjs` exports pure helpers for a host that can run Node.
Import it from the installed skill directory. No helper stores customer data,
calls a service, determines authorization, interprets arbitrary user text, or
changes progress. The receiving agent reasons about user intent using the skill.

Map only current authorized service output into the local projection. This
projection is a client-owned in-memory interface, with no implied wire schema:

- `scope`: opaque current participation identity; `revision`: its revision.
- `actions`: current action projections, each with `ref`, `itemRef`,
  `itemRevision`, `statement`, `targets` and optional `configurationRevision`.
  Include the complete exact confirmation content in `statement`, preserving
  all target references. Do not use an action whose producer contract cannot
  supply exact content/revision binding.
- For presentation only: `work` rows contain `ref`, service-reported `status`,
  `party` (`ada`, `customer`, `service`, `external`) and safe `summary`;
  `milestones` rows contain `ref`, `status`, and optional `receiptRef`.

Call `presentConfirmation(snapshot, actionRef)` for a local presentation object.
Show its exact statement, targets and consequences. Keep that returned object
only in permitted current-conversation memory. `resolveConfirmation` receives
the fresh snapshot, current pending presentations, an explicit host-reasoned
decision (`confirm`, `decline`, `revoke`) and an attributable reply anchor
`{presentationId, scope}`. Missing anchors return `clarify`; mismatched context,
stale revision, changed content or action return `refresh`. An `eligible` result
only identifies the current action for the normal discovered decision flow.
It is neither customer proof nor permission; preserve the actual user instruction
and apply all server confirmation, expiry and authorization rules independently.

`projectProgress(snapshot, {hostCapabilities, nextAction})` returns actual work
and milestone statuses, one caller-selected next action and an explicit
observation mode. A passed capability report describes actual adapter support;
it confers no permission and starts no monitoring. `nextAction` must select a
current returned action. This helper never synthesizes a completion, receipt,
provider outcome or next action. Render its safe data naturally for the channel.
