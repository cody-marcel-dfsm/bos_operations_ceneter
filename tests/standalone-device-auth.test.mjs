import assert from "node:assert/strict";
import test from "node:test";
import {BOS_RESOURCE, DEVICE_GRANT, createStandaloneBosTransport} from "../source/platform/bos-mcp-client/scripts/standalone-device-auth.mjs";
const issuer = "https://dfsm.ai";
const device = `${issuer}/api/v1/mcp/oauth/device/authorize`;
const token = `${issuer}/api/v1/mcp/oauth/token`;
const registration = `${issuer}/api/v1/mcp/oauth/register`;
const verification = `${issuer}/api/v1/mcp/oauth/device`;
const challenge = 'Bearer resource_metadata="https://dfsm.ai/.well-known/oauth-protected-resource/mcp/apps/bos/platform", scope="mcp:tools"';
const handoff = {schema_version: "bos.authentication-handoff/v1", message_type: "request",
  protected_resource: BOS_RESOURCE, condition: {category: "authentication", code: "MISSING_GRANT", source: "client_host"}};
const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body),
  {status, headers: {"content-type": "application/json", ...headers}});
function fixture(options = {}) {
  let time = 1000;
  let saved = options.saved ?? null;
  const calls = [], waits = [], challenges = [], storeCalls = [];
  const metadata = {issuer, authorization_endpoint: `${issuer}/api/v1/mcp/oauth/authorize`,
    token_endpoint: token, registration_endpoint: registration, device_authorization_endpoint: device,
    grant_types_supported: [DEVICE_GRANT, "refresh_token", "authorization_code"], token_endpoint_auth_methods_supported: ["none"], ...options.metadata};
  const sequence = [...(options.sequence ?? [{access_token: "synthetic-access", refresh_token: "synthetic-refresh",
    token_type: "Bearer", expires_in: 3600, scope: "mcp:tools offline_access"}])];
  const credentialStore = {async load(key) { storeCalls.push("load"); assert.equal(key, BOS_RESOURCE); return saved; },
    async save(key, value) { storeCalls.push("save"); assert.equal(key, BOS_RESOURCE); saved = structuredClone(value); },
    async delete(key) { storeCalls.push("delete"); assert.equal(key, BOS_RESOURCE); saved = null; }};
  const fetchImpl = async (url, init = {}) => {
    assert.equal(init.redirect, "manual");
    assert.equal(init.credentials, "omit");
    assert.equal(init.referrerPolicy, "no-referrer");
    calls.push({url, init});
    if (url === BOS_RESOURCE && init.method === "GET") return reply({}, 401, {"www-authenticate": challenge});
    if (url.includes("oauth-protected-resource")) return reply({resource: BOS_RESOURCE, authorization_servers: [issuer], ...options.protectedMetadata});
    if (url.endsWith("oauth-authorization-server")) return reply(metadata);
    if (url === registration) {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.grant_types, [DEVICE_GRANT, "refresh_token"]);
      assert.deepEqual(body.redirect_uris, []); assert.deepEqual(body.response_types, []);
      assert.equal(body.token_endpoint_auth_method, "none");
      return reply({...body, client_id: "synthetic-device-client", ...options.registration}, 201);
    }
    if (url === device) {
      assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), {client_id: "synthetic-device-client",
        resource: BOS_RESOURCE, scope: "mcp:tools offline_access"});
      return reply({device_code: "synthetic-private-device-code", user_code: "ABCD-EFGH".replace("-", " "),
        verification_uri: verification, expires_in: 600, interval: 5, ...options.device});
    }
    if (url === token) {
      const params = Object.fromEntries(new URLSearchParams(init.body));
      assert.equal(params.resource, BOS_RESOURCE); assert.equal(params.client_id, "synthetic-device-client");
      if (params.grant_type === DEVICE_GRANT) {
        assert.equal(params.device_code, "synthetic-private-device-code");
        assert.equal(params.redirect_uri, undefined); assert.equal(params.code_verifier, undefined);
      }
      const next = sequence.shift();
      if (next instanceof Error) throw next;
      return reply(next ?? {error: "authorization_pending"}, next?.error ? options.errorStatus ?? 400 : 200);
    }
    if (options.requestReply) return options.requestReply(url, init);
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${saved.access_token}`);
    return reply({result: {ok: true}});
  };
  const transport = createStandaloneBosTransport({credentialStore, fetchImpl,
    presentVerification: async value => { challenges.push(value); return options.presented ?? true; },
    sleep: async ms => { waits.push(ms); time += ms; if (options.onSleep) options.onSleep(); },
    now: () => time, signal: options.signal});
  return {transport, calls, waits, challenges, storeCalls, metadata, saved: () => saved, advance: ms => {time += ms;}, credentialStore};
}

test("device registration and token completion remain private behind the unchanged handoff", async () => {
  const f = fixture();
  const result = await f.transport.recoverAuthentication(handoff);
  assert.deepEqual(result, {schema_version: handoff.schema_version, message_type: "result",
    protected_resource: BOS_RESOURCE, status: "READY"});
  assert.deepEqual(f.challenges, [{verification_uri: verification, user_code: "ABCD EFGH", expires_in: 600}]);
  assert.deepEqual(f.waits, [5000]);
  assert.doesNotMatch(JSON.stringify({result, challenges: f.challenges}), /synthetic-private-device-code|synthetic-access|synthetic-refresh/);
  assert.equal(f.saved().refresh_token, "synthetic-refresh");
  const response = await f.transport.request({method: "POST", href: "/mcp/apps/bos/platform", headers: {"content-type": "application/json"}, body: '{"method":"initialize"}'});
  assert.equal(response.body.result.ok, true);
});

test("pending and slowdown use protocol intervals and one device start", async () => {
  const f = fixture({sequence: [{error: "authorization_pending"}, {error: "slow_down"},
    {error: "authorization_pending"}, {access_token: "a", refresh_token: "r", token_type: "bearer", scope: "mcp:tools", expires_in: 60}]});
  await f.transport.recoverAuthentication(handoff);
  assert.deepEqual(f.waits, [5000, 5000, 10000, 10000]);
  assert.equal(f.calls.filter(call => call.url === device).length, 1);
});

test("429 slowdown honors the same increased interval", async () => {
  const f = fixture({errorStatus: 429, sequence: [{error: "slow_down"}, {access_token: "a", refresh_token: "r", token_type: "bearer", scope: "mcp:tools", expires_in: 60}]});
  await f.transport.recoverAuthentication(handoff);
  assert.deepEqual(f.waits, [5000, 10000]);
});

for (const error of ["access_denied", "expired_token", "invalid_grant", "invalid_client", "invalid_request", "invalid_target", "invalid_scope", "unauthorized_client"]) {
  test(`${error} terminates polling without restart or grant`, async () => {
    const f = fixture({sequence: [{error}]});
    await assert.rejects(f.transport.recoverAuthentication(handoff), value => value.code === error);
    assert.equal(f.calls.filter(call => call.url === token).length, 1);
    assert.equal(f.calls.filter(call => call.url === device).length, 1);
    assert.equal(f.saved().access_token, undefined);
  });
}

test("transport timeout backs off without exposing raw transport data", async () => {
  const f = fixture({sequence: [new Error("secret-callback-code"), {access_token: "a", refresh_token: "r", token_type: "bearer", scope: "mcp:tools", expires_in: 60}]});
  await f.transport.recoverAuthentication(handoff);
  assert.deepEqual(f.waits, [5000, 10000]);
});

test("local expiry stops before another poll and never restarts", async () => {
  const f = fixture({device: {expires_in: 10}, sequence: [{error: "authorization_pending"}]});
  await assert.rejects(f.transport.recoverAuthentication(handoff), value => value.code === "expired_token");
  assert.deepEqual(f.waits, [5000, 5000]);
  assert.equal(f.calls.filter(call => call.url === token).length, 1);
});

test("cancellation during polling makes no subsequent token request", async () => {
  const controller = new AbortController();
  const f = fixture({signal: controller.signal, onSleep: () => controller.abort()});
  await assert.rejects(f.transport.recoverAuthentication(handoff), value => value.code === "cancelled");
  assert.equal(f.calls.filter(call => call.url === token).length, 0);
});

test("parallel recovery shares one protocol transaction", async () => {
  const f = fixture();
  const results = await Promise.all([f.transport.recoverAuthentication(handoff), f.transport.recoverAuthentication(handoff)]);
  assert.ok(results.every(value => value.status === "READY"));
  assert.equal(f.calls.filter(call => call.url === device).length, 1);
});

for (const patch of [
  {metadata: {issuer: "https://example.invalid"}},
  {metadata: {token_endpoint: "https://example.invalid/token"}},
  {metadata: {registration_endpoint: "http://127.0.0.1/register"}},
  {metadata: {device_authorization_endpoint: `${device}?device_code=secret`}},
  {metadata: {grant_types_supported: ["authorization_code", "refresh_token"]}},
  {protectedMetadata: {resource: "https://example.invalid/mcp"}}
]) {
  test(`invalid or unsupported discovery blocks registration: ${JSON.stringify(patch)}`, async () => {
    const f = fixture(patch);
    await assert.rejects(f.transport.recoverAuthentication(handoff));
    assert.equal(f.calls.filter(call => call.url === registration).length, 0);
  });
}

for (const patch of [{verification_uri: "https://example.invalid/verify"}, {expires_in: 601}, {interval: 0}, {user_code: "secret\ncredential"}]) {
  test(`invalid device response never reaches user surface: ${JSON.stringify(patch)}`, async () => {
    const f = fixture({device: patch});
    await assert.rejects(f.transport.recoverAuthentication(handoff), value => value.code === "invalid_device_response");
    assert.deepEqual(f.challenges, []);
    assert.equal(f.calls.filter(call => call.url === token).length, 0);
  });
}

test("confidential or redirect-bearing registration is rejected", async () => {
  const f = fixture({registration: {client_secret: "synthetic-secret"}});
  await assert.rejects(f.transport.recoverAuthentication(handoff), value => value.code === "invalid_registration");
  assert.equal(f.calls.filter(call => call.url === device).length, 0);
});

test("secure storage and direct-user verification are mandatory", () => {
  assert.throws(() => createStandaloneBosTransport({presentVerification() {}}), value => value.code === "secure_store_required");
  assert.throws(() => createStandaloneBosTransport({credentialStore: {load() {}, save() {}, delete() {}}}), value => value.code === "verification_surface_required");
});

test("stored credentials cannot bind a different resource", async () => {
  const f = fixture({saved: {resource: "https://example.invalid/mcp", issuer, client_id: "client", access_token: "secret", expires_at: 99999}});
  await assert.rejects(f.transport.request({method: "GET", href: "/mcp/apps/bos/platform"}), value => value.code === "invalid_secure_record");
  assert.equal(f.calls.length, 0);
});

test("requests do not automatically start user authentication", async () => {
  const f = fixture();
  await assert.rejects(f.transport.request({method: "GET", href: "/mcp/apps/bos/platform"}), value => value.code === "sign_in_required");
  assert.equal(f.calls.length, 0);
});

test("expired access refreshes privately and rotates secure tokens", async () => {
  const f = fixture({sequence: [{access_token: "a", refresh_token: "r", token_type: "bearer", expires_in: 10, scope: "mcp:tools"},
    {access_token: "rotated-access", refresh_token: "rotated-refresh", token_type: "Bearer", expires_in: 60, scope: "mcp:tools"}]});
  await f.transport.recoverAuthentication(handoff); f.advance(11000);
  await f.transport.request({method: "GET", href: "/api/v1/synthetic/read"});
  assert.equal(f.saved().refresh_token, "rotated-refresh");
  const request = f.calls.findLast(call => call.url === token);
  assert.equal(new URLSearchParams(request.init.body).get("grant_type"), "refresh_token");
});

test("invalid refresh clears grant and never starts another login", async () => {
  const f = fixture({sequence: [{access_token: "a", refresh_token: "r", token_type: "bearer", expires_in: 10, scope: "mcp:tools"}, {error: "invalid_grant"}]});
  await f.transport.recoverAuthentication(handoff); f.advance(11000);
  await assert.rejects(f.transport.request({method: "GET", href: "/api/v1/synthetic/read"}), value => value.code === "invalid_grant");
  assert.equal(f.saved().access_token, undefined);
  assert.equal(f.calls.filter(call => call.url === device).length, 1);
});

for (const request of [{method: "GET", href: "https://example.invalid"}, {method: "GET", href: "//example.invalid"},
  {method: "POST", href: "/api/v1/mcp/oauth/token"}, {method: "GET", href: "/api/v1/synthetic/read", headers: {authorization: "Bearer caller-secret"}}]) {
  test(`invalid caller transport request fails before credentials/network: ${JSON.stringify(request)}`, async () => {
    const f = fixture(); await assert.rejects(f.transport.request(request)); assert.equal(f.calls.length, 0);
  });
}

test("handoff rejects caller-selected resource or credential data", async () => {
  const f = fixture();
  await assert.rejects(f.transport.recoverAuthentication({...handoff, access_token: "caller-secret"}), value => value.code === "invalid_handoff");
  await assert.rejects(f.transport.recoverAuthentication({...handoff, protected_resource: "https://example.invalid"}), value => value.code === "invalid_handoff");
  assert.equal(f.calls.length, 0);
});

 test("429 rate_limited backs off without restarting device authorization", async () => {
  const f = fixture({errorStatus: 429, sequence: [{error: "rate_limited"}, {access_token: "a", refresh_token: "r", token_type: "bearer", scope: "mcp:tools", expires_in: 60}]});
  await f.transport.recoverAuthentication(handoff);
  assert.deepEqual(f.waits, [5000, 10000]);
  assert.equal(f.calls.filter(call => call.url === device).length, 1);
 });

test("standalone transport resource matches canonical BOS manifest and native binding", async () => {
  const {readFile} = await import("node:fs/promises");
  const product = JSON.parse(await readFile(new URL("../products/bos/product.json", import.meta.url), "utf8"));
  assert.equal(BOS_RESOURCE, product.mcp_resource_url);
  assert.equal(product.connection_owner, "bos");
  const native = JSON.parse(await readFile(new URL("../clients/codex/plugins/bos/.mcp.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(native.mcpServers).length, 1);
  assert.equal(Object.values(native.mcpServers)[0].url, BOS_RESOURCE);
});

test("malformed metadata lists fail closed before client registration", async () => {
  const f = fixture({metadata: {grant_types_supported: `${DEVICE_GRANT} refresh_token`}});
  await assert.rejects(f.transport.recoverAuthentication(handoff), value => value.code === "device_flow_unavailable");
  assert.equal(f.calls.filter(call => call.url === registration).length, 0);
});

test("untrusted header construction errors cannot reflect caller secret values", async () => {
  const f = fixture();
  await assert.rejects(f.transport.request({method: "GET", href: "/api/v1/synthetic/read",
    headers: {authorization: "caller-secret\ninvalid"}}), value => value.code === "invalid_request_headers" && !value.message.includes("caller-secret"));
  assert.equal(f.calls.length, 0);
});

 test("disabling new device starts preserves refresh of already issued grants", async () => {
  const f = fixture({sequence: [{access_token: "a", refresh_token: "r", token_type: "bearer", expires_in: 10, scope: "mcp:tools"},
    {access_token: "rotated-access", refresh_token: "rotated-refresh", token_type: "Bearer", expires_in: 60, scope: "mcp:tools"}]});
  await f.transport.recoverAuthentication(handoff);
  f.metadata.grant_types_supported = ["authorization_code", "refresh_token"];
  delete f.metadata.device_authorization_endpoint;
  f.advance(11000);
  await f.transport.request({method: "GET", href: "/api/v1/synthetic/read"});
  assert.equal(f.saved().refresh_token, "rotated-refresh");
  await assert.rejects(f.transport.recoverAuthentication(handoff), value => value.code === "device_flow_unavailable");
  assert.equal(f.calls.filter(call => call.url === device).length, 1);
 });

 test("inactive client's unauthorized_client refresh clears tokens without another login", async () => {
  const f = fixture({sequence: [{access_token: "a", refresh_token: "r", token_type: "bearer", expires_in: 10, scope: "mcp:tools"}, {error: "unauthorized_client"}]});
  await f.transport.recoverAuthentication(handoff); f.advance(11000);
  await assert.rejects(f.transport.request({method: "GET", href: "/api/v1/synthetic/read"}), value => value.code === "unauthorized_client");
  assert.equal(f.saved().access_token, undefined);
  assert.equal(f.saved().refresh_token, undefined);
  assert.equal(f.calls.filter(call => call.url === device).length, 1);
 });

for (const href of ["/api/v1/mcp/%6fauth/token", "/%61pi/v1/mcp/oauth/token", "/api%2fv1/mcp/oauth/token",
  "/api/v1/%6fauth/web-callback", "/api/v1/mcp/public%2f..%2foauth/token", "/%2fexample.invalid/token", "/api/v1/synthetic/%invalid"]) {
  test(`decoded route containment precedes secure store and network: ${href}`, async () => {
    const f = fixture();
    await assert.rejects(f.transport.request({method: "POST", href}), value => value.code === "invalid_request_target");
    assert.deepEqual(f.storeCalls, []); assert.deepEqual(f.calls, []);
  });
}

for (const header of ["Host", "Forwarded", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Forwarded-Port",
  "X-Forwarded-For", "X-Original-URL", "X-Rewrite-URL", "Connection", "Transfer-Encoding", "Content-Length", "Origin", "Referer", "Upgrade"]) {
  test(`caller routing and hop override is denied before credential resolution: ${header}`, async () => {
    const f = fixture();
    await assert.rejects(f.transport.request({method: "GET", href: "/api/v1/synthetic/read", headers: {[header]: "synthetic-override"}}),
      value => value.code === "caller_credentials_forbidden");
    assert.deepEqual(f.storeCalls, []); assert.deepEqual(f.calls, []);
  });
}

test("one decoded safe route forwards original URI and approved MCP/context headers", async () => {
  const href = "/api/v1/synthetic/%72ead?limit=1";
  const f = fixture({saved: {resource: BOS_RESOURCE, issuer, client_id: "synthetic-device-client",
    access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_at: 999999}, requestReply: (url, init) => {
    assert.equal(url, `${issuer}${href}`);
    const headers = new Headers(init.headers);
    assert.equal(headers.get("authorization"), "Bearer synthetic-access");
    assert.equal(headers.get("mcp-session-id"), "synthetic-session");
    assert.equal(headers.get("x-bos-context-handle"), "synthetic-context");
    assert.equal(headers.get("mcp-protocol-version"), "2025-06-18");
    return reply({ok: true});
  }});
  assert.equal((await f.transport.request({method: "GET", href, headers: {"mcp-session-id": "synthetic-session",
    "x-bos-context-handle": "synthetic-context", "mcp-protocol-version": "2025-06-18"}})).body.ok, true);
  assert.deepEqual(f.storeCalls, ["load"]);
});

function streamingFixture({chunks, leaveOpen = false, controller, start, keepAlive = false} = {}) {
  let cancelled = false, hold;
  const stream = new ReadableStream({
    start(sink) {
      if (keepAlive) hold = setInterval(() => {}, 1000);
      for (const chunk of chunks ?? []) sink.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
      if (!leaveOpen) sink.close();
      start?.();
    },
    cancel() {cancelled = true; clearInterval(hold);}
  });
  const f = fixture({signal: controller?.signal, saved: {resource: BOS_RESOURCE, issuer, client_id: "synthetic-device-client",
    access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_at: 999999},
    requestReply: () => new Response(stream, {headers: {"content-type": "text/event-stream"}})});
  return {...f, cancelled: () => cancelled};
}
const streamRequest = {method: "POST", href: "/mcp/apps/bos/platform", body: JSON.stringify({jsonrpc: "2.0", id: 55, method: "tools/list"})};

test("SSE selects matching response after notification/wrong ID before stream closes", {timeout: 2000}, async () => {
  const f = streamingFixture({leaveOpen: true, chunks: [
    'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}\n\n',
    'data: {"jsonrpc":"2.0","id":54,"result":{"wrong":true}}\n\n',
    'data: {"jsonrpc":"2.0","id":55,"result":{"tools":[]}}\n\n'
  ]});
  const response = await f.transport.request(streamRequest);
  assert.deepEqual(response.body, {jsonrpc: "2.0", id: 55, result: {tools: []}});
  assert.equal(f.cancelled(), true);
});

test("incremental SSE handles fragmented CRLF, multiline data and split UTF8", async () => {
  const data = ': keepalive\r\nevent: message\r\ndata: {"jsonrpc":"2.0",\r\ndata: "id":55,"result":{"label":"Synthetic café"}}\r\n\r\n';
  const bytes = new TextEncoder().encode(data);
  const f = streamingFixture({leaveOpen: true, chunks: Array.from(bytes, byte => Uint8Array.of(byte))});
  assert.equal((await f.transport.request(streamRequest)).body.result.label, "Synthetic café");
  assert.equal(f.cancelled(), true);
});

test("SSE byte bound cancels open stream before reflecting or buffering oversized payload", async () => {
  const f = streamingFixture({leaveOpen: true, chunks: [new Uint8Array(8388609)]});
  await assert.rejects(f.transport.request(streamRequest), value => value.code === "invalid_response");
  assert.equal(f.cancelled(), true);
});

test("SSE with only another response ID never returns the wrong operation's result", async () => {
  const f = streamingFixture({chunks: ['data: {"jsonrpc":"2.0","id":54,"result":{"wrong":true}}\n\n']});
  await assert.rejects(f.transport.request(streamRequest), value => value.code === "invalid_response");
});

test("cancellation interrupts an open SSE read and cancels its reader", {timeout: 2000}, async () => {
  const controller = new AbortController();
  const f = streamingFixture({controller, leaveOpen: true, start: () => setTimeout(() => controller.abort(), 20)});
  await assert.rejects(f.transport.request(streamRequest), value => value.code === "cancelled");
  assert.equal(f.cancelled(), true);
});

test("transport deadline interrupts a stream with no matching response", {timeout: 20000}, async () => {
  const f = streamingFixture({leaveOpen: true, keepAlive: true});
  await assert.rejects(f.transport.request(streamRequest), value => value.code === "transport_unavailable");
  assert.equal(f.cancelled(), true);
});
