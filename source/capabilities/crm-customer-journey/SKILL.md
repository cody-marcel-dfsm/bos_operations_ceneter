---
name: crm-customer-journey
description: Discover and show an authorized Lead Director record's organization-described graph, current node, transition history, reachable goals, paths, gates, blockers, and available next steps. Use for individual record details, create/update results, duplicate matches, list entries, named-person lookups, email or phone lookups, profiles, status, lifecycle, graph-position, and journey-path questions, including when the user calls the record a lead, contact, customer, student, family, opportunity, or another organization-defined term. This governs the request even when the user names the transport or platform instead of the record — for example "use BOS to find X," "use Lead Director to look up X," or any other phrasing that names the connection rather than the record type. The transport name in the request is never a reason to stop at a raw search or platform tool call instead of this workflow.
---

# CRM Customer Journey

**Trigger check, before any tool call:** if the request names or implies a
Lead Director record — by name, email, phone, or any other identifying detail
— this skill governs the entire response, regardless of which word the user
used for the transport ("BOS", "Lead Director," a bare record search, or no
named tool at all). A record search call is a step inside this workflow, never
a substitute for it. Stopping after a search result without continuing into
graph, goal, and path discovery in the same turn is a workflow violation, not
an acceptable partial answer.

Use `bos-mcp-client` on the single BOS platform connection for routing,
application discovery, contract validation, and deterministic HTTPS invocation.
Read [the Lead Director journey
contract](references/journey-graph-contract.md) before discovery or rendering.

This reusable capability ships in Education Center and uses the BOS connection's
server-authorized application context. Lead Director does not impose a client
entity type. For every request, derive the entity's singular and plural display
terms, declared fields, organization-specific custom values, current node type,
available actions, transitions, and complete UI/rendering instructions from the
current organization Describe and record/graph evidence. Never substitute
`lead`, `contact`, `customer`, a fixed field list, a generic stage model, or a
locally invented renderer when current evidence supplies a different model.

Any individual record detail request selects this workflow, including a single field such as an email
address, phone number, owner, appointment, or status.
The user does not need to say “journey” or “graph.”

A named-person lookup such as “find this lead,” “look up this contact,” or a
lookup by email, phone, or a current record selector is an individual detail
request. Continue this workflow before presenting its result,
even when the lookup uses a search operation. Determine presentation from user
intent, independently of the tool name or response being an array. A successful
single-person lookup must continue into the graph workflow in the same turn.
Broad filtered lists preserve their filters and pagination and display each
returned record in the organization-described detailed format below. Keep ambiguous matches separate;
show only the graph membership verified for each candidate and disambiguate
before any targeted action.

Start with `bos-mcp-client` live discovery and `bos_get_context` on the original
request. Resolve deferred tools through the host's discovery facility before
reporting them missing. Resume this workflow automatically after recovery.
`bos_get_context` alone does not perform graph discovery. Inspect live BOS
discovery for advertised graph and read-operation descriptors under the current
server-authorized context. Use the
BOS connection scoped to the authorized application for current application discovery, then perform record and
graph reads through its exact advertised deterministic HTTPS APIs.
Follow
[connected graph reads](references/connected-graph-read.md) when that contract
is advertised. Read the directory for evidence still missing. Continue
from each successful read; evaluate app-query and API capabilities only when
their steps are reached. An absent journey tool in the initial catalog supplies
no evidence that BOS resource discovery is unavailable.

## Current-host read execution

Use the current authenticated BOS MCP to discover capabilities for the
requested operation. After `bos_get_context` validates the connection and its
current server-authorized context, resolve a live-discovered read operation whose descriptor
covers the requested data, then invoke its exact advertised HTTPS method, path,
schema, and audience through the BOS dependency adapter without client-supplied authority fields.
The adapter owns identity-v2 transport context; this domain
skill never receives or forwards it.
Continue from the API evidence. Select the
supported operation from current discovery; do not construct a route or require
a second connection for the selected application.

All supported operations belong to one current operating contract. Discover
semantic operation identities and argument constraints from current validated
MCP descriptors and their linked API contracts; never invent endpoints or
selectors.
Directory or transport limitations remain scoped to that operation. An
access denial never permits switching routes to evade it. Missing or ambiguous
context, revoked grants, and explicit access denials stop the affected operation.
Every operation retains request-time server authorization.

For journey/detail requests, continue from the record read into graph, goal,
and path discovery through live-described read operations. A current-state-only
record result does not complete this sequence. Use `crm-customer-journey` to
resolve the explicit or application-owned goal and obtain the exact node path.
Only after supported discovery and relevant reads are exhausted or a specific
failure prevents them, render the labeled partial journey with verified state,
known goals, and requested details. Identify the failed or unavailable operation
and unattempted dependent reads. This is an incomplete path result, with no
invented transitions, reachability, actions, or completion.
This rule authorizes no mutations, browser fallback, token extraction, or
hardcoded endpoint. A missing per-app host facility alone must not suppress an
independent successful authorized read or its partial graph presentation.

## Every displayed record uses the organization-described format

Apply this format whenever a response displays a Lead Director record, regardless of which
operation produced it: lookup, list/search page, create, update, duplicate or
already-existing match, operation failure with a verified existing record, or
preview/receipt. The user does not need to request details. A success sentence,
receipt, status badge, contact bullets, or table row alone is incomplete.

For each displayed record, include:

1. The exact organization-described entity label, display/title fields,
   organization, verified current state, and operation outcome.
2. Native node graph from current state through intermediate nodes to canonical
   goals, with the preferred positive-goal route bold and green under the route
   ranking rules below. Follow with the same readable text path and relevant
   conditions/eligibility limits.
3. The fields, custom values, history, and actions that current Describe and
   node UI instructions declare for this organization. Apply returned labels,
   ordering, grouping, visibility, and formatting. Keep missing declared values
   explicit when relevant and never invent details. Keep technical identifiers
   out of both the graph and default details.
4. Source observation time and meaningful freshness/evidence limitations.

After a confirmed create or update, use the result if it supplies complete,
current record evidence; otherwise read the exact resulting record, then obtain
its graph. On a duplicate match, render the verified existing record this way.
Complete the authorized mutation first; graph retrieval is a post-result read,
not a write prerequisite. A failed graph read preserves the verified mutation
outcome and yields a labeled partial detailed view after bounded recovery.
Never repeat a write to obtain display evidence.

For lists, keep the requested filters/order and pagination; render one detailed
view per displayed record. Reuse graph topology only across records with matching
validated context/graph binding, retaining each record's own current state. Use
bounded pages for large results and disclose coverage. Aggregate-only results
that display no individual records need no per-record graph. An explicit user format
request, such as an export or compact list, overrides this display default.

For deletion previews, use current verified details before the required
confirmation. After deletion, label the record Deleted and any retained graph
as last-known/historical with its observation time; do not describe the former
current state as active or invent a deleted graph node. A failed create with no
verified persisted record shows the failure and submitted fields without a
fabricated record state or graph. Display changes grant no mutation authority.

## Rich record view by default

For any individual record detail request, lead with the record's place in the
application-owned graph, then provide the requested fields and organization-described profile
facts below the graph. Include verified current position, completed history,
reachable next states, gates or blockers, pending events, and available next
actions with source freshness. Apply the node's current UI instructions and
keep record fields outside graph nodes.
Read-only detail requests never authorize executing those actions.

When no goal is requested, resolve the record's app-returned desired goal, then
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

Distinguish graph structure, current transition eligibility, and observed record
history. Missing history, an empty available-actions list, or unverified goal
attainment does not invalidate a verified structural path. Draw known graph
edges and label their gates as satisfied, blocked, or unknown from app evidence;
keep future nodes pending. When only topology is available, a route traced along
its exact directed edges must be labeled **Structural path — eligibility
unverified**. Never infer an edge. Select the highlighted route using the
verified app evidence and ranking rules below. Retain relevant alternative paths
and protect against graph cycles.

Resolve record-to-graph membership from current application evidence. Never
infer an entity type or combine ambiguous matches. Ask for disambiguation only when identity or graph membership requires
it. If no graph membership or current node can be verified, show the requested
verified details and the precise missing graph evidence. If current state is
known but topology is partial, use the partial-evidence presentation below.
An explicit user request for a different format takes precedence.

## Adapt the access pattern

Resolve the requested record through the least expensive supported read: exact
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
pagination and keep each record's graph membership and path distinct. The diagram
is presentation of read evidence and never authorizes a CRUD mutation.

## Discover and resolve

1. Inspect the BOS connection resource descriptors under the connection's
   exact scoped grant. A matching connected graph resource can satisfy graph
   and goal discovery directly.
2. For evidence not already supplied by a validated connected resource, use
   the current BOS platform connection. Discover the current app
   description, organization entity shape, installed graph, canonical goal semantics, record and journey
   services, installed plugins, external-evidence ownership, and
   machine-readable API contracts. Use returned operation names and endpoints;
   never embed a Lead Director URL or assume literal MCP tool names.
3. Use the discovered record-search operation when the record is unresolved, or a
   supported exact read for a valid server-issued selector. Ask for one
   disambiguating value when several authorized records remain.
4. Call the discovered record-journey operation for the current graph node, exact
   transition history, pending gates, available actions, observation time, and
   provenance.
5. Obtain canonical goal metadata with discovered `graph.goals.list` semantics
   and apply the goal resolution above. Call the discovered path-planning API
   with read-only `graph.path.plan` semantics for exact paths from the observed
   current node to those goals, including conditional routes and blockers.
   Keep path planning separate from transition execution.
6. When external evidence is necessary, inspect the discovered service owner.
   Use a Lead Director plugin/service API when it is nested under Lead Director.
   Resolve independently installed product services through live BOS discovery;
   never create or select a second product connection.

For the per-app execution path, use discovered deterministic HTTPS APIs. Carry
short-lived audience-bound authentication through the host credential boundary.
Supply only contract-declared business arguments and reject stale versions,
cross-grant state, malformed contracts, and typed denials.

Apply evidence-based failure classification at the actual failed step. Report
completed reads, the observed failure or verified absent
host facility, and later unattempted steps. Preserve server error types and the
pending request; a context-only trace never establishes missing app discovery.
Use no browser automation, DOM inspection,
cached selector, raw authority identifier, or hardcoded endpoint. Use the
Current-host read execution rule for authenticated reads.

## Reconcile the answer

Separate and source-attribute these sections:

1. **Graph facts** — exact installed graph identity/version, nodes, transitions,
   gates, goals, entry/exit state, and graph observation epoch.
2. **Record facts** — organization-described entity label, resolved record,
   declared fields and custom values, current node type and UI instructions,
   transition history, scheduled events, available actions, source service,
   observation time, and freshness.
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

A large or generic full graph is never a reason to drop the diagram and
answer with a text-only transition list instead. When the full installed
graph is too large or generic to render directly, scope the Mermaid diagram
to the current node's relevant neighborhood per the split-diagram rule below
— render that scoped diagram, not prose describing it. A response that
displays journey/path information without an actual ` ```mermaid ` fenced
block fails this workflow's default, regardless of how complete the prose is.

Lead with a Mermaid `flowchart LR` built only from the discovered graph and
record/path API results. Use no local HTML, browser renderer, attachment, or
external visualization service. Keep node labels concise and exclude contact
details, raw record identifiers, private notes, and authority values.

Emit the diagram as its own fenced code block using the exact ` ```mermaid `
opening fence and a closing ` ``` `, with no other content inside that fence.
This exact fence is what the host chat surface recognizes to render the block
as a diagram instead of showing it as literal code text; a bare fence, a
different language tag, or diagram text placed outside a dedicated fenced
block fails to render even when the Mermaid syntax is valid. Send the diagram
as part of the normal conversational turn, never inside a saved document,
Documents-panel view, or other artifact surface that only displays fenced
code verbatim. Node label line breaks use `<br/>`, not a literal `\n`, since
`\n` inside a plain double-quoted Mermaid label renders as literal backslash-n
text rather than a line break.

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

### Highlight the route to the positive goal

Make the preferred current-to-positive-goal route stand out with thick dark-green
arrows (`#15803D`, `stroke-width:4px`) and bold route labels. Use the app's
recommended/optimal path and its declared objective when supplied. Otherwise,
compute the fewest-transition path over the verified directed topology to the
resolved canonical positive goal and label it **Shortest structural path —
eligibility unverified**. This is a presentation ranking, not permission to
execute a transition or evidence that it is the fastest or highest-converting
business route. Preserve known conditions and blockers; never highlight a known
blocked path as actionable. If no feasible path can be verified, label the
highlighted structural candidate's blocking/unknown gates explicitly.

For tied shortest paths, highlight the tied routes and identify the tie; never
invent a preference. With multiple unresolved positive goals, keep labeled goal
alternatives and rank paths separately. An explicitly requested non-positive
goal keeps the user's requested emphasis. If no positive goal/path exists, show
the supported graph and explain the missing route without fabricating one.

Style every edge of the selected route, every intermediate route node, and its
positive goal consistently. Use pale-green fill `#DCFCE7`, dark text `#14532D`,
green border and `font-weight:bold` for pending route nodes and the positive
goal. Preserve the current node's navy fill/white text and add a thick green
border plus bold text. Retain completed/blocked status styling and its explicit
labels when it conflicts with route fill. Keep alternative edges thin gray and
negative goals visually secondary. Include a compact legend for the green route;
green indicates route emphasis, never completion or eligibility.

For Mermaid, declare each edge separately and use zero-based `linkStyle` indices
for exactly the highlighted edges in final declaration order, for example
`linkStyle 0,2 stroke:#15803D,stroke-width:4px,color:#14532D,font-weight:bold`.
Apply matching node `style`/`classDef` declarations; styling only the destination
node or bolding the prose does not highlight a path. Preserve conditional dashed
edges even when they belong to the highlighted route. Recompute link indices
after any edge insertion/reordering and check that no unrelated edge is green.
Bold the same preferred route in the immediate text-path fallback.

Apply direct text labels plus these high-contrast status styles:

- completed: teal fill `#007A5E`, white text, label `✓ Completed`;
- current: navy fill `#005A9C`, white text, thick border, label `● Current`;
- reachable next: dark gold fill `#9A6700`, white text, label `→ Next`;
- blocked: vermillion fill `#C43B00`, white text, label `! Blocked`;
- later or alternate: light-gray fill `#E5E7EB`, charcoal text, label `Later`;
- goal outside the highlighted route: purple border `#6F42C1` plus its canonical positive, negative, neutral,
  or non-terminal goal class.

Annotate the current node, completed transition history, every reachable goal
path, eligible next edges, gates, blockers, and available next steps on the
graph itself. The graph itself must identify the current position, next states,
blockers, and desired goal when one was requested. Immediately follow with the
same exact route as a plain-text path for a host that does not render Mermaid.

Below the graph, give concise source/version/freshness details and the four
evidence sections. Never execute a transition from this read-only workflow.

## Final response check

Before sending any response that displays a Lead Director record, verify that each record view
contains the detailed format above, including the Mermaid graph and profile details. Known topology
requires the exact current-to-goal route. If a specific discovery/read failure
prevents that route, include the partial-evidence graph of the verified current
state and a precise limitation. A successful record read plus unavailable
topology never justifies omitting the graph. With no verified current state,
state the missing evidence without inventing a node. An explicit user format
instruction retains precedence. A tool result, commentary promise, status bullet,
or plain-text path alone does not satisfy the default graph presentation.
