// Consumer-owned acceptance projection for the Mermaid fallback. The harness
// supplies normalized, verified observations; this is not a service schema or
// a proof that the model invoked a tool. Native interactive graphs need their
// own rendered-surface evidence and cannot pass this Markdown-only check.
export function verifyLeadGraphResponse(response, observation) {
  const fail = reason => ({status: "FAIL", reason});
  if (observation.scope === "student-lookup" || observation.format === "text") {
    return {status: "EXEMPT"};
  }
  if (!observation.current) {
    return observation.read_failure && response.includes(observation.read_failure)
      ? {status: "PARTIAL", reason: "NO_VERIFIED_STATE"}
      : fail("MISSING_STATE_EVIDENCE");
  }
  const diagrams = [...response.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)];
  if (!diagrams.length) return fail("MISSING_GRAPH");
  // Treat each diagram independently: fragments in separate diagrams cannot
  // masquerade as a connected current-to-goal route.
  const results = diagrams.map(([, diagram]) => {
    if (!/^\s*(?:flowchart|graph)\s+(?:LR|RL|TD|TB|BT)\b/m.test(diagram)) {
      return fail("UNSUPPORTED_GRAPH_SYNTAX");
    }
    const nodes = new Map();
    const declaration = /\b([A-Za-z_][\w-]*)(?:\["([^"\n]+)"\]|\(\["([^"\n]+)"\]\)|\("([^"\n]+)"\))/g;
    for (const [, id, rectangle, stadium, rounded] of diagram.matchAll(declaration)) {
      const label = rectangle ?? stadium ?? rounded;
      if (nodes.has(id) && nodes.get(id) !== label) return fail("CONFLICTING_NODE");
      nodes.set(id, label);
    }
    const topology = diagram.replace(declaration, (_, id) => id);
    const edges = [...topology.matchAll(/\b([A-Za-z_][\w-]*)\s*(?:-->|==>)(?:\|[^|\n]*\|)?\s*([A-Za-z_][\w-]*)\b/g)]
      .map(([, from, to]) => [from, to]);
    const observedNodes = new Map(observation.nodes.map(node => [node.id, node.label]));
    for (const [id, label] of nodes) {
      if (!observedNodes.has(id) || !label.includes(observedNodes.get(id))) {
        return fail("UNVERIFIED_NODE");
      }
    }
    const current = nodes.get(observation.current);
    if (!current || !/\bcurrent\b/i.test(current)) return fail("MISSING_CURRENT_POSITION");
    for (const [from, to] of edges) {
      if (!nodes.has(from) || !nodes.has(to) || !observation.edges.some(edge => edge[0] === from && edge[1] === to)) {
        return fail("UNVERIFIED_EDGE");
      }
    }
    const paths = observation.paths ?? [];
    if (paths.length) {
      const shortestLength = Math.min(...paths.map(path => path.length));
      const selected = observation.ranked_path && observation.view !== "shortest"
        ? paths.filter(path => JSON.stringify(path) === JSON.stringify(observation.ranked_path))
        : paths.filter(path => path.length === shortestLength);
      const complete = selected.find(path => path[0] === observation.current
        && path.every(id => nodes.has(id))
        && path.slice(1).every((to, index) => edges.some(edge => edge[0] === path[index] && edge[1] === to)));
      if (!complete) return fail("INCOMPLETE_PATH");
      if (observation.view !== "full" && (nodes.size !== complete.length || edges.length !== complete.length - 1)) {
        return fail("NON_MINIMAL_GRAPH");
      }
      return {status: "PASS"};
    }
    if (!observation.read_failure || !response.includes(observation.read_failure) || !/\bpartial\b/i.test(response)) {
      return fail("MISSING_PARTIAL_EVIDENCE");
    }
    return {status: "PARTIAL"};
  });
  return results.find(result => result.status !== "FAIL") ?? results[0];
}
