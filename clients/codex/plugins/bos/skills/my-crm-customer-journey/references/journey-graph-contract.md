# Lead Director customer journey client contract

## Ownership and discovery

The Lead Director application graph owns graph identity, nodes, labels,
transitions, gates, goal semantics, path reachability, lead position, and
available actions. BOS supplies the authenticated organization and installed-app
directory. GPT selects Lead Director, queries its returned app MCP contact,
invokes discovered deterministic HTTPS APIs, reconciles evidence, and renders
the answer.

The Lead Director MCP exposes semantic equivalents of app and graph description,
service and plugin catalogs, API contracts, `graph.goals.list`, and
`graph.path.plan`. Literal MCP and API operation names, URIs, endpoints, schemas,
and versions come from current discovery.

## Discovered graph contract

The graph description provides graph ID, schema version, content digest,
discovery epoch, node types and identities, exact labels and descriptions,
terminal state, directed transitions and labels, gate conditions and required
evidence, available actions and side-effect classes, plugin dependencies,
provider readiness, entry points, exits, and observation/version metadata.

Goal metadata uses one app-owned canonical schema with positive, negative,
neutral, and non-terminal classifications. Conflicting legacy variants such as
`is_goal`, `is_positive_goal`, and `is_negative_goal` produce a typed
graph-configuration error until the app normalizes them.

## Discovered API sequence

The client resolves current contracts for three independent read operations:

1. lead search returns one authorized lead selector and provenance;
2. lead journey returns `current_node_id`, optional `desired_goal_node_id`,
   transition history, pending gates,
   available actions or `recommended_next_actions[]`, observation time,
   freshness, and source service; and
3. read-only path planning returns reachable goal nodes, exact node and edge
   paths, blocked gates, required evidence, available next steps, path length,
   and target goal from the observed current node.

The client validates graph digest/version consistency across these reads.
Unknown node references, duplicate node IDs, edges outside the discovered node
set, conflicting goal metadata, or a journey node absent from the graph return a
typed invalid-graph or stale-contract result. The client renders no inferred
replacement topology. Independent verified record facts may still support the
explicitly labeled partial-evidence diagram defined in the skill.

## Evidence composition

Keep four evidence classes separate:

- graph facts from Lead Director graph discovery;
- lead facts from Lead Director lead and journey APIs;
- external evidence from its independently identified owning app or nested
  Lead Director service; and
- GPT inference derived from cited observed facts.

Every fact carries source application, service, contract or graph version,
observation time, freshness when available, and sanitized correlation evidence.
Partial and conflicting evidence remains explicit.

A future event with absent outcome or enrollment evidence is pending as of the
evidence timestamp. It does not prove a terminal negative result. Path labels
and transitions match the installed graph exactly.

## Native presentation

Render a Mermaid flowchart directly in the conversation and provide an immediate
plain-text path fallback. The graph identifies the current node, transition
history, reachable goals, exact paths, gates, blockers, and available next
steps. Pair every color with text or shape and exclude contact details, provider
record IDs, private notes, and raw authority values.

## Failure behavior

- Ambiguous lead resolution stops before journey and path calls.
- Missing app contact, stale discovery, invalid API contract, audience mismatch,
  cross-context reuse, authorization denial, provider recovery, and unavailable
  host capabilities retain their typed failures.
- An unreachable goal is an app-owned path result.
- A graph or API version change triggers BOS and Lead Director discovery refresh
  before one bounded re-resolution.
- Read-only planning never invokes a transition.
