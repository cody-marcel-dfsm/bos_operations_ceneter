import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {validateApiContractResponse} from "../source/platform/bos-app-discovery/scripts/validate-discovery.mjs";
import {validateBoslDocument} from "../source/platform/bos-workflow-orchestrator/scripts/bosl-authoring.mjs";
import {reviewCallbackGrant} from "../source/platform/bos-workflow-orchestrator/scripts/callback-runtime-client.mjs";
import {
  buildJourneyRegistrationRequest,
  buildIdentityV2JourneyActionRequest,
  interpretJourneyResponse,
  runJourneyRecovery
} from "../source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs";

// Consumer-owned localhost contracts and responses establish client behavior.
// These fixtures invoke registration and returned lifecycle actions only.
const registration = JSON.parse(await readFile(new URL("./fixtures/journey-registration-contract.json", import.meta.url), "utf8"));
const context = "bos_ctx_v2_" + "d".repeat(64);
const prefix = "/bos/apps/lead-director/api/v1/organizations/synthetic-org";
const eventSchema = {
  type: "object",
  required: ["kind", "reference"],
  properties: {
    kind: {const: "callback_event"},
    reference: {type: "string", pattern: "^bosevt_[A-Za-z0-9_-]{32}$"}
  },
  additionalProperties: false
};
const event = {kind: "callback_event", reference: "bosevt_" + "s".repeat(32)};
const link = operation => ({contract: {capability: "api.contract.get", input: {operation}}});
const stateAction = name => ({verb: "state", method: "GET", href: `${prefix}/journey-controls/ctrl_${name}`, payload_schema: null});

function fixtures(config) {
  const source = {
    operation: config.source,
    source: {platform: "bos", application: "lead-director", plugin: config.plugin},
    bosl_server_node: false,
    input_schema: {
      type: "object",
      required: config.source === "gmail.trigger" ? [] : ["warehouse"],
      properties: config.source === "gmail.trigger" ? {} : {warehouse: {type: "string", minLength: 1}},
      additionalProperties: false,
      "x-bos-callback-source": {
        event_schema: {type: "object", properties: {fields: {type: "object", properties: config.fields, additionalProperties: false}}, additionalProperties: false},
        match_fields: Object.keys(config.fields).map(field => `$event.fields.${field}`),
        dedupe_fields: [`$event.fields.${config.matchField}`]
      }
    }
  };
  const wait = {
    operation: "bosl.callbacks.await", bosl_server_node: true, node_type: "server",
    input_schema: {type: "object", properties: {callback: {type: "string"}, ttl_seconds: {type: "integer", minimum: 1}}, required: ["callback"], additionalProperties: false},
    output_schema: {type: "object", properties: {event: eventSchema}, required: ["event"], additionalProperties: false},
    allowed_references: {callback: ["literal"], ttl_seconds: ["literal"]},
    limits: {maximum_duration_seconds: 30, maximum_fan_out: 1}
  };
  const sink = {
    operation: config.sink, bosl_server_node: true, node_type: "server",
    input_schema: {type: "object", properties: {event: eventSchema}, required: ["event"], additionalProperties: false},
    output_schema: config.source === "gmail.trigger"
      ? {type: "object", required: ["lead"], properties: {lead: {
          type: "object", required: ["kind", "reference"],
          properties: {kind: {const: "lead"}, reference: {type: "string", pattern: "^boslead_[A-Za-z0-9_-]{32}$"}},
          additionalProperties: false
        }}, additionalProperties: false}
      : {type: "object", properties: {observed: {type: "boolean"}}, required: ["observed"], additionalProperties: false},
    allowed_references: {event: ["server_node_output"]},
    limits: {maximum_duration_seconds: 30, maximum_fan_out: 1}
  };
  const inputs = {[config.matchField]: config.matchValue, ...(config.source === "gmail.trigger" ? {} : {warehouse: "synthetic-warehouse"})};
  const match = {left: {from: `$event.fields.${config.matchField}`}, op: "eq", right: {from: `$journey.inputs.${config.matchField}`}};
  const document = {
    identity: `${config.code} source acceptance`, name: `${config.code} callback source acceptance`, inputs, entry: "wait",
    bootstrap: {
      callbacks: [{
        code: config.code, source: config.source,
        inputs: config.source === "gmail.trigger" ? {} : {warehouse: {from: "$journey.inputs.warehouse"}},
        match: config.source === "gmail.trigger" ? match : {all: [match, {left: {from: "$event.fields.quantity"}, op: "gte", right: {value: 2}}]},
        dedupe_on: [`$event.fields.${config.matchField}`],
        retry: {max_attempts: 4, max_delay_seconds: 240},
        dead_letter: {queue: "journey", retention_seconds: 86400}
      }],
      activate_on: config.code
    },
    nodes: [
      {code: "wait", type: "server", operation: wait.operation, inputs: {callback: {value: config.code}, ttl_seconds: {value: 10}}, outputs: {event: eventSchema}, next: "inspect",
        catch: {cases: [{when: {left: {from: "$error.code"}, op: "eq", right: {value: "CALLBACK_WAIT_EXPIRED"}}, next: "done"}], default: "done"}},
      {code: "inspect", type: "server", operation: sink.operation, inputs: {event: {from: "$nodes.wait.outputs.event"}}, outputs: structuredClone(sink.output_schema.properties), next: "done"},
      {code: "done", type: "server", inputs: {}, outputs: {}, terminal: true}
    ]
  };
  const requested = {queue: "journey", max_attempts: 4, max_delay_seconds: 240, retention_seconds: 86400};
  const report = {
    as_of: "2026-10-14T00:00:00Z",
    callbacks: [{code: config.code, source: config.source, requested, granted: {...requested, max_attempts: 3},
      adjustments: [{field: "max_attempts", requested: 4, granted: 3, reason: "PROFILE_LIMIT"}]}],
    waits: [{code: "wait", callback: config.code, requested: {ttl_seconds: 10}, granted: {ttl_seconds: 10}, adjustments: []}],
    usage: [{resource: "registrations", scope: "organization", visibility: "visible", used: 1, limit: 5, remaining: 4, reserved_by_submission: 1}]
  };
  return {source, wait, sink, document, report};
}

async function runSourceAcceptance(config) {
  const fixture = fixtures(config);
  const received = [];
  const contracts = new Map([registration, fixture.source, fixture.wait, fixture.sink].map(contract => [contract.operation, contract]));
  const parentAction = stateAction(`${config.code}_parent_state`);
  const runAction = stateAction(`${config.code}_selected_run`);
  const startAction = {verb: "start", method: "POST", href: `${prefix}/journeys/${encodeURIComponent(fixture.document.identity)}/start?capability=synthetic-${config.code}`, payload_schema: null};
  let activated = 0, reviewed = false, polls = 0;
  const standing = runs => ({identity: fixture.document.identity, status: "in_progress", registration: {
    callback: config.code, active_since: fixture.report.as_of, expires_at: null, admission_status: "active",
    run_counts: runs.length ? {in_progress: 1} : {}, runs, runs_truncated: false
  }, retry_after_seconds: 30, action: parentAction});
  const wrap = lifecycle => ({workflow_ref: `boswf_synthetic_${config.code}`, target: {kind: "run", identity: fixture.document.identity},
    is_author: false, can_edit: false, lifecycle, actions: {state: runAction}});
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    received.push({method: req.method, href: req.url, context: req.headers["x-bos-context-handle"], raw});
    let status = 200, body;
    try {
      if (req.url === "/fixture/discovery") {
        assert.equal(req.method, "GET");
        body = {journey_registration: link(registration.operation), callback_source: link(config.source), wait: link(fixture.wait.operation), sink: link(config.sink),
          plugins: [{reference: fixture.source.source, describe: {capability: "service.describe", input: {service: fixture.source.source}}}]};
      } else if (req.url === "/fixture/api-contract-get") {
        assert.equal(req.method, "POST");
        const request = JSON.parse(raw);
        assert.deepEqual(Object.keys(request), ["operation"]);
        assert.ok(contracts.has(request.operation));
        body = contracts.get(request.operation);
      } else if (req.url === registration.execution.uri) {
        assert.equal(req.method, "POST");
        assert.deepEqual(JSON.parse(raw), fixture.document);
        assert.equal(activated, 0);
        body = {compiled: true, identity: fixture.document.identity, actions: {start: startAction}, callback_report: fixture.report};
      } else if (req.url === startAction.href) {
        assert.equal(req.method, "POST"); assert.equal(raw, "{}"); assert.equal(reviewed, true);
        activated++; status = 202; body = standing([]);
      } else if (req.url === parentAction.href) {
        assert.equal(req.method, "GET"); assert.equal(raw, "");
        status = 202; body = standing([{status: "in_progress", action: runAction}]);
      } else if (req.url === runAction.href) {
        assert.equal(req.method, "GET"); assert.equal(raw, "");
        if (polls++ === 0) {
          status = 202; body = wrap({identity: fixture.document.identity, status: "in_progress", current_node: {code: "inspect", type: "server", operation: config.sink}, retry_after_seconds: 1, action: runAction});
        } else body = wrap({identity: fixture.document.identity, status: "completed", outcome: {inspected_event: event}});
      } else throw new Error(`Unexpected synthetic request: ${req.method} ${req.url}`);
    } catch (error) {
      status = 500; body = {error: {code: "SYNTHETIC_FIXTURE_FAILED", message: error.message, retryable: false, correlation_id: "corr_callback_source", details: []}};
    }
    res.writeHead(status, {"content-type": "application/json"}); res.end(JSON.stringify(body));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const invoke = async request => {
    const response = await fetch(origin + request.href, request);
    const body = await response.json();
    assert.ok(response.status < 400, body.error?.message);
    return {http_status: response.status, body};
  };
  try {
    const discovery = await (await fetch(origin + "/fixture/discovery")).json();
    const discover = async descriptor => {
      assert.equal(descriptor.contract.capability, "api.contract.get");
      const response = await fetch(origin + "/fixture/api-contract-get", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(descriptor.contract.input)});
      assert.equal(response.status, 200); return response.json();
    };
    const discoveredRegistration = validateApiContractResponse(await discover(discovery.journey_registration), {operation: discovery.journey_registration.contract.input.operation});
    const source = await discover(discovery.callback_source), wait = await discover(discovery.wait), sink = await discover(discovery.sink);
    assert.deepEqual(source.source, discovery.plugins[0].reference);
    assert.deepEqual(discovery.plugins[0].describe.input.service, source.source);
    assert.equal(source.bosl_server_node, false); assert.equal(Object.hasOwn(source, "node_type"), false);
    const options = {publishedSchema: discoveredRegistration.input_schema, callbackSources: [source], operationContracts: [wait, sink]};
    const authored = structuredClone(fixture.document);
    assert.deepEqual(validateBoslDocument(authored, options), {valid: true, findings: []});
    assert.equal(authored.bootstrap.activate_on, config.code); assert.equal(authored.entry, "wait");
    assert.equal(authored.nodes[0].operation, "bosl.callbacks.await");
    assert.deepEqual(authored.nodes[0].outputs.event, eventSchema);
    assert.deepEqual(authored.nodes[1].inputs.event, {from: "$nodes.wait.outputs.event"});
    assert.deepEqual(authored.nodes[1].outputs, sink.output_schema.properties);
    assert.deepEqual(sink.output_schema.required, [config.source === "gmail.trigger" ? "lead" : "observed"]);
    assert.equal(sink.output_schema.additionalProperties, false);
    assert.deepEqual(sink.allowed_references.event, ["server_node_output"]);
    if (config.source !== "gmail.trigger") assert.doesNotMatch(JSON.stringify(authored), /gmail|lead_director|voice/u);

    for (const change of [
      doc => doc.bootstrap.callbacks[0].source = "fixture.missing.trigger",
      doc => {const match = doc.bootstrap.callbacks[0].match; (match.all?.[0] ?? match).left.from = "$event.fields.unadvertised";},
      doc => {const match = doc.bootstrap.callbacks[0].match; (match.all?.[0] ?? match).right = {value: 99};},
      doc => doc.bootstrap.callbacks[0].dedupe_on = ["$event.fields.unadvertised"]
    ]) {
      const invalid = structuredClone(authored); change(invalid);
      assert.equal(validateBoslDocument(invalid, options).valid, false);
    }
    assert.equal(validateBoslDocument(authored, {...options, callbackSources: []}).valid, false);

    const request = buildJourneyRegistrationRequest(discoveredRegistration, context, authored);
    assert.deepEqual(JSON.parse(request.body), fixture.document);
    assert.equal(request.href, discoveredRegistration.execution.uri);
    const submittedBody = request.body;
    authored.nodes[0].inputs.ttl_seconds.value = 99;
    assert.equal(request.body, submittedBody);
    const response = await invoke(request);
    assert.equal(activated, 0);
    assert.throws(() => interpretJourneyResponse(response));
    assert.throws(() => interpretJourneyResponse(response, {registrationRequest: {...request}}));
    assert.equal(Object.isFrozen(request), true);
    assert.throws(() => {request.body = JSON.stringify(authored);}, TypeError);
    assert.equal(request.body, submittedBody);
    for (const change of [
      body => body.identity = "another submitted identity",
      body => body.callback_report.callbacks = [],
      body => body.callback_report.callbacks.push(structuredClone(body.callback_report.callbacks[0])),
      body => body.callback_report.callbacks[0].source = "fixture.different.trigger",
      body => body.callback_report.waits = [],
      body => body.callback_report.waits[0].callback = "another_callback",
      body => body.callback_report.waits[0].requested.ttl_seconds = 11,
      body => body.callback_report.callbacks[0].requested.max_attempts = 5,
      body => body.callback_report.callbacks[0].requested.retention_seconds = 604800
    ]) {
      const invalid = structuredClone(response); change(invalid.body);
      assert.throws(() => interpretJourneyResponse(invalid, {registrationRequest: request}));
      assert.equal(activated, 0);
    }
    const receipt = interpretJourneyResponse(response, {registrationRequest: request});
    assert.equal(receipt.next, "review_callback_grant"); assert.equal(receipt.identity, fixture.document.identity);
    assert.deepEqual(receipt.callback_report, fixture.report);
    assert.deepEqual(receipt.presentation, reviewCallbackGrant(JSON.parse(submittedBody), fixture.report));
    assert.deepEqual(receipt.presentation.callbacks, [{code: config.code, source: config.source, requested: fixture.report.callbacks[0].requested, granted: fixture.report.callbacks[0].granted}]);
    assert.deepEqual(receipt.presentation.usage[0], fixture.report.usage[0]);
    assert.equal(receipt.presentation.waits[0].callback, config.code);
    assert.deepEqual(receipt.presentation.waits[0].requested, {ttl_seconds: 10});
    assert.deepEqual(receipt.presentation.waits[0].granted, {ttl_seconds: 10});
    assert.equal(receipt.presentation.waits[0].lifetime, "10 seconds");
    assert.deepEqual(receipt.action, startAction); reviewed = true;
    const active = interpretJourneyResponse(await invoke(buildIdentityV2JourneyActionRequest(receipt.action, context)));
    assert.equal(active.next, "standing_workflow"); assert.equal(activated, 1);
    const page = interpretJourneyResponse(await invoke(buildIdentityV2JourneyActionRequest(active.action, context)));
    const selected = page.registration.runs[0].action;
    assert.deepEqual(selected, runAction);
    const pending = await invoke(buildIdentityV2JourneyActionRequest(selected, context));
    assert.equal(interpretJourneyResponse(pending).next, "poll_state");
    const recovered = await runJourneyRecovery(pending, {contextHandle: context, wait: async seconds => assert.equal(seconds, 1), invoke});
    const terminal = interpretJourneyResponse(recovered);
    assert.equal(terminal.next, "terminal"); assert.deepEqual(terminal.body.outcome.inspected_event, event);
    assert.equal(activated, 1); assert.equal(polls, 2);
    assert.equal(received.filter(item => item.href === discoveredRegistration.execution.uri).length, 1);
    for (const item of received.filter(item => item.href.startsWith("/bos/"))) {
      assert.equal(item.context, context);
      if (item.method === "GET") assert.equal(item.raw, "");
      assert.ok([discoveredRegistration.execution.uri, startAction.href, parentAction.href, runAction.href].includes(item.href));
    }
  } finally {await new Promise(resolve => server.close(resolve));}
}

test("Gmail standing activation passes the awaited event to the first sanctioned business server node", async () => {
  await runSourceAcceptance({code: "mail", source: "gmail.trigger", plugin: "gmail", sink: "lead_director.leads.from_callback",
    fields: {subject: {type: "string"}}, matchField: "subject", matchValue: "Synthetic inquiry"});
});

test("a second installed callback plugin authors typed matches and passes an awaited event to a safe nonlead successor", async () => {
  await runSourceAcceptance({code: "inventory", source: "fixture.inventory.trigger", plugin: "synthetic-inventory", sink: "fixture.inventory.inspect",
    fields: {item: {type: "string"}, quantity: {type: "integer"}}, matchField: "item", matchValue: "synthetic-item"});
});
