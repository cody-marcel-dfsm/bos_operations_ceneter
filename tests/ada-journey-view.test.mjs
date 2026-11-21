import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import test from "node:test";
import {renderJourneyView, validateJourneyView, mermaidLabel} from "../source/platform/ada/scripts/journey-view.mjs";

const root = new URL("../", import.meta.url).pathname;
const modulePath = join(root, "source/platform/ada/scripts/journey-view.mjs");
function example() {
  const journey = (id, label, ownerApp, instance) => ({
    id, label, ownerApp, customerLabel: "Example Customer", freshness: "current",
    definition: {label: "Agent setup template", revision: "definition_2"},
    instance: {label: instance, revision: "instance_7"},
    graph: {revision: "graph_3", confirmation: {status: "confirmed", revision: "graph_3", evidenceRef: "source_graph_review"},
      nodes: [{id: "intake", label: "Receive request"}, {id: "route", label: "Offer approved handoff"}],
      edges: [{from: "intake", to: "route", label: "Customer purpose captured"}]},
    milestones: [{id: "graph", label: "Workflow reviewed", status: "achieved", evidenceRef: "source_graph_review"},
      {id: "delivery", label: "Agent and number delivery", status: "blocked"}],
    work: [{id: "draft", label: "Prepare opening draft", status: "running", party: "ada", blockedBy: []},
      {id: "permission", label: "Review call permission", status: "waiting", party: "customer", blockedBy: []},
      {id: "number", label: "Prepare number", status: "blocked", party: "service", blockedBy: [{journeyId: id, workId: "permission"}]}],
    nextActions: [{id: "review", label: "Review the call permission", party: "customer"}]
  });
  const first = journey("onboarding", "Onboarding", "Setup app", "Setup run A");
  const second = journey("knowledge", "Knowledge preparation", "Knowledge app", "Knowledge run B");
  second.graph.confirmation = {status: "proposed"};
  second.work[0].blockedBy = [{journeyId: "onboarding", workId: "permission"}];
  return {title: "Your agent progress", freshness: "current", journeys: [first, second],
    primaryAction: {journeyId: "onboarding", actionId: "review"}};
}

test("multiple app-owned journeys preserve definition/customer/instance and exact graph revision", () => {
  const model = example(); const before = structuredClone(model);
  const text = renderJourneyView(model, {format: "text"});
  for (const label of ["App owner: Setup app", "App owner: Knowledge app", "Customer: Example Customer",
    "Definition: Agent setup template", "Instance: Setup run A", "Instance: Knowledge run B",
    "Graph revision: graph_3 | confirmed | confirmation revision: graph_3", "graph_3 | proposed | review/readiness unproven",
    "Graph flow: Receive request -> Offer approved handoff"]) assert(text.includes(label), label);
  const mermaid = renderJourneyView(model);
  assert(mermaid.startsWith("flowchart TD\n"));
  assert(mermaid.includes('subgraph j0["Onboarding"]'));
  assert(mermaid.includes('subgraph j1["Knowledge preparation"]'));
  assert.equal(renderJourneyView(model), mermaid);
  assert.deepEqual(model, before);
});

test("parallel parties, current blockers and source achievements retain one primary CTA", () => {
  const text = renderJourneyView(example(), {format: "text"});
  for (const value of ["ada: Prepare opening draft | running", "customer: Review call permission | waiting",
    "service: Prepare number | blocked", "Workflow reviewed | achieved | evidence: source_graph_review",
    "Agent and number delivery | blocked", "Dependency:"]) assert(text.includes(value));
  assert.equal(text.split("\n").filter(line => line.startsWith("Next:")).length, 1);
  assert(text.includes("Next: Review the call permission | customer | admission and permission checked at execution"));
  assert(!text.includes("100%")); assert(!text.includes("ETA"));
  assert(!text.includes("delivery | achieved"));
});

test("unknown and stale snapshots suppress primary effects and positive achievement coloring", () => {
  for (const freshness of ["unknown", "stale"]) {
    const model = example(); model.freshness = freshness;
    const text = renderJourneyView(model, {format: "text"});
    assert(text.includes("Last observed; current status unverified"));
    assert(text.includes("Next: refresh permitted state; previously offered action is unverified"));
    assert(!text.includes("Next: Review the call permission"));
    assert(text.includes("Previously offered; refresh before action"));
    assert(!renderJourneyView(model).includes(":::achieved"));
  }
  const model = example(); model.journeys[0].freshness = "stale";
  assert(!renderJourneyView(model, {format: "text"}).includes("Next: Review the call permission"));
});

test("mismatched graph confirmation or missing positive evidence cannot imply readiness", () => {
  const mutations = [
    value => {value.journeys[0].graph.confirmation.revision = "old_graph";},
    value => {delete value.journeys[0].graph.confirmation.evidenceRef;},
    value => {delete value.journeys[0].milestones[0].evidenceRef;},
    value => {value.journeys[0].work[0].status = "succeeded";}
  ];
  for (const mutate of mutations) {const model = example(); mutate(model); assert.throws(() => renderJourneyView(model), /revision mismatch|evidence/);}
  const model = example(); model.journeys[0].work[0].status = "uncertain";
  assert(renderJourneyView(model, {format: "text"}).includes("Prepare opening draft | uncertain"));
});

test("closed model rejects invented percent, ETA, actions, edges, duplicate IDs and dependencies", () => {
  const mutations = [
    value => {value.percentComplete = 100;},
    value => {value.journeys[0].eta = "tomorrow";},
    value => {value.primaryAction.actionId = "invented";},
    value => {value.journeys[0].graph.edges[0].to = "invented";},
    value => {value.journeys[0].work[0].blockedBy = [{journeyId: "foreign", workId: "private"}];},
    value => {value.journeys[0].work[0].blockedBy = [{journeyId: "onboarding", workId: "draft"}];},
    value => {value.journeys[0].work.push(value.journeys[0].work[0]);},
    value => {value.journeys.push(value.journeys[0]);},
    value => {value.journeys[0].work[0].party = "system_admin";},
    value => {value.journeys[0].work[0].status = "delivered";},
    value => {value.journeys[0].nextActions[0].href = "https://example.invalid";}
  ];
  for (const mutate of mutations) {const model = example(); mutate(model); assert.throws(() => validateJourneyView(model));}
});

test("markup, directives, URLs and graph syntax remain inert quoted labels", () => {
  const attack = 'x"] --> root; click root "javascript:alert(1)"; %%{init: {"securityLevel":"loose"}}%% <script>alert(1)</script>';
  const model = example(); model.title = attack; model.journeys[0].label = attack;
  model.journeys[0].graph.nodes[0].label = attack;
  model.journeys[0].graph.edges[0].label = attack;
  const encoded = mermaidLabel(attack); const output = renderJourneyView(model);
  assert(output.replaceAll("<br/>", "").includes(encoded));
  for (const token of ['javascript:', '<script>', '%%{', 'click root "', '"] --> root;']) assert(!output.includes(token), token);
  // Every node has only generated IDs/static classes; no raw data can break quotes.
  const nodes = output.split("\n").filter(line => /^  n\d+\[/.test(line));
  assert(nodes.length > 10);
  assert(nodes.every(line => /^  n\d+\["(?:[^"<>]|<br\/>)*"\]:::(neutral|achieved|blocked)$/.test(line)));
  for (const invalid of ["bad\nlabel", "bad\u001blabel", "bad\u202elabel"]) {
    const value = example(); value.title = invalid; assert.throws(() => renderJourneyView(value));
  }
});

test("bounds and empty/unknown state fail safely without invented journeys", () => {
  const empty = {title: "No permitted journey projection", freshness: "unknown", journeys: [], primaryAction: null};
  const output = renderJourneyView(empty, {format: "text"});
  assert(output.includes("Next: refresh permitted state")); assert(!output.includes("App owner:"));
  const model = example(); model.journeys = Array(13).fill(model.journeys[0]);
  assert.throws(() => renderJourneyView(model), /bounded journeys/);
  assert.throws(() => renderJourneyView({...empty, title: "a".repeat(513)}), /title/);
  const wide = example(); wide.journeys[0].label = "x".repeat(512);
  wide.journeys[0].ownerApp = "y".repeat(512); wide.journeys[0].customerLabel = "z".repeat(512);
  assert(renderJourneyView(wide).length > 1000);
});

test("diagram ordering is invisible and preserves every supplied visible relationship", () => {
  const model = example(); const output = renderJourneyView(model);
  const ids = [...output.matchAll(/^  (n\d+)\[/gm)].map(row => row[1]).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const layout = [...output.matchAll(/^  (n\d+) ~~~ (n\d+)$/gm)].map(row => [row[1], row[2]]);
  assert.deepEqual(layout, ids.slice(1).map((id, index) => [ids[index], id]));
  assert.equal((output.match(/^  n\d+ -->/gm) ?? []).length, model.journeys.reduce((count, row) => count + row.graph.edges.length, 0));
  assert.equal((output.match(/^  n\d+ -\.->/gm) ?? []).length, model.journeys.reduce((count, row) => count + row.work.reduce((total, work) => total + work.blockedBy.length, 0), 0));
  assert(!output.includes("linkStyle"));
});

test("bounded Unicode diagram lines preserve encoded text and only generated breaks", () => {
  const model = example(); model.title = "🐙".repeat(100) + 'x"<br/> & !'.repeat(15);
  model.journeys[0].ownerApp = "UnbrokenOwner".repeat(30);
  model.journeys[0].graph.edges[0].label = "Long edge: " + "z".repeat(200);
  const output = renderJourneyView(model);
  const labels = [...output.matchAll(/\["([^"\n]*)"\]|\|"([^"\n]*)"\|/g)].map(row => row[1] ?? row[2]);
  assert(labels.some(label => label.includes("<br/>")));
  for (const label of labels) for (const line of label.split("<br/>")) {
    const decoded = line.replace(/#(\d+);/g, (_, point) => String.fromCodePoint(Number(point)));
    assert([...decoded].length <= 40, `Line exceeds bounded display width: ${[...decoded].length}`);
  }
  assert(output.replaceAll("<br/>", "").includes(mermaidLabel(model.title + " | display only | freshness: current")));
  assert(output.replaceAll("<br/>", "").includes(mermaidLabel(model.journeys[0].graph.edges[0].label)));
  assert(!output.includes("<br/> &"));
});

test("diagram layout leaves current stale and unknown text output byte-identical", () => {
  const expected = {
    current: "791d0efcc083acff6dba54543e4180399cb332b0be285f5280f2a90065cc6162",
    stale: "5df3e0b79fce2cd3762c14f171b01b82b367ea76ed570b87f0ab83caf4581bc8",
    unknown: "901030dec32a9a676b40ee5a1087b0147f032438dd847b4eed65e4d9672e80c1"
  };
  for (const [freshness, hash] of Object.entries(expected)) {
    const model = example(); model.freshness = freshness;
    assert.equal(createHash("sha256").update(renderJourneyView(model, {format: "text"})).digest("hex"), hash);
  }
});

test("stdin CLI emits deterministic model views, rejects invalid/oversized input without data echo", () => {
  const run = (input, args = []) => spawnSync(process.execPath, [modulePath, ...args], {input, encoding: "utf8", maxBuffer: 2 * 1048576});
  for (const format of ["mermaid", "text"]) {
    const result = run(JSON.stringify(example()), ["--format", format]);
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, renderJourneyView(example(), {format}));
  }
  for (const input of ['{"private":"customer-secret"}', "x".repeat(1048577), "malformed"]) {
    const result = run(input); assert.equal(result.status, 1); assert.equal(result.stdout, "");
    assert(!result.stderr.includes("customer-secret")); assert(result.stderr.includes("Invalid Ada journey view"));
  }
  assert.equal(run(JSON.stringify(example()), ["--format", "html"]).status, 1);
});

test("every supported generated Ada consumer preserves safe multi-journey rendering", async () => {
  for (const host of ["codex/plugins", "claude/plugins", "copilot/products", "gemini/extensions", "muse/plugins"]) {
    const base = join(root, "clients", host, "bos/skills/ada");
    for (const file of ["scripts/journey-view.mjs", "references/journey-view.md"]) {
      assert.equal(await readFile(join(base, file), "utf8"), await readFile(join(root, "source/platform/ada", file), "utf8"));
    }
    const runtime = await import(pathToFileURL(join(base, "scripts/journey-view.mjs")));
    assert.equal(runtime.renderJourneyView(example()), renderJourneyView(example()));
    const stale = example(); stale.freshness = "stale";
    assert(!runtime.renderJourneyView(stale).includes(":::achieved"));
  }
});
