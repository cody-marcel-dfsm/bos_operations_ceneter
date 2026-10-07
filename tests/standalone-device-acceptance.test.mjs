import assert from "node:assert/strict";
import test from "node:test";
import {BOS_RESOURCE, DEVICE_GRANT, createStandaloneBosTransport} from "../source/platform/bos-mcp-client/scripts/standalone-device-auth.mjs";
import {verifyStandaloneDeviceSession} from "../scripts/lib/standalone-device-acceptance.mjs";

function syntheticService({emptyResources = false, rejectedContext = false, denied = false, sse = false} = {}) {
  let record;
  let clock = 1000;
  let approved = false;
  const methods = [], streams = [];
  const issuer = "https://dfsm.ai";
  const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status,
    headers: {"content-type": "application/json", ...headers}});
  const fetchImpl = async (url, init = {}) => {
    if (url === BOS_RESOURCE && init.method === "GET") return json({}, 401, {
      "www-authenticate": 'Bearer resource_metadata="https://dfsm.ai/.well-known/oauth-protected-resource/mcp/apps/bos/platform", scope="mcp:tools"'});
    if (url.includes("oauth-protected-resource")) return json({resource: BOS_RESOURCE, authorization_servers: [issuer]});
    if (url.endsWith("oauth-authorization-server")) return json({issuer,
      authorization_endpoint: `${issuer}/api/v1/mcp/oauth/authorize`,
      token_endpoint: `${issuer}/api/v1/mcp/oauth/token`, registration_endpoint: `${issuer}/api/v1/mcp/oauth/register`,
      device_authorization_endpoint: `${issuer}/api/v1/mcp/oauth/device/authorize`,
      grant_types_supported: [DEVICE_GRANT, "refresh_token"], token_endpoint_auth_methods_supported: ["none"]});
    if (url.endsWith("/register")) return json({...JSON.parse(init.body), client_id: "synthetic-device-client"}, 201);
    if (url.endsWith("/device/authorize")) return json({device_code: "synthetic-private-device-code", user_code: "ABCD EFGH",
      verification_uri: `${issuer}/api/v1/mcp/oauth/device`, expires_in: 600, interval: 5});
    if (url.endsWith("/token")) {
      const body = Object.fromEntries(new URLSearchParams(init.body));
      assert.equal(body.resource, BOS_RESOURCE); assert.equal(body.device_code, "synthetic-private-device-code");
      if (denied) return json({error: "access_denied"}, 400);
      assert.equal(approved, true);
      return json({access_token: "synthetic-access-token", refresh_token: "synthetic-refresh-token",
        token_type: "Bearer", scope: "mcp:tools offline_access", expires_in: 3600});
    }
    assert.equal(url, BOS_RESOURCE);
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer synthetic-access-token");
    const body = JSON.parse(init.body);
    methods.push(body.method);
    if (body.method === "notifications/initialized") return new Response(null, {status: 202});
    if (body.method !== "initialize") assert.equal(new Headers(init.headers).get("mcp-session-id"), "synthetic-private-session");
    let result;
    if (body.method === "initialize") result = {protocolVersion: "2025-06-18", serverInfo: {name: "Synthetic BOS", version: "1"}, capabilities: {tools: {}, resources: {}}};
    else if (body.method === "tools/list") result = {tools: [{name: "bos_get_context", inputSchema: {type: "object"}}]};
    else if (body.method === "tools/call") {
      assert.deepEqual(body.params, {name: "bos_get_context", arguments: {}});
      result = {isError: rejectedContext, structuredContent: {contract_version: "bos-identity-mcp/v2", contexts: [{context_handle: "synthetic-private-handle", organization: "Synthetic Organization", application: "Synthetic Application", role: "Synthetic Role", is_default: true}]}};
    } else if (body.method === "resources/list") result = {resources: emptyResources ? [] : [{uri: "bos://synthetic-describe", name: "Synthetic Describe"}]};
    else if (body.method === "resources/read") {
      assert.deepEqual(body.params, {uri: "bos://synthetic-describe"});
      result = {contents: [{uri: "bos://synthetic-describe", text: '{"synthetic":true}'}]};
    } else throw new Error("Unexpected business operation");
    const payload = {jsonrpc: "2.0", id: body.id, result};
    if (sse) {
      const state = {cancelled: false};
      streams.push(state);
      const text = `data: ${JSON.stringify({jsonrpc: "2.0", method: "notifications/tools/list_changed"})}\n\n` +
        `data: ${JSON.stringify({jsonrpc: "2.0", id: body.id + 100, result: {unrelated: true}})}\n\n` +
        `data: ${JSON.stringify(payload)}\n\n`;
      const bytes = new TextEncoder().encode(text);
      return new Response(new ReadableStream({
        start(sink) {sink.enqueue(bytes.slice(0, 31)); sink.enqueue(bytes.slice(31));},
        cancel() {state.cancelled = true;}
      }), {status: 200, headers: {"content-type": "text/event-stream", "mcp-session-id": "synthetic-private-session"}});
    }
    return json(payload, 200, {"mcp-session-id": "synthetic-private-session"});
  };
  const transport = createStandaloneBosTransport({fetchImpl,
    credentialStore: {async load() {return record;}, async save(_resource, value) {record = value;}, async delete() {record = null;}},
    presentVerification: async value => {assert.deepEqual(Object.keys(value).sort(), ["expires_in", "user_code", "verification_uri"]); approved = true; return true;},
    now: () => clock, sleep: async ms => {clock += ms;}});
  return {transport, methods, streams};
}

for (const sse of [false, true]) {
  test(`assembled device runtime completes user verification, tokens and MCP reads (${sse ? "SSE" : "JSON"})`, async () => {
    const fixture = syntheticService({sse});
    const report = await verifyStandaloneDeviceSession(fixture);
    assert.equal(report.status, "passed"); assert.equal(report.context, true); assert.equal(report.resource_read, "passed");
    if (sse) {assert.equal(fixture.streams.length, 5); assert.ok(fixture.streams.every(stream => stream.cancelled));}
    assert.deepEqual(fixture.methods, ["initialize", "notifications/initialized", "tools/list", "tools/call", "resources/list", "resources/read"]);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-private|synthetic-access-token|synthetic-refresh-token|ABCD|context_handle|bos:\/\/synthetic/);
  });
}

test("no advertised resource reports incomplete without guessing or pretending read passed", async () => {
  const fixture = syntheticService({emptyResources: true});
  const report = await verifyStandaloneDeviceSession(fixture);
  assert.equal(report.status, "incomplete"); assert.equal(report.resource_read, "not_advertised");
  assert.equal(report.error, "readable_resource_missing"); assert.equal(report.context, true);
  assert.equal(fixture.methods.includes("resources/read"), false);
});

test("rejected canonical context stops before resources/business access", async () => {
  const fixture = syntheticService({rejectedContext: true});
  const report = await verifyStandaloneDeviceSession(fixture);
  assert.equal(report.status, "failed"); assert.equal(report.error, "context_failed");
  assert.equal(fixture.methods.includes("resources/list"), false);
});

test("user denial produces sanitized failure and no authenticated MCP method", async () => {
  const fixture = syntheticService({denied: true});
  const report = await verifyStandaloneDeviceSession(fixture);
  assert.equal(report.status, "failed"); assert.equal(report.error, "authentication_or_transport_failed");
  assert.deepEqual(fixture.methods, []);
});

test("live acceptance refuses noninteractive execution before starting authentication", async () => {
  const {spawnSync} = await import("node:child_process");
  const path = new URL("../scripts/verify-bos-device-oauth-live.mjs", import.meta.url);
  for (const args of [[], ["--user-verification"]]) {
    const result = spawnSync(process.execPath, [path.pathname, ...args], {encoding: "utf8", timeout: 5000});
    assert.equal(result.status, 2); assert.equal(result.stdout, "");
    assert.match(result.stderr, /verification/);
  }
});
