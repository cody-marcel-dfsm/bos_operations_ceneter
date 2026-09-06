---
name: my-crm-customer-journey
description: Discover and show an authorized Lead Director customer's exact installed sales graph, current lead node, transition history, reachable goals, paths, gates, blockers, and available next steps. Use for any lead or contact detail request, including named-person find/look-up requests, email or phone lookups, a single field, profile, status, sales-flow, enrollment-progress, lifecycle, graph-position, and journey-path question.
---


## Organization scope preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context`. Select exactly one authorized
organization in this order: an organization explicitly named in the current request;
the shared `default_organization_label` after exact normalized validation against
the returned organization labels; or the sole authorized organization. Read and
validate the saved label with
`../bos-mcp-client/scripts/client-preferences.mjs`. For tools whose live schema
requires a context selector, pass only the selected role's opaque `context_id`.
Never add organization or context arguments to an operation whose schema derives
scope from the authenticated server context.
Use this same selection for BOS installed-app discovery. Pass only the opaque app
context and API authority returned under that selection to a discovered app MCP
or deterministic HTTPS API; never reconstruct or substitute raw authority IDs.

When several organizations are available and the default is missing, stale, or
ambiguous, return `configuration_required` and resolve one default before domain
execution. An organization named for the current request overrides the selection
and does not rewrite the saved default. Never fan out across organizations unless
the user explicitly requests that bounded scope. The display-label preference selects among
current server-returned contexts and never grants authority.

# My CRM Customer Journey

Use `bos-app-discovery` for routing, app MCP discovery, contract validation, and
deterministic HTTPS invocation. Read [the Lead Director journey
contract](references/journey-graph-contract.md) before discovery or rendering.

This workflow ships with the active BOS foundation and is usable independently
of the My CRM product. Any lead or contact detail request selects this workflow, including a single
field such as an email address, phone number, owner, appointment, or status.
The user does not need to say “journey” or “graph.”

A named-person lookup such as “find this lead,” “look up this contact,” or a
lookup by email, phone, or a current record selector is an individual detail
request. Continue this workflow before presenting its result,
even when the lookup uses a search operation. Determine presentation from user
intent, independently of the tool name or response being an array. A successful
single-person lookup must continue into the graph workflow in the same turn.
Broad filtered lists retain list scope even when they happen to return one row;
ambiguous person matches require disambiguation before selecting a graph.

Start with `bos-mcp-client` live discovery and `bos_get_context` on the original
request. Resolve deferred tools through the host's discovery facility before
reporting them missing. Resume this workflow automatically after recovery.
`bos_get_context` alone does not perform app discovery. Execute the
`bos-app-discovery` resource discovery procedure on the existing authenticated
BOS connection. Inspect listed connected graph resources for the selected
context before requiring a separate app directory/contact. Follow
[connected graph reads](references/connected-graph-read.md) when that contract
is advertised. Read the directory for evidence still missing. Continue
from each successful read; evaluate app-query and API capabilities only when
their steps are reached. An absent journey tool in the initial catalog supplies
no evidence that BOS resource discovery is unavailable.

## Current-host read execution

Use the current authenticated BOS capabilities for the requested operation.
After selecting the organization and role through `bos_get_context`, resolve a
live-discovered read operation whose descriptor covers the requested data.
Invoke its exact schema with the selected opaque context and continue from the
returned evidence. For an advertised app MCP or API, use its contract when the
host can execute it with the required authentication. Select the supported
operation from current evidence; do not impose a preferred future transport or
require a second connection for an already callable authorized BOS operation.

All supported operations belong to one current operating contract. Discover
names and arguments from the live catalog; never invent endpoints or selectors.
Directory or transport limitations remain scoped to that operation. An
access denial never permits switching routes to evade it. Missing or ambiguous
context, revoked grants, and explicit access denials stop the affected operation.
Every operation retains request-time server authorization.

For journey/detail requests, continue from the record read into graph, goal,
and path discovery through live-described read operations. A current-state-only
record result does not complete this sequence. Use `my-crm-customer-journey` to
resolve the explicit or application-owned goal and obtain the exact node path.
Only after supported discovery and relevant reads are exhausted or a specific
failure prevents them, render the labeled partial journey with verified state,
known goals, and requested details. Identify the failed or unavailable operation
and unattempted dependent reads. This is an incomplete path result, with no
invented transitions, reachability, actions, or completion.
This rule authorizes no mutations, browser fallback, token extraction, or
hardcoded endpoint. A missing per-app host facility alone must not suppress an
independent successful authorized read or its partial graph presentation.

## Rich record view by default

For any lead or contact detail request, lead with the person's place in the
application-owned graph, then provide the requested fields and relevant profile
facts below the graph. Include verified current position, completed history,
reachable next states, gates or blockers, pending events, and available next
actions with source freshness. Keep contact information outside graph nodes.
Read-only detail requests never authorize executing those actions.

When no goal is requested, resolve the lead's app-returned desired goal, then
an app-declared default goal, then the sole applicable goal from canonical goal
metadata. These are application-owned selections. If several goals remain,
show their exact paths as labeled alternatives without selecting one for the
user. Ask only when a required path input cannot be resolved from the contract.
Never assume enrollment or a positive goal from sales conventions. When the
user supplies a goal, resolve it against the installed Graph and emphasize its
exact path or blocker. An ambiguous explicit goal requires disambiguation.

For both ordinary details and explicit journey requests, show the ordered path
from the current node through every intermediate node to the resolved goal.
Obtain goal metadata before path planning and use only contract-supported inputs.
A current node plus a goal placeholder does not satisfy the path requirement.

Distinguish graph structure, current transition eligibility, and observed lead
history. Missing history, an empty available-actions list, or unverified goal
attainment does not invalidate a verified structural path. Draw known graph
edges and label their gates as satisfied, blocked, or unknown from app evidence;
keep future nodes pending. When only topology is available, a route traced along
its exact directed edges must be labeled **Structural path — eligibility
unverified**. Never infer an edge or choose a shortest or preferred route without
app evidence. Retain relevant alternative paths and protect against graph cycles.

Resolve a contact-to-lead or contact-to-graph relationship from current
application evidence. Never assume every contact is a lead or combine ambiguous
matches. Ask for disambiguation only when identity or graph membership requires
it. If no graph membership or current node can be verified, show the requested
verified details and the precise missing graph evidence. If current state is
known but topology is partial, use the partial-evidence presentation below.
An explicit user request for a different format takes precedence.

## Adapt the access pattern

Resolve the requested lead through the least expensive supported read: exact
server-issued selector, name or contact-field search, scoped filter, or a
record selected from a previous current-context result. Reuse verified identity
and graph evidence when its context and version remain valid. Search is needed
only when identity is unresolved; ambiguity stops the affected record.

The sequence below describes evidence dependencies. A single discovered read
may supply record, graph, goal, and path evidence together; do not repeat reads
already satisfied by valid evidence. Use additional supported operations only
for missing evidence. Keep broad list/search requests scoped to their requested
list. A named-person find or lookup is an individual detail request and includes
the goal path even when a search operation resolves the person.
For several requested detail records, use supported batch reads or bounded
pagination and keep each lead's graph membership and path distinct. The diagram
is presentation of read evidence and never authorizes a CRUD mutation.

## Discover and resolve

1. Inspect current BOS resource descriptors using the selected organization
   and role context. A matching connected graph resource can satisfy graph and
   goal discovery directly. For unresolved evidence, query the authenticated
   BOS app directory. Select Lead Director only from a current returned app
   descriptor whose description or capabilities satisfy the request. Preserve
   its opaque context, contact, contract version, and discovery epoch.
2. For evidence not already supplied by a validated connected resource, query
   the exact returned Lead Director MCP contact. Discover the current app
   description, installed graph, canonical goal semantics, lead and journey
   services, installed plugins, external-evidence ownership, and
   machine-readable API contracts. Use returned operation names and endpoints;
   never embed a Lead Director URL or assume literal MCP tool names.
3. Use the discovered lead-search API when the lead is unresolved, or a
   supported exact read for a valid server-issued selector. Ask for one
   disambiguating value when several authorized records remain.
4. Call the discovered lead-journey API for the current graph node, exact
   transition history, pending gates, available actions, observation time, and
   provenance.
5. Obtain canonical goal metadata with discovered `graph.goals.list` semantics
   and apply the goal resolution above. Call the discovered path-planning API
   with read-only `graph.path.plan` semantics for exact paths from the observed
   current node to those goals, including conditional routes and blockers.
   Keep path planning separate from transition execution.
6. When external evidence is necessary, inspect the discovered service owner.
   Use a Lead Director plugin/service API when it is nested under Lead Director.
   Query another app MCP independently only when the BOS app directory identifies
   that service as a separately installed application.

For the per-app execution path, use discovered deterministic HTTPS APIs. Carry the
short-lived audience-bound authentication and opaque app context through the
host credential boundary. Supply only contract-declared arguments and reject
stale versions, cross-context state, malformed contracts, and typed denials.

Apply `bos-app-discovery` evidence-based failure classification at the actual
failed step. Report completed reads, the observed failure or verified absent
host facility, and later unattempted steps. Preserve server error types and the
pending request; a context-only trace never establishes missing app discovery.
Use no browser automation, DOM inspection,
cached selector, raw authority identifier, or hardcoded endpoint. Use the
Current-host read execution rule for authenticated reads.

## Reconcile the answer

Separate and source-attribute these sections:

1. **Graph facts** — exact installed graph identity/version, nodes, transitions,
   gates, goals, entry/exit state, and graph observation epoch.
2. **Lead facts** — resolved lead, current node, transition history, scheduled
   events, available actions, source service, observation time, and freshness.
3. **External evidence** — independently observed enrollment, roster, billing,
   calendar, or provider facts with owning app/service, observation time, and
   freshness.
4. **GPT inference** — conclusions derived from the preceding facts, labeled as
   inference with missing or conflicting evidence stated explicitly.

Use exact graph labels and transitions. A future event with no observed outcome
evidence remains pending and never becomes a terminal negative result. Report
blocked and conditional edges with their app-returned gate conditions and
required evidence. Never invent a generic stage or infer a transition from list
order, prior screenshots, or sales conventions.

## Partial evidence presentation

After the discovery and read sequence has failed to obtain either a verified
structural route or a path result, and authorized reads have verified the
record's current state, render a **Partial journey —
verified milestones only** diagram on the first response. This presentation
uses evidence already obtained through an authorized workflow; it grants no
alternate endpoint or authentication bypass. The Current-host read execution
rule governs authorized reads. Preserve
any typed discovery or provider failure and state which graph evidence is
missing. With no verified current state, report the failure without a fabricated
journey.

Show the verified current state. When the user requests a goal, show it as a
distinct node. Include any verified application-owned goals even when none was
requested; omit a goal placeholder only when no goal can be resolved.
Label an explicit goal **Requested goal — attainment unverified** and an
application-selected goal **Graph goal — attainment unverified** unless attainment
is verified.
Place confirmed dated milestones in their observed chronology; label timeline
links **Recorded chronology**, never as completed graph transitions. Use a
non-directional dotted connector labeled **Progression unverified** between
current state and goal when no path is known. Include a legend that this link
indicates missing evidence and establishes no reachability or eligible next
step. Add no inferred intermediate stages or percentage complete. Keep future
events pending. Put this visual before record details, with source freshness
and limitations immediately below it. Do not wait for the user to ask for a
visual or retry. An optional provider check failing does not erase independent
verified record evidence.

## Render the native graph

Lead with a Mermaid `flowchart LR` built only from the discovered graph and
lead/path API results. Use no local HTML, browser renderer, attachment, or
external visualization service. Keep node labels concise and exclude contact
details, raw record identifiers, private notes, and authority values.

Place the person's verified current node and the resolved goal prominently
in the same diagram. Include every intermediate node on the verified route and show
relevant branches and gates. Completed history requires observed transition
evidence; future or eligible steps remain distinct from completed steps.
If the goal is unreachable, show that goal and the app-returned blocker without
drawing an invented connecting edge. Disambiguate an explicit goal when needed;
for multiple application goals, show the labeled alternatives described above.

Compose a clear visual hierarchy: place verified completed history before the
current node, the remaining exact path across the center, and the goal at the
right. Each state is its own graph node. Keep the primary route visually
prominent, arrange alternatives as secondary branches, and label transitions
with concise app-owned action or gate text. Retain exact state labels; use short
line breaks for status annotations. Keep dates, long evidence, and contact
fields in the supporting details instead of crowding nodes. Use compact legends
and enough whitespace for the route to read at a glance. For wide or branching
graphs, split into labeled goal-path diagrams sharing the same current node;
retain every intermediate state and relevant gate. Use plain Mermaid syntax
supported by the host and an immediate readable text path.

A known structural transition is drawn even when eligibility is unknown; label
it accordingly. Use dashed edges for conditional or blocked transitions only
when those edges exist in the Graph. An unknown connection remains the explicit
partial-evidence connector. Visual styling must never imply that a pending
transition has happened. Do not classify a known later node as completed from
its position in the diagram.

Apply direct text labels plus these high-contrast status styles:

- completed: teal fill `#007A5E`, white text, label `✓ Completed`;
- current: navy fill `#005A9C`, white text, thick border, label `● Current`;
- reachable next: dark gold fill `#9A6700`, white text, label `→ Next`;
- blocked: vermillion fill `#C43B00`, white text, label `! Blocked`;
- later or alternate: light-gray fill `#E5E7EB`, charcoal text, label `Later`;
- goal: purple border `#6F42C1` plus its canonical positive, negative, neutral,
  or non-terminal goal class.

Annotate the current node, completed transition history, every reachable goal
path, eligible next edges, gates, blockers, and available next steps on the
graph itself. The graph itself must identify the current position, next states,
blockers, and desired goal when one was requested. Immediately follow with the
same exact route as a plain-text path for a host that does not render Mermaid.

Below the graph, give concise source/version/freshness details and the four
evidence sections. Never execute a transition from this read-only workflow.

## Final response check

Before sending an individual lead result, verify that the response itself
contains the Mermaid graph followed by the requested details. Known topology
requires the exact current-to-goal route. If a specific discovery/read failure
prevents that route, include the partial-evidence graph of the verified current
state and a precise limitation. A successful record read plus unavailable
topology never justifies omitting the graph. With no verified current state,
state the missing evidence without inventing a node. An explicit user format
instruction retains precedence. A tool result, commentary promise, status bullet,
or plain-text path alone does not satisfy the default graph presentation.
