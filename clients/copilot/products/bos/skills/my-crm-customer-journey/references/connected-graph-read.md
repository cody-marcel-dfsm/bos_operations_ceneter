# Connected graph reads

A BOS resources/list response may advertise an application-owned graph on the
existing authenticated connection. Select it by its declared app, contract and
exact selected context metadata; never build a URI from an identifier. Read the
exact listed URI with the host resource reader. The app directory and separate
app MCP are additional discovery paths for missing evidence, not prerequisites
for reading this already advertised resource. Apply bos-app-discovery's bounded
read-only timeout retry before falling back to a partial journey.

## lead-director-connected-graph/v1

Require the live resource contract before interpreting these fields:

- contextId matches the selected bos_get_context role context;
- sourceBinding declares sourceType/sourceIdentity and evidence-only scope;
- leadMapping declares the record field and source-cardinality rule;
- nodes contain code/name/is_goal/goal_type;
- transitions contain code/from_node_code/to_node_code and optional
  conditions/requires_plugin;
- graphIdentity, graphDigest, discoveryEpoch and provenance identify the
  complete graph observation; evidenceSemantics states its limits.

For v1, accept only a resolved lead with exactly one source whose source_type
and source_identity match sourceBinding. Match attributes.node_type_code to
exactly one nodes[].code. Preserve lead source version/time and graph digest/time
as separate observations. Binding identifiers establish evidence association;
they are neither authorization inputs nor display labels. Reject missing or
ambiguous binding, duplicate node codes, dangling edges, conflicting canonical
goal metadata, truncated/invalid JSON or mismatched context/version. Do not
substitute directory context hints or a record from a prior task.

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
