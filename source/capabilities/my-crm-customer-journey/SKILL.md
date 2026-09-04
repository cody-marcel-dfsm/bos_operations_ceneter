---
name: my-crm-customer-journey
description: Discover and show an authorized Lead Director customer's exact installed sales graph, current lead node, transition history, reachable goals, paths, gates, blockers, and available next steps. Use for sales-flow, enrollment-progress, lifecycle, graph-position, and journey-path questions.
---

# My CRM Customer Journey

Use `bos-app-discovery` for routing, app MCP discovery, contract validation, and
deterministic HTTPS invocation. Read [the Lead Director journey
contract](references/journey-graph-contract.md) before discovery or rendering.

This workflow ships with the active BOS foundation and is usable independently
of the My CRM product. A request for one person's journey status or progress
toward a goal selects this workflow even when the user does not say “graph.”

Start with `bos-mcp-client` live discovery and `bos_get_context` on the original
request. Resolve deferred tools through the host's discovery facility before
reporting them missing. Resume this workflow automatically after recovery.

## Discover and resolve

1. Use the selected default or explicit organization to query the authenticated
   BOS app directory. Select Lead Director only from a current returned app
   descriptor whose description or capabilities satisfy the request. Preserve
   its opaque context, contact, contract version, and discovery epoch.
2. Query the exact returned Lead Director MCP contact. Discover the current app
   description, installed graph, canonical goal semantics, lead and journey
   services, installed plugins, external-evidence ownership, and
   machine-readable API contracts. Use returned operation names and endpoints;
   never embed a Lead Director URL or assume literal MCP tool names.
3. Call the discovered lead-search API to resolve exactly one lead. Ask for one
   disambiguating value when several authorized records remain.
4. Call the discovered lead-journey API for the current graph node, exact
   transition history, pending gates, available actions, observation time, and
   provenance.
5. Call the discovered path-planning API with read-only `graph.path.plan`
   semantics for
   reachable goal nodes and exact paths from the observed current node. Obtain
   canonical goal classes from the discovered operation with
   `graph.goals.list` semantics. Keep path planning separate from transition
   execution.
6. When external evidence is necessary, inspect the discovered service owner.
   Use a Lead Director plugin/service API when it is nested under Lead Director.
   Query another app MCP independently only when the BOS app directory identifies
   that service as a separately installed application.

Use discovered deterministic HTTPS APIs for every business read. Carry the
short-lived audience-bound authentication and opaque app context through the
host credential boundary. Supply only contract-declared arguments and reject
stale versions, cross-context state, malformed contracts, and typed denials.

When the host cannot query the returned app MCP or invoke its authenticated
HTTPS API, return `host_capability_unavailable`, name the missing host
capability, and preserve the request. Use no browser automation, DOM inspection,
cached selector, raw authority identifier, hardcoded endpoint, BOS-side domain
routing, or central compatibility alias for this journey workflow.

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

When authorized reads have already verified a record's current state but full
graph topology or path results are unavailable, render a **Partial journey —
verified milestones only** diagram on the first response. This presentation
uses evidence already obtained through an authorized workflow; it grants no
alternate endpoint, compatibility alias, or authentication bypass. Preserve
any typed discovery or provider failure and state which graph evidence is
missing. With no verified current state, report the failure without a fabricated
journey.

Show the verified current state and the user's requested goal as distinct nodes.
Label the goal **Requested goal — attainment unverified** unless verified.
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

Place the person's verified current node and the requested goal prominently
in the same diagram. Emphasize the app-returned route between them and show
relevant branches and gates. Completed history requires observed transition
evidence; future or eligible steps remain distinct from completed steps.
If the goal is unreachable, show that goal and the app-returned blocker without
drawing an invented connecting edge. If goal resolution is ambiguous, ask for
the intended goal rather than choosing one silently.

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
