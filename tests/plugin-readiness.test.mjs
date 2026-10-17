import assert from "node:assert/strict";
import test from "node:test";
import {
  validateApiContractResponse, validateDiscoveryRefresh, validateOperationDescription,
  validatePluginsList, validateServiceJourneyDescription
} from "../source/platform/bos-app-discovery/scripts/validate-discovery.mjs";
import {projectContractFacts} from "../source/platform/bos-app-discovery/scripts/project-contract-facts.mjs";
import {syntheticApiContract, syntheticAppDescribe, syntheticOperationDescribe} from "./helpers/synthetic-bos-discovery-service.mjs";

// Client-owned synthetic observations. Producer captures and schemas remain private evidence.
const blockers = ["authorization_required", "configuration_required", "temporarily_unavailable"];
const legacy = ["provider_authorization_required", "source_not_available", "source_temporarily_unavailable"];
const scope = {organization: "Synthetic organization", application: "Synthetic application", installation: "Synthetic installation", role: "Reviewer"};
const recovery = () => ({goal: "inspect_source", instruction: "Read the current source requirements.", requires_user_approval: false});
const requirement = status => ({operation: "synthetic.status", status, requirements: {source: "unavailable"}, recovery: recovery()});
const readiness = status => ({status, requirements: blockers.includes(status) ? [requirement(status)] : []});

function observations(value) {
  const reference = {platform: "bos", application: "lead-director", plugin: "synthetic-directory"};
  const plugin = {reference, name: "Synthetic directory", purpose: "Read source status.", descriptor_etag: "synthetic-status-1",
    describe: {capability: "service.describe", input: {service: reference}}, readiness: structuredClone(value),
    journey: {title: "Inspect source status", inputs: [], steps: [{code: "done", type: "server", description: "Report source status."}], success: "Status reported"}};
  const description = {reference, name: plugin.name, purpose: plugin.purpose, descriptor_etag: plugin.descriptor_etag,
    readiness: structuredClone(value), queries: [{operation: "synthetic.status", purpose: "Read current source status.",
      contract: {capability: "api.contract.get", input: {operation: "synthetic.status"}}}],
    behavior: {title: plugin.journey.title, entry: "done", outcomes: {reported: "Status reported"}, steps: [
      {code: "done", title: "Status reported", kind: "outcome", description: "Report source status.", interfaces: ["Source status"], next: [], terminal: true}]}};
  const plugins = {application: {platform: "bos", application: "lead-director"}, plugins: [plugin]};
  const refresh = {...plugins, bosl: syntheticAppDescribe().bosl};
  const api = syntheticApiContract();
  api.readiness = structuredClone(value);
  return {plugin, description, plugins, refresh, api};
}

function validateEverySurface(value) {
  const o = observations(value);
  const before = structuredClone(o);
  assert.equal(validatePluginsList(o.plugins), o.plugins);
  assert.equal(validateDiscoveryRefresh(o.refresh), o.refresh);
  assert.equal(validateServiceJourneyDescription(o.description, o.plugin), o.description);
  assert.equal(validateApiContractResponse(o.api), o.api);
  const facts = projectContractFacts({documents: [{kind: "api-contract", document: o.api, scope}]});
  assert.equal(facts.guarantee, "validated_declarations_only");
  assert.equal(facts.operations.length, 1);
  assert.deepEqual(o, before, "validation and projection preserve literal presence and values");
  return o;
}

for (const status of ["ready", "not_reported", ...blockers]) {
  test(`canonical ${status} validates on every discovery surface without granting readiness`, () => {
    const o = validateEverySurface(readiness(status));
    assert.equal(o.plugin.readiness.status, status);
    assert.equal(o.description.readiness.status, status);
    assert.equal(o.api.readiness.status, status);
  });
}

for (const status of ["ready", "not_reported"]) {
  test(`${status} omission defaults are read-only and require empty effective requirements`, () => {
    const o = validateEverySurface({status});
    assert(!Object.hasOwn(o.api.readiness, "requirements"));
    const invalid = observations({status, requirements: [requirement(blockers[0])]});
    assert.throws(() => validatePluginsList(invalid.plugins), /readiness and requirements disagree/);
  });
}

for (const status of blockers) {
  for (const value of [{status}, {status, requirements: []}]) {
    test(`${status} rejects ${Object.hasOwn(value, "requirements") ? "empty" : "omitted"} actionable requirements`, () => {
      assert.throws(() => validateApiContractResponse(observations(value).api), /readiness and requirements disagree/);
    });
  }
}

for (const status of legacy) {
  test(`legacy ${status} retains its original requirement and recovery compatibility`, () => {
    validateEverySurface({status, requirements: [{operation: "legacy-operation", status: "legacy-status", requirements: {}, recovery: {}}]});
    assert.throws(() => validatePluginsList(observations({status}).plugins), /requirements must be an array/);
    assert.throws(() => validatePluginsList(observations({status, requirements: []}).plugins), /readiness and requirements disagree/);
  });
}

test("canonical recovery permits only declared omission defaults and exact typed values", () => {
  const value = readiness(blockers[0]);
  validateEverySurface(value);
  assert.deepEqual(value.requirements[0].recovery, recovery());
  Object.assign(value.requirements[0].recovery, {operation: null, approval_scope: []});
  validateEverySurface(value);
  Object.assign(value.requirements[0].recovery, {operation: "synthetic.recover", approval_scope: ["", "read_source"]});
  validateEverySurface(value);
  // JSON Schema string lengths count Unicode code points and permit whitespace.
  Object.assign(value.requirements[0].recovery, {goal: "😀".repeat(255), instruction: " ".repeat(2000)});
  validateEverySurface(value);
});

const malformed = [
  ["unknown readiness", value => { value.status = "unknown"; }],
  ["extra readiness field", value => { value.available = true; }],
  ["null requirements", value => { value.requirements = null; }],
  ["non-array requirements", value => { value.requirements = {}; }],
  ["missing requirement operation", value => { delete value.requirements[0].operation; }],
  ["nonsemantic operation", value => { value.requirements[0].operation = "read"; }],
  ["unknown requirement status", value => { value.requirements[0].status = "ready"; }],
  ["legacy requirement status in canonical state", value => { value.requirements[0].status = legacy[0]; }],
  ["missing requirement status", value => { delete value.requirements[0].status; }],
  ["extra requirement field", value => { value.requirements[0].available = true; }],
  ["missing nested requirements", value => { delete value.requirements[0].requirements; }],
  ["array nested requirements", value => { value.requirements[0].requirements = []; }],
  ["missing recovery", value => { delete value.requirements[0].recovery; }],
  ["empty recovery", value => { value.requirements[0].recovery = {}; }],
  ["extra recovery field", value => { value.requirements[0].recovery.approved = true; }],
  ["empty recovery goal", value => { value.requirements[0].recovery.goal = ""; }],
  ["oversized recovery goal", value => { value.requirements[0].recovery.goal = "😀".repeat(256); }],
  ["empty recovery instruction", value => { value.requirements[0].recovery.instruction = ""; }],
  ["oversized recovery instruction", value => { value.requirements[0].recovery.instruction = "x".repeat(2001); }],
  ["nonstring recovery instruction", value => { value.requirements[0].recovery.instruction = false; }],
  ["nonsemantic recovery operation", value => { value.requirements[0].recovery.operation = "read"; }],
  ["nonstring recovery operation", value => { value.requirements[0].recovery.operation = {}; }],
  ["missing approval boolean", value => { delete value.requirements[0].recovery.requires_user_approval; }],
  ["untyped approval", value => { value.requirements[0].recovery.requires_user_approval = "false"; }],
  ["null approval scope", value => { value.requirements[0].recovery.approval_scope = null; }],
  ["nonstring approval scope item", value => { value.requirements[0].recovery.approval_scope = [true]; }]
];
for (const [name, change] of malformed) {
  test(`rejects ${name} before producing declaration facts`, () => {
    const value = readiness(blockers[0]);
    change(value);
    const o = observations(value);
    assert.throws(() => validatePluginsList(o.plugins));
    assert.throws(() => validateDiscoveryRefresh(o.refresh));
    assert.throws(() => validateServiceJourneyDescription(o.description, o.plugin));
    assert.throws(() => validateApiContractResponse(o.api));
    assert.throws(() => projectContractFacts({documents: [{kind: "api-contract", document: o.api, scope}]}));
  });
}

test("HTTP source availability retains its own states and never accepts not_reported", () => {
  for (const status of ["ready", ...blockers, ...legacy]) {
    const description = syntheticOperationDescribe();
    description.operations[0].sources[0].availability = status;
    assert.equal(validateOperationDescription(description), description);
  }
  const description = syntheticOperationDescribe();
  description.operations[0].sources[0].availability = "not_reported";
  assert.throws(() => validateOperationDescription(description), /availability is invalid/);
});

test("canonical readiness acceptance preserves required complete operation limits", () => {
  for (const field of ["max_targets", "max_results_per_source", "pagination_supported", "bulk_supported", "streaming_supported"]) {
    const o = observations({status: "not_reported"});
    delete o.api.limits[field];
    assert.throws(() => validateApiContractResponse(o.api), /limits/);
    assert.throws(() => projectContractFacts({documents: [{kind: "api-contract", document: o.api, scope}]}), /limits/);
  }
});
