// Client-owned display model only: no network, credentials, execution or authority.
import {pathToFileURL} from "node:url";

const freshnessValues = ["current", "stale", "unknown"];
const parties = ["ada", "customer", "service", "external"];
const statuses = ["pending", "blocked", "ready", "running", "waiting", "succeeded", "failed", "cancelled", "uncertain", "unknown"];
function object(value, keys, name) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) throw new Error(`Invalid closed ${name}`);
  return value;
}
function text(value, name) {
  if (typeof value !== "string" || !value.trim() || value.length > 512 ||
      /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) throw new Error(`Invalid ${name}`);
  return value;
}
function choice(value, choices, name) {
  if (!choices.includes(value)) throw new Error(`Invalid ${name}`);
  return value;
}
function rows(value, max, name) {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid bounded ${name}`);
  return value;
}
function unique(values, name) {
  const ids = values.map(row => text(row.id, `${name} id`));
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${name} id`);
}
function evidence(row, positive) {
  if (row.evidenceRef !== undefined) text(row.evidenceRef, "source evidence reference");
  if (positive && row.evidenceRef === undefined) throw new Error("Positive status requires source evidence reference");
}

export function validateJourneyView(input) {
  object(input, ["title", "freshness", "journeys", "primaryAction"], "view");
  text(input.title, "title"); choice(input.freshness, freshnessValues, "view freshness");
  rows(input.journeys, 12, "journeys"); unique(input.journeys, "journey");
  let count = 0;
  for (const journey of input.journeys) {
    object(journey, ["id", "label", "ownerApp", "customerLabel", "definition", "instance", "freshness", "graph", "milestones", "work", "nextActions"], "journey");
    for (const key of ["label", "ownerApp", "customerLabel"]) text(journey[key], key);
    choice(journey.freshness, freshnessValues, "journey freshness");
    for (const kind of ["definition", "instance"]) {
      object(journey[kind], ["label", "revision"], kind);
      text(journey[kind].label, `${kind} label`); text(journey[kind].revision, `${kind} revision`);
    }
    object(journey.graph, ["revision", "confirmation", "nodes", "edges"], "graph");
    text(journey.graph.revision, "graph revision");
    object(journey.graph.confirmation, ["status", "revision", "evidenceRef"], "graph confirmation");
    choice(journey.graph.confirmation.status, ["proposed", "confirmed", "unknown"], "graph confirmation status");
    const confirmed = journey.graph.confirmation.status === "confirmed";
    evidence(journey.graph.confirmation, confirmed);
    if (journey.graph.confirmation.revision !== undefined) text(journey.graph.confirmation.revision, "confirmation revision");
    if (confirmed && journey.graph.confirmation.revision !== journey.graph.revision) throw new Error("Graph confirmation revision mismatch");
    rows(journey.graph.nodes, 60, "graph nodes"); unique(journey.graph.nodes, "graph node");
    for (const node of journey.graph.nodes) {object(node, ["id", "label"], "graph node"); text(node.label, "graph node label");}
    rows(journey.graph.edges, 100, "graph edges");
    const nodes = new Set(journey.graph.nodes.map(node => node.id));
    for (const edge of journey.graph.edges) {
      object(edge, ["from", "to", "label"], "edge");
      if (!nodes.has(edge.from) || !nodes.has(edge.to)) throw new Error("Unknown graph edge endpoint");
      if (edge.label !== undefined) text(edge.label, "edge label");
    }
    rows(journey.milestones, 40, "milestones"); unique(journey.milestones, "milestone");
    for (const row of journey.milestones) {
      object(row, ["id", "label", "status", "evidenceRef"], "milestone"); text(row.label, "milestone label");
      choice(row.status, ["pending", "blocked", "achieved", "needs_amendment", "unknown"], "milestone status");
      evidence(row, row.status === "achieved");
    }
    rows(journey.work, 60, "work"); unique(journey.work, "work");
    for (const row of journey.work) {
      object(row, ["id", "label", "status", "party", "evidenceRef", "blockedBy"], "work");
      text(row.label, "work label"); choice(row.status, statuses, "work status"); choice(row.party, parties, "work party");
      evidence(row, row.status === "succeeded"); rows(row.blockedBy, 20, "blockers");
      for (const blocker of row.blockedBy) {
        object(blocker, ["journeyId", "workId"], "blocker");
        const dependency = input.journeys.find(candidate => candidate.id === blocker.journeyId);
        if (!dependency || !Array.isArray(dependency.work) || !dependency.work.some(candidate => candidate.id === blocker.workId)) throw new Error("Unknown work dependency");
        if (blocker.journeyId === journey.id && blocker.workId === row.id) throw new Error("Self work dependency");
      }
    }
    rows(journey.nextActions, 12, "next actions"); unique(journey.nextActions, "next action");
    for (const row of journey.nextActions) {
      object(row, ["id", "label", "party"], "next action"); text(row.label, "action label"); choice(row.party, parties, "action party");
    }
    count += journey.graph.nodes.length + journey.milestones.length + journey.work.length + journey.nextActions.length;
  }
  if (count > 300) throw new Error("View exceeds total node bound");
  if (input.primaryAction !== null) {
    object(input.primaryAction, ["journeyId", "actionId"], "primary action");
    const journey = input.journeys.find(row => row.id === input.primaryAction.journeyId);
    if (!journey?.nextActions.some(row => row.id === input.primaryAction.actionId)) throw new Error("Unknown primary action");
  }
  return structuredClone(input);
}

// Every dynamic punctuation character is a Mermaid numeric entity inside a quoted
// label. IDs, edges, classes and syntax are generated exclusively by this module.
export function mermaidLabel(value) {
  if (typeof value !== "string" || !value || value.length > 8192 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) throw new Error("Invalid display label");
  return [...value].map(char => /^[a-z0-9 ]$/iu.test(char) ? char : `#${char.codePointAt(0)};`).join("");
}
function describe(input) {
  const view = validateJourneyView(input);
  const labels = [], edges = [], groups = [], workIds = new Map();
  const add = (label, group, style = "neutral") => {
    const id = `n${labels.length}`; labels.push({id, label, group, style}); return id;
  };
  add(`${view.title} | display only | freshness: ${view.freshness}`, null);
  add("Rendering does not confirm, execute or deliver a workflow", null);
  for (const [index, journey] of view.journeys.entries()) {
    const group = `j${index}`; groups.push({id: group, label: journey.label});
    const fresh = view.freshness === "current" && journey.freshness === "current";
    const qualifier = fresh ? "" : "Last observed; current status unverified | ";
    add(`App owner: ${journey.ownerApp} | Customer: ${journey.customerLabel}`, group);
    add(`Definition: ${journey.definition.label} | revision: ${journey.definition.revision}`, group);
    add(`Instance: ${journey.instance.label} | revision: ${journey.instance.revision} | freshness: ${journey.freshness}`, group);
    add(`${qualifier}Graph revision: ${journey.graph.revision} | ${journey.graph.confirmation.status}` +
      (journey.graph.confirmation.status === "confirmed" ? ` | confirmation revision: ${journey.graph.confirmation.revision} | evidence: ${journey.graph.confirmation.evidenceRef}` : " | review/readiness unproven"), group);
    const graphIds = new Map(journey.graph.nodes.map(node => [node.id, add(node.label, group)]));
    for (const edge of journey.graph.edges) edges.push({from: graphIds.get(edge.from), to: graphIds.get(edge.to), label: edge.label ?? "", dependency: false});
    for (const row of journey.milestones) add(`${qualifier}Milestone: ${row.label} | ${row.status}` +
      (row.evidenceRef ? ` | evidence: ${row.evidenceRef}` : ""), group, fresh ? row.status === "achieved" ? "achieved" : row.status === "blocked" ? "blocked" : "neutral" : "neutral");
    for (const row of journey.work) {
      const id = add(`${qualifier}${row.party}: ${row.label} | ${row.status}` +
        (row.evidenceRef ? ` | evidence: ${row.evidenceRef}` : ""), group, fresh && row.status === "blocked" ? "blocked" : "neutral");
      workIds.set(JSON.stringify([journey.id, row.id]), id);
    }
    for (const row of journey.nextActions) add(`${fresh ? "Available action" : "Previously offered; refresh before action"}: ${row.label} | ${row.party}`, group);
  }
  for (const journey of view.journeys) for (const row of journey.work) for (const blocker of row.blockedBy) {
    edges.push({from: workIds.get(JSON.stringify([blocker.journeyId, blocker.workId])),
      to: workIds.get(JSON.stringify([journey.id, row.id])), label: "dependency", dependency: true});
  }
  let next = "Next: refresh permitted state to discover a supported action";
  if (view.primaryAction) {
    const journey = view.journeys.find(row => row.id === view.primaryAction.journeyId);
    const action = journey.nextActions.find(row => row.id === view.primaryAction.actionId);
    next = view.freshness === "current" && journey.freshness === "current" ?
      `Next: ${action.label} | ${action.party} | admission and permission checked at execution` :
      "Next: refresh permitted state; previously offered action is unverified";
  }
  add(next, null);
  return {labels, edges, groups};
}

export function renderJourneyView(input, {format = "mermaid"} = {}) {
  choice(format, ["mermaid", "text"], "output format");
  const {labels, edges, groups} = describe(input);
  if (format === "text") return labels.map(row => `${row.group ? `[${groups.find(group => group.id === row.group).label}] ` : ""}${row.label}`).join("\n") +
    "\n" + edges.map(edge => `${edge.dependency ? "Dependency" : "Graph flow"}: ${labels.find(row => row.id === edge.from).label} -> ${labels.find(row => row.id === edge.to).label}${edge.label ? ` | ${edge.label}` : ""}`).join("\n") + "\n";
  const node = row => `  ${row.id}["${mermaidLabel(row.label)}"]:::${row.style}`;
  const output = ["flowchart TD", ...labels.filter(row => row.group === null).map(node)];
  for (const group of groups) output.push(`  subgraph ${group.id}["${mermaidLabel(group.label)}"]`,
    ...labels.filter(row => row.group === group.id).map(node), "  end");
  for (const edge of edges) output.push(`  ${edge.from} ${edge.dependency ? "-.->" : "-->"}${edge.label ? `|"${mermaidLabel(edge.label)}"|` : ""} ${edge.to}`);
  output.push("  classDef neutral fill:#eef2f6,stroke:#526170,color:#102030",
    "  classDef achieved fill:#e0f2e5,stroke:#317044,color:#153320",
    "  classDef blocked fill:#fff0d6,stroke:#946319,color:#49300c");
  return output.join("\n") + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== "--format")) throw new Error("Use --format mermaid|text");
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length; if (size > 1048576) throw new Error("Input exceeds 1 MiB"); chunks.push(chunk);
    }
    process.stdout.write(renderJourneyView(JSON.parse(Buffer.concat(chunks).toString("utf8")), {format: args[1] ?? "mermaid"}));
  } catch { process.stderr.write("Invalid Ada journey view; check the closed presentation model and current evidence.\n"); process.exitCode = 1; }
}
