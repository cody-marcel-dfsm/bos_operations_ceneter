import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {verifyLeadGraphResponse} from "./helpers/lead-graph-acceptance.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const entrySkills = ["bos-app-discovery", "bos-mcp-client", "bos-visual-output"];
const skillRoots = [
  "source/platform",
  "clients/codex/plugins/bos/skills",
  "clients/claude/plugins/bos/skills",
  "clients/copilot/products/bos/skills",
  "clients/gemini/extensions/bos/skills",
  "clients/muse/plugins/bos/skills"
];

test("every BOS record entrypoint loads the shared domain-owned graph completion contract", async () => {
  const canonical = await read("source/platform/bos-mcp-client/references/record-journey-display.md");
  for (const skillRoot of skillRoots) {
    for (const skill of entrySkills) {
      const path = `${skillRoot}/${skill}/SKILL.md`;
      const text = await read(path);
      const links = [...text.matchAll(/\[[^\]]+\]\(([^)]+record-journey-display\.md)\)/g)];
      assert.equal(links.length, 1, `${path}: missing or ambiguous graph completion handoff`);
      const reference = await readFile(new URL(links[0][1], new URL(path, root)), "utf8");
      assert.equal(reference, canonical, `${path}: stale or foreign graph completion contract`);
    }
  }
  for (const skillRoot of [
    "clients/codex/plugins/education-center/skills",
    "clients/claude/plugins/education-center/skills",
    "clients/copilot/products/education-center/skills",
    "clients/copilot/skills",
    "clients/gemini/extensions/education-center/skills",
    "clients/muse/plugins/education-center/skills"
  ]) {
    const path = `${skillRoot}/bos-mcp-client/SKILL.md`;
    const text = await read(path);
    const link = [...text.matchAll(/\[[^\]]+\]\(([^)]+record-journey-display\.md)\)/g)];
    assert.equal(link.length, 1, `${path}: missing graph handoff`);
    assert.equal(await readFile(new URL(link[0][1], new URL(path, root)), "utf8"), canonical);
  }
});

// Fictional labels, consumer-owned topology, and no customer identifiers.
const observation = {
  scope: "crm-detail", current: "trial",
  nodes: [
    {id: "trial", label: "Trial scheduled"},
    {id: "attended", label: "Trial attended"},
    {id: "decision", label: "Enrollment decision"},
    {id: "goal", label: "Enrolled"}
  ],
  edges: [["trial", "attended"], ["attended", "decision"], ["decision", "goal"]],
  paths: [["trial", "attended", "decision", "goal"]]
};
const fullGraph = '```mermaid\nflowchart LR\ntrial["Current: Trial scheduled"]\nattended["Trial attended"]\ndecision["Enrollment decision"]\ngoal["Enrolled"]\ntrial --> attended\nattended --> decision\ndecision --> goal\n```\nSource: synthetic journey observation. Eligibility unverified.';
const textOnly = "Found Synthetic Contact. Status: Trial scheduled. Verified with a live lookup.";

test("an ordinary named lookup after a workspace selection rejects the reported text-only response shape", () => {
  assert.deepEqual(verifyLeadGraphResponse(textOnly, observation), {status: "FAIL", reason: "MISSING_GRAPH"});
  assert.deepEqual(verifyLeadGraphResponse(fullGraph, observation), {status: "PASS"});
});

test("complete graph evidence requires every intermediate node and connected edge", () => {
  assert.equal(verifyLeadGraphResponse(fullGraph.replace('decision["Enrollment decision"]\n', ""), observation).status, "FAIL");
  assert.deepEqual(verifyLeadGraphResponse(fullGraph.replace("attended --> decision\n", ""), observation),
    {status: "FAIL", reason: "INCOMPLETE_PATH"});
  assert.deepEqual(verifyLeadGraphResponse(fullGraph.replace("decision --> goal", "trial --> goal"), observation),
    {status: "FAIL", reason: "UNVERIFIED_EDGE"});
  assert.equal(verifyLeadGraphResponse(fullGraph.replace('goal["Enrolled"]', 'goal["Purchased"]'), observation).status, "FAIL");
  assert.deepEqual(verifyLeadGraphResponse(fullGraph.replace("Current: ", ""), observation),
    {status: "FAIL", reason: "MISSING_CURRENT_POSITION"});
});

test("separate diagram fragments cannot satisfy a connected route", () => {
  const fragments = fullGraph.replace("attended --> decision", '```\n```mermaid\nflowchart LR\nattended["Trial attended"]\nattended --> decision');
  assert.equal(verifyLeadGraphResponse(fragments, observation).status, "FAIL");
});

test("a partial graph needs a verified current state and the specific failed read", () => {
  const partialObservation = {...observation, nodes: [observation.nodes[0]], edges: [], paths: [], read_failure: "topology_unavailable"};
  const partial = '```mermaid\nflowchart LR\ntrial["Current: Trial scheduled"]\n```\nPartial journey: topology_unavailable. Source: synthetic record observation.';
  assert.deepEqual(verifyLeadGraphResponse(partial, partialObservation), {status: "PARTIAL"});
  assert.deepEqual(verifyLeadGraphResponse(textOnly, partialObservation), {status: "FAIL", reason: "MISSING_GRAPH"});
  assert.deepEqual(verifyLeadGraphResponse(partial.replace("topology_unavailable", "unavailable"), partialObservation),
    {status: "FAIL", reason: "MISSING_PARTIAL_EVIDENCE"});
  assert.equal(verifyLeadGraphResponse(partial.replace("```\nPartial", 'trial --> goal\n```\nPartial'), partialObservation).status, "FAIL");
  assert.equal(verifyLeadGraphResponse(partial, observation).status, "FAIL");
});

test("explicit text and focused student lookup preserve owner-approved exceptions", () => {
  assert.deepEqual(verifyLeadGraphResponse(textOnly, {...observation, format: "text"}), {status: "EXEMPT"});
  assert.deepEqual(verifyLeadGraphResponse(textOnly, {...observation, scope: "student-lookup"}), {status: "EXEMPT"});
  assert.deepEqual(verifyLeadGraphResponse("No current state: record_not_found", {...observation, current: null, read_failure: "record_not_found"}),
    {status: "PARTIAL", reason: "NO_VERIFIED_STATE"});
  assert.equal(verifyLeadGraphResponse(textOnly, {...observation, current: null}).status, "FAIL");
});

test("a large reachable graph renders only the selected route by default", () => {
  const branched = {...observation,
    nodes: [...observation.nodes, {id: "nurture", label: "Nurture"}, {id: "declined", label: "Declined"}],
    edges: [...observation.edges, ["trial", "nurture"], ["nurture", "trial"], ["trial", "declined"]]
  };
  const crowded = fullGraph.replace("decision --> goal", 'decision --> goal\nnurture["Nurture"]\ndeclined["Declined"]\ntrial --> nurture\nnurture --> trial\ntrial --> declined');
  assert.deepEqual(verifyLeadGraphResponse(fullGraph, branched), {status: "PASS"});
  assert.deepEqual(verifyLeadGraphResponse(crowded, branched), {status: "FAIL", reason: "NON_MINIMAL_GRAPH"});
  assert.deepEqual(verifyLeadGraphResponse(crowded, {...branched, view: "full"}), {status: "PASS"});
});

test("shortest structural route is the fallback and an app-ranked route retains its provenance", () => {
  const direct = {...observation, edges: [...observation.edges, ["trial", "goal"]], paths: [...observation.paths, ["trial", "goal"]]};
  const shortGraph = '```mermaid\nflowchart LR\ntrial["Current: Trial scheduled"]\ngoal["Enrolled"]\ntrial --> goal\n```\nShortest structural path; eligibility unverified. Source: synthetic journey observation.';
  assert.deepEqual(verifyLeadGraphResponse(shortGraph, direct), {status: "PASS"});
  const inline = '```mermaid\nflowchart LR\ntrial["Trial scheduled · Current"] -->|Enroll directly| goal(["Enrolled · Positive goal"])\n```';
  assert.deepEqual(verifyLeadGraphResponse(inline, direct), {status: "PASS"});
  assert.deepEqual(verifyLeadGraphResponse(inline.replace("-->", "==>"), direct), {status: "PASS"});
  assert.equal(verifyLeadGraphResponse(fullGraph, direct).status, "FAIL");
  assert.deepEqual(verifyLeadGraphResponse(fullGraph, {...direct, ranked_path: observation.paths[0]}), {status: "PASS"});
  assert.equal(verifyLeadGraphResponse(fullGraph, {...direct, ranked_path: observation.paths[0], view: "shortest"}).status, "FAIL");
});


test("literal and escaped HTML in node or arrow labels reject the rendered response", () => {
  const wrappers = [
    ["<b>", "</b>"], ["<strong>", "</strong>"], ["<span>", "</span>"],
    ["&lt;b&gt;", "&lt;/b&gt;"], ["&#60;b&#62;", "&#60;/b&#62;"],
    ["&#x3c;b&#x3e;", "&#x3c;/b&#x3e;"], ["&amp;lt;b&amp;gt;", "&amp;lt;/b&amp;gt;"]
  ];
  for (const [open, close] of wrappers) {
    const decorated = fullGraph.replace('Current: Trial scheduled', `${open}Current: Trial scheduled${close}`);
    assert.deepEqual(verifyLeadGraphResponse(decorated, observation), {status: "FAIL", reason: "HTML_LABEL_MARKUP"});
    const edge = fullGraph.replace("trial --> attended", `trial ==>|${open}Continue${close}| attended`);
    assert.deepEqual(verifyLeadGraphResponse(edge, observation), {status: "FAIL", reason: "HTML_LABEL_MARKUP"});
    assert.deepEqual(verifyLeadGraphResponse(`${fullGraph}\n${decorated}`, observation), {status: "FAIL", reason: "HTML_LABEL_MARKUP"});
  }
});

test("plain labels retain native diagram styling and literal comparison conditions", () => {
  const styled = fullGraph.replace("trial --> attended", "trial ==>|Continue when score < 8| attended")
    .replace("decision --> goal\n", "decision ==> goal\nclassDef route font-weight:bold\nclass trial,attended,decision,goal route\nstyle trial fill:#005A9C,color:#fff\nstyle goal fill:#007F63,color:#fff\nlinkStyle default stroke:#007F63,stroke-width:3px\n");
  assert.deepEqual(verifyLeadGraphResponse(styled, observation), {status: "PASS"});
  const partial = '```mermaid\nflowchart LR\ntrial["Current: Trial scheduled"]\nstyle trial font-weight:bold,fill:#005A9C,color:#fff\n```\nPartial journey: topology_unavailable.';
  const evidence = {...observation,nodes:[observation.nodes[0]],edges:[],paths:[],read_failure:"topology_unavailable"};
  assert.deepEqual(verifyLeadGraphResponse(partial,evidence),{status:"PARTIAL"});
});
