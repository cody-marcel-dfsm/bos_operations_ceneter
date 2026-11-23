import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {isDeepStrictEqual} from "node:util";
import {syntheticApiContract, syntheticOperationDescribe} from "./helpers/synthetic-bos-discovery-service.mjs";
import {createBosExternalDependencyAdapter} from "../source/platform/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs";
import {checkCallbackSourceReadiness} from "../source/platform/bos-workflow-orchestrator/scripts/callback-source-readiness.mjs";
import {buildJourneyRegistrationRequest, interpretJourneyResponse} from "../source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs";

const contextHandle = `bos_ctx_v2_${"d".repeat(64)}`;
const resource = "https://dfsm.ai/mcp/apps/bos/platform";
const registration = JSON.parse(await readFile(new URL("./fixtures/journey-registration-contract.json", import.meta.url), "utf8"));

function fixture() {
  // Independently owned consumer fixtures; no server source or schema imports.
  const sourceContract = syntheticApiContract();
  Object.assign(sourceContract, {
    operation: "gmail.trigger", source: {platform: "bos", application: "lead-director", plugin: "gmail"},
    permission: "gmail.messages.read", title: "Configured synthetic callback source",
    input_schema: {$schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: {}, required: [], additionalProperties: false,
      "x-bos-fields": [], "x-bos-callback-source": {
        event_schema: {type: "object", properties: {fields: {type: "object", properties: {}, additionalProperties: false}}, additionalProperties: false},
        match_fields: [], dedupe_fields: []}},
    output_schema: {$schema: "https://json-schema.org/draft/2020-12/schema", type: "object", required: ["ready"], properties: {ready: {type: "boolean"}}, additionalProperties: false, "x-bos-fields": []},
    allowed_references: {}, recovery: {action: "configure_source"},
    public_errors: [{code: "CALLBACK_SOURCE_UNAVAILABLE", message: "The source requires recovery.", retryable: false, http_status: 409}]
  });
  Object.assign(sourceContract.execution, {method: "GET", uri: "/bos/apps/lead-director/api/v1/organizations/synthetic/journey-callback-sources/gmail"});
  const contact = syntheticOperationDescribe().operations[0];
  Object.assign(contact, {operation: sourceContract.operation, input_schema: sourceContract.input_schema,
    output_schema: sourceContract.output_schema, execution: sourceContract.execution,
    sources: [{source: sourceContract.source, availability: "ready"}],
    error_contract: {schema: "lead-director-public-error/v1", codes: ["CALLBACK_SOURCE_UNAVAILABLE"]}});
  return {sourceContract, contact};
}

async function service(t, responses, recoverAuthentication = async () => { throw new Error("No authentication recovery expected"); }) {
  const seen = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    seen.push({method: req.method, url: req.url, body, context: req.headers["x-bos-context-handle"]});
    const reply = responses.shift();
    res.writeHead(reply.status, {"content-type": "application/json"});
    res.end(JSON.stringify(reply.body));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const adapter = createBosExternalDependencyAdapter({
    hostTransport: {
      request: async request => {
        const reply = await fetch(`http://127.0.0.1:${server.address().port}${request.href}`, request);
        return {status: reply.status, body: await reply.json()};
      },
      getProtectedResource: async () => resource,
      recoverAuthentication,
      captureExecutionScope: async () => async () => true,
      verifyExecutionIntent: async ({contract}) => isDeepStrictEqual(contract, fixture().contact)
    },
    contextProvider: {
      getCurrentContext: async () => ({contract_version: "bos-identity-mcp/v2", context: {
        context_handle: contextHandle, organization_name: "Example Organization", application_name: "Lead Director",
        installation_name: "Primary", role_label: "Operator", is_default: true}}),
      getExecutionContextHeader: async () => "X-BOS-Context-Handle"
    }
  });
  return {adapter, seen};
}

test("first use preserves pending authoring across configuration and a fresh source read", async t => {
  const f = fixture();
  const {adapter, seen} = await service(t, [{status: 200, body: {ready: false}}, {status: 200, body: {ready: true}}]);
  const document = {identity: "synthetic callback intent", name: "Pending intent", inputs: {}, entry: "done",
    nodes: [{code: "done", type: "server", inputs: {}, outputs: {}, terminal: true}]};
  const pending = buildJourneyRegistrationRequest(registration, contextHandle, document);
  const original = pending.body;
  const initial = await checkCallbackSourceReadiness({adapter, ...f});
  assert.equal(initial.next, "configure_source");
  assert.deepEqual(initial.recovery, {action: "configure_source"});
  const refreshed = structuredClone(f);
  const ready = await checkCallbackSourceReadiness({adapter, ...refreshed});
  assert.equal(ready.next, "author_journey");
  assert.equal(pending.body, original);
  const action = {verb: "start", method: "POST", payload_schema: null,
    href: "/bos/apps/lead-director/api/v1/organizations/synthetic/journeys/synthetic%20callback%20intent/start?capability=synthetic"};
  assert.deepEqual(interpretJourneyResponse({http_status: 200, body: {
    compiled: true, identity: document.identity, actions: {start: action}}}, {registrationRequest: pending}),
    {next: "invoke_action", action});
  assert.equal(seen.length, 2);
  for (const request of seen) assert.deepEqual(request, {method: "GET", url: f.contact.execution.uri, body: "", context: contextHandle});
});

test("absent setup capability remains explicit and makes no setup mutation", async t => {
  const f = fixture();
  delete f.sourceContract.recovery;
  const {adapter, seen} = await service(t, [{status: 200, body: {ready: false}}]);
  const result = await checkCallbackSourceReadiness({adapter, ...f});
  assert.equal(result.next, "source_unavailable");
  assert.deepEqual(result.recovery, {});
  assert.equal(seen.length, 1);
});

test("source recovery errors remain distinct from production policy readiness", async t => {
  const f = fixture();
  const error = {code: "CALLBACK_SOURCE_UNAVAILABLE", message: "Source recovery is required.",
    retryable: false, correlation_id: "corr_synthetic_source", details: []};
  const {adapter} = await service(t, [{status: 409, body: {error}}]);
  const result = await checkCallbackSourceReadiness({adapter, ...f});
  assert.equal(result.next, "source_unavailable");
  assert.deepEqual(result.error, error);
  assert.equal(Object.hasOwn(result, "policy"), false);
});

test("unrelated, write-capable and stale source contacts fail before transport", async () => {
  let calls = 0;
  const adapter = {invokeDiscoveredOperation: async () => { calls++; return {status: 200, body: {ready: true}}; }};
  for (const mutate of [f => f.contact.execution.uri += "/setup", f => f.contact.effect = "create",
    f => f.contact.execution.method = "POST", f => f.contact.sources[0].source.plugin = "other",
    f => f.contact.sources[0].availability = "unavailable",
    f => f.sourceContract.readiness.status = "unavailable"]) {
    const f = structuredClone(fixture());
    // Detach the independently returned discovery messages before corruption.
    f.contact = structuredClone(f.contact);
    mutate(f);
    await assert.rejects(checkCallbackSourceReadiness({adapter, ...f}));
  }
  assert.equal(calls, 0);
});

test("expired authentication recovers through the same BOS host before repeating the read", async t => {
  const error = {code: "UNAUTHENTICATED", message: "Authentication required.", retryable: false,
    correlation_id: "corr_synthetic_auth", details: []};
  let recoveries = 0;
  const {adapter, seen} = await service(t, [{status: 401, body: {error}}, {status: 200, body: {ready: true}}], async request => {
    recoveries++;
    assert.equal(request.protected_resource, resource);
    return {schema_version: "bos.authentication-handoff/v1", message_type: "result", protected_resource: resource, status: "READY"};
  });
  assert.equal((await checkCallbackSourceReadiness({adapter, ...fixture()})).ready, true);
  assert.equal(recoveries, 1);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], seen[1]);
});

test("current access loss stops readiness and retains the original denial", async t => {
  const error = {code: "FORBIDDEN", message: "Current access does not permit this read.", retryable: false,
    correlation_id: "corr_synthetic_denial", details: []};
  const {adapter, seen} = await service(t, [{status: 403, body: {error}}]);
  const result = await checkCallbackSourceReadiness({adapter, ...fixture()});
  assert.equal(result.next, "access_lost");
  assert.deepEqual(result.error, error);
  assert.equal(seen.length, 1);
});

test("malformed, widened and undeclared source responses fail closed", async () => {
  for (const body of [{}, {ready: "yes"}, {ready: true, account: "synthetic"}]) {
    const adapter = {invokeDiscoveredOperation: async () => ({status: 200, body})};
    await assert.rejects(checkCallbackSourceReadiness({adapter, ...fixture()}), /invalid readiness/);
  }
  const adapter = {invokeDiscoveredOperation: async () => ({status: 409, body: {error: {
    code: "CALLBACK_UNKNOWN", message: "Unknown.", retryable: false, correlation_id: "corr_synthetic", details: []}}})};
  await assert.rejects(checkCallbackSourceReadiness({adapter, ...fixture()}), /undeclared readiness/);
});
