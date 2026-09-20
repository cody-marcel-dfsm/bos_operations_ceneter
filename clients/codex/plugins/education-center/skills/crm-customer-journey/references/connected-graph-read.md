# Connected graph reads

The single BOS platform connection may advertise an application-owned graph
read operation under its server-authorized application context. In Education
Center, select the descriptor by its declared app and contract under that
current context; never build a URI or API route from an identifier. Invoke the
descriptor's exact deterministic HTTPS method and path through the BOS
dependency adapter with its current schema and audience. The adapter owns
identity-v2 transport context; this capability never receives or forwards it.
BOS discovery supplies the contract; the
API response supplies graph evidence. For a timeout, follow only the exact
service-returned recovery action and declared timing. When none exists, preserve
verified record evidence and fall back to a partial journey without replaying
the graph request.

## lead-director-connected-graph/v1

Require the live resource contract before interpreting these fields:

- sourceBinding declares sourceType/sourceIdentity and evidence-only scope;
- leadMapping declares the record field and source-cardinality rule;
- nodes contain code/name/is_goal/goal_type;
- transitions contain code/from_node_code/to_node_code and optional
  conditions/requires_plugin;
- graphIdentity, graphDigest, discoveryEpoch and provenance identify the
  complete graph observation; evidenceSemantics states its limits.

For v1, accept only a resolved record with exactly one source whose source_type
and source_identity match sourceBinding. Match attributes.node_type_code to
exactly one nodes[].code. Preserve record source version/time and graph digest/time
as separate observations. Binding identifiers establish evidence association;
they are neither authorization inputs nor display labels. Reject missing or
ambiguous binding, duplicate node codes, dangling edges, conflicting canonical
goal metadata, truncated/invalid JSON or mismatched grant/version. Do not
substitute a record from a prior task.

Trace directed simple paths from the observed current node to canonical goals,
tracking visited nodes to avoid cycles. Keep distinct goal alternatives and
relevant conditional edges; report any traversal bound or omitted loops. Merge
shared nodes/edges for readable diagrams without dropping intermediate states.
A verified topology supplies structural paths without a separate journey/path
API. Obtain additional reads only for missing history, eligibility or requested
facts. An unavailable optional read does not erase a verified structural path.

Render the exact returned node names, current position, intermediate states and
canonical goal classes. Label structural candidates and eligibility unknown
when the contract says unknown. Preserve edge conditions as conditions; absence
of a condition does not prove present eligibility. Never infer completed history,
goal attainment or available actions from topology. Keep raw binding identifiers
and contact details outside graph nodes. Use the main skill's native graph and
text-path presentation.
