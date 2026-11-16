import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import test from "node:test";
import {presentConfirmation, resolveConfirmation, projectProgress} from "../source/platform/ada/scripts/turn-safeguards.mjs";
import {root, resolveProductSkills, transformProductSkillGuidance} from "../scripts/lib/package-model.mjs";

function snapshot() {
  return {scope: "participation_demo", revision: "revision_3", actions: [
    {ref: "action_callback", itemRef: "requirement_callback", itemRevision: "2",
      statement: "Offer a callback when the team is unavailable.", targets: ["agent_demo"], configurationRevision: "config_2"},
    {ref: "action_calendar", itemRef: "permission_calendar", itemRevision: "1",
      statement: "Connect Calendar for availability checks.", targets: ["calendar_demo"]}
  ], work: [
    {ref: "draft_demo", status: "running", party: "ada", summary: "Preparing the workflow draft"},
    {ref: "calendar_demo", status: "awaiting_consent", party: "customer", summary: "Calendar permission is needed for availability"},
    {ref: "number_demo", status: "queued", party: "external", summary: "Number preparation is pending"}
  ], milestones: [{ref: "graph_demo", status: "achieved", receiptRef: "receipt_graph"},
    {ref: "delivery_demo", status: "blocked"}]};
}

test("exact anchored signoff selects one current requirement among concurrent prompts", () => {
  const state = snapshot();
  const pending = state.actions.map(action => presentConfirmation(state, action.ref));
  for (const decision of ["confirm", "decline", "revoke"]) {
    assert.deepEqual(resolveConfirmation({snapshot: state, pending, decision,
      replyAnchor: {scope: state.scope, presentationId: pending[0].presentationId}}),
    {status: "eligible", actionRef: "action_callback", decision});
  }
  assert.deepEqual(state, snapshot());
});

test("bare Yes and a foreign or duplicate anchor never choose an approval", () => {
  const state = snapshot(); const pending = [presentConfirmation(state, "action_callback")];
  const decide = (replyAnchor, values = pending) => resolveConfirmation({snapshot: state, pending: values, decision: "confirm", replyAnchor});
  assert.equal(decide(null).status, "clarify");
  assert.equal(decide({scope: state.scope, presentationId: "unknown"}).status, "clarify");
  assert.equal(decide({scope: "other_customer", presentationId: pending[0].presentationId}).status, "refresh");
  assert.equal(decide({scope: state.scope, presentationId: pending[0].presentationId}, [...pending, ...pending]).status, "clarify");
  assert.throws(() => resolveConfirmation({snapshot: state, pending, decision: "Yes"}), /Explicit/);
});

test("every changed scope/content/revision/target and withdrawn action invalidates signoff", () => {
  const original = snapshot(); const presentation = presentConfirmation(original, "action_callback");
  const mutations = [
    state => {state.scope = "other_customer";}, state => {state.revision = "revision_4";},
    state => {state.actions[0].statement += " Also send messages.";},
    state => {state.actions[0].itemRevision = "3";},
    state => {state.actions[0].itemRef = "another_requirement";},
    state => {state.actions[0].targets = ["other_agent"];},
    state => {state.actions[0].configurationRevision = "config_3";},
    state => {state.actions.shift();}
  ];
  for (const mutate of mutations) {
    const state = structuredClone(original); mutate(state);
    assert.equal(resolveConfirmation({snapshot: state, pending: [presentation], decision: "confirm",
      replyAnchor: {scope: original.scope, presentationId: presentation.presentationId}}).status, "refresh");
  }
});

test("malformed, missing and duplicate current action bindings fail closed", () => {
  const state = snapshot();
  assert.throws(() => presentConfirmation(state, "invented_action"), /unavailable/);
  state.actions.push({...state.actions[0]});
  assert.throws(() => presentConfirmation(state, "action_callback"), /Duplicate/);
  for (const key of ["itemRef", "itemRevision", "statement", "targets"]) {
    const malformed = snapshot(); delete malformed.actions[0][key];
    assert.throws(() => presentConfirmation(malformed, "action_callback"));
  }
});

test("progress preserves parallel blockers and receipts without inventing delivery or wake", () => {
  const state = snapshot();
  const progress = projectProgress(state, {nextAction: "action_calendar"});
  assert.deepEqual(progress.work, state.work);
  assert.deepEqual(progress.milestones, state.milestones);
  assert.equal(progress.nextAction.ref, "action_calendar");
  assert.equal(progress.observationMode, "active_conversation_only");
  assert.equal(progress.milestones[1].receiptRef, undefined);
  progress.work[0].status = "succeeded";
  assert.equal(state.work[0].status, "running");
  assert.throws(() => projectProgress(state, {nextAction: "invented"}), /unavailable/);
  assert.throws(() => projectProgress({...state, work: undefined}), /Current work/);
});

test("host observation description requires every actual facility and changes no state", () => {
  const state = snapshot();
  const full = {authenticatedSubscription: true, durableRecovery: true, boundedWake: true, cancellation: true};
  assert.equal(projectProgress(state, {hostCapabilities: full}).observationMode, "host_supported");
  for (const key of Object.keys(full)) {
    assert.equal(projectProgress(state, {hostCapabilities: {...full, [key]: false}}).observationMode, "active_conversation_only");
  }
  assert.deepEqual(state, snapshot());
});

const consumers = ["codex/plugins", "claude/plugins", "copilot/products", "gemini/extensions", "muse/plugins"];
test("BOS production selection and all supported generated consumers ship the same Ada safeguards", async () => {
  const product = JSON.parse(await readFile(join(root, "products/bos/product.json"), "utf8"));
  const skills = await resolveProductSkills(product);
  assert(skills.some(skill => skill.name === "ada"));
  const relativeFiles = ["SKILL.md", "agents/openai.yaml", "references/turn-safeguards.md", "scripts/turn-safeguards.mjs",
    "references/behavior-core.md", "references/runtime-export.md", "runtime-export.json"];
  for (const consumer of consumers) {
    const base = join(root, "clients", consumer, "bos/skills/ada");
    for (const file of relativeFiles) {
      const canonical = await readFile(join(root, "source/platform/ada", file), "utf8");
      assert.equal(await readFile(join(base, file), "utf8"),
        file === "SKILL.md" ? transformProductSkillGuidance(product, "ada", canonical) : canonical, `${consumer}: ${file}`);
    }
    const runtime = await import(pathToFileURL(join(base, "scripts/turn-safeguards.mjs")));
    const state = snapshot(); const presented = runtime.presentConfirmation(state, "action_callback");
    assert.deepEqual(presented, presentConfirmation(state, "action_callback"));
    assert.equal(runtime.resolveConfirmation({snapshot: state, pending: [presented], decision: "confirm"}).status, "clarify");
    assert.equal(runtime.projectProgress(state).milestones[1].status, "blocked");
  }
});
