# Lead and contact journey display

For a CRM lead/contact detail request, including “find this lead,” a lookup in
Lead Director or “LD,” a named-person search, or a single requested field,
continue into the installed domain-owned customer-journey workflow before the
final response. Determine this from the user's intent; a search operation or
an array response still resolves an individual detail request. Preserve that
intent after clarification or a workspace selection and complete the graph
read and presentation in the same turn as the successful lookup.

Use the installed My CRM `my-crm-customer-journey` skill when My CRM owns the
requested CRM workflow. The domain product owns identity matching, graph
interpretation, goals, paths and provenance; BOS owns routing and visualization.
If the required domain skill is unavailable, identify that dependency and keep
verified requested fields visible. Installation creates no additional access.

Lead with a compact native graph or Mermaid diagram showing one path from the
verified current node to the explicit or application-resolved positive goal,
including every intermediate state and edge on that path. Use the domain's
app-ranked route when supplied; otherwise choose a shortest verified structural
path by transition count. Label that structural path eligibility unverified,
and disclose ties briefly below it. An explicit shortest-path request selects
the fewest verified transitions and retains any app-ranking difference as a
short note. When the evidence cannot establish a shortest path, label the
available verified path and the gap precisely.

Keep only the selected route's states and edges in the default view. Put short
action names on arrows and include required gates or blockers on their actual
route. Use a clear blue current marker, a positive-goal marker, bold route labels
and thick green arrows. Keep node and arrow labels as plain text. Apply emphasis
through native diagram font styling or Mermaid `style`/`classDef` properties such
as `font-weight:bold`; apply arrow color and width through diagram styling. HTML
formatting wrappers and escaped HTML tags in label strings are invalid: they can
appear as literal text in the host. When font styling is unsupported, keep the
plain readable labels and existing current/goal markers. Keep negative branches,
cycles, other reachable states
and off-route approval loops out of this compact view. Render full topology or
alternative branches when the user explicitly requests them. Put profile fields,
source, freshness, ranking limitations and alternative-route notes below the
graph. Compact presentation retains every necessary intermediate state.

Read the currently advertised journey, graph, goal and path evidence needed by
the domain workflow. A current-stage-only record, an empty actions array, or
missing optional history does not establish unavailable topology. Retain
independently verified topology and paths. When a specific failed or unavailable
read prevents a full route, render a labeled partial graph containing at least
the verified current-state node, source and freshness, and identify the precise
missing evidence. Add no inferred nodes, transitions, goals or reachability.
With no verified current state, report the evidence gap without fabricating a
node. Profile bullets or an activity timeline alone leave a resolved CRM detail
request incomplete.

Preserve broad-list filters, ordering and pagination, and apply the domain
display contract to displayed lead entries. Separate ambiguous matches and
resolve identity before targeted journey reads. Read missing display evidence
after a confirmed write without replaying that write. Honor explicit user
format preferences, including a request for text only.

The focused Education Center student-operations lookup and evidence-only state
comparison retain their own completion contract. They may return verified
Calimatic and Lead Director state with the CRM graph dependency disclosed,
without loading another product's journey skill. This exception stays scoped
to that student workflow; an ordinary CRM lookup remains a graph request.
