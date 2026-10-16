import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm, readdir, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:http";
import {parseNotificationSse, createNotificationProtocol, consumeNotificationStream, runNotificationConnection,
  drainNotificationQueue} from "../source/platform/bos-workflow-orchestrator/scripts/journey-notifications.mjs";
import {createNotificationQueue} from "../source/host-runtime/bos-journey-notifications/notification-queue.mjs";
import {createBosExternalDependencyAdapter} from "../source/platform/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs";
import {notificationFixture, ready, changed, bytes, encodeFrame} from "./helpers/synthetic-notifications.mjs";
const collect = async input => { const out = []; for await (const frame of input) out.push(frame); return out; };
const parse = (text, maxFrameBytes = 65536) => collect(parseNotificationSse(bytes(text), {maxFrameBytes}));
async function queue(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "bos-notifications-"));
  t.after(() => rm(root, {recursive: true, force: true}));
  const configuration = {root, binding: {authorityKey: "a".repeat(64), connectionRef: "connection", taskRef: "task", pendingWorkRef: "pending"},
    identities: ["one", "two"], contractKey: "b".repeat(64), replayMaxEvents: 10000,
    assertCurrent: async () => true, scheduleWake: async () => ({accepted: true}), ...options};
  return {root, configuration, queue: await createNotificationQueue(configuration)};
}

test("incremental UTF-8, CR/LF and multiline JSON preserve complete frames", async () => {
  const frame = changed("café", "nc_event");
  for (const newline of ["\n", "\r\n", "\r"]) {
    const text = `\uFEFF: comment${newline}${newline}event: journey.changed${newline}id: nc_event${newline}data: {"identity":${newline}data: "café", "observed_at":"2026-10-16T21:00:00Z"}${newline}${newline}`;
    assert.deepEqual(await parse(text), [frame]);
  }
});

test("framing rejects overflow, invalid UTF-8, duplicate/unknown fields and partial EOF", async () => {
  await assert.rejects(parse(": " + "x".repeat(32) + "\n\n", 32), /limit/);
  await assert.rejects(parse("event: ready\nevent: ready\ndata: {}\n\n"), /duplicate/);
  await assert.rejects(parse("retry: 50\n\n"), /undeclared/);
  await assert.rejects(parse("data: {}\n"), /incomplete/);
  await assert.rejects(collect(parseNotificationSse((async function* () {yield Uint8Array.from([255, 10]);})(), {maxFrameBytes: 64})), /encoded|encoding/);
  const text = encodeFrame(changed("one", "nc_1"));
  assert.equal((await parse(text, Buffer.byteLength(text))).length, 1);
  await assert.rejects(parse(text, Buffer.byteLength(text) - 1), /limit/);
});

test("readiness binds exact watch set, state actions and resume semantics", () => {
  const {contract} = notificationFixture();
  const p = () => createNotificationProtocol(contract, ["one"]);
  p().accept(ready(["one"]));
  const reordered = ready(["one"]); reordered.data.limits = Object.fromEntries(Object.entries(reordered.data.limits).reverse());
  p().accept(reordered);
  assert.throws(() => p().accept(changed("one", "nc_1")), /readiness/);
  assert.throws(() => p().accept(ready(["two"])), /watch set/);
  assert.throws(() => p().accept(ready(["one"], null)), /cursor/);
  assert.throws(() => createNotificationProtocol(contract, ["one"], {resuming: true}).accept(ready(["one"])), /cursor/);
  const foreign = ready(["one"]); foreign.data.journeys[0].state_action.href = "/bos/apps/lead-director/api/v1/organizations/foreign/journeys/one";
  assert.throws(() => p().accept(foreign), /exact read/);
  const protocol = p(); protocol.accept(ready(["one"]));
  assert.throws(() => protocol.accept(changed("two", "nc_1")), /watched/);
});

test("durable enqueue survives recreation and rejected wake without cursor regression", async t => {
  const f = await queue(t, {scheduleWake: async () => ({accepted: false})});
  await f.queue.bootstrap("nc_base");
  const pending = await f.queue.pending();
  await f.queue.enqueue({identity: "one", cursor: "nc_new"});
  await f.queue.acknowledge(pending.find(item => item.identity === "one"));
  assert.equal((await f.queue.pending()).length, 2);
  assert.deepEqual(await f.queue.wake(), {accepted: false});
  const restored = await createNotificationQueue(f.configuration);
  await restored.enqueue({identity: "two", cursor: "nc_base"});
  assert.equal(await restored.cursor(), "nc_new");
  assert.equal((await restored.pending()).length, 2);
  const [partition] = await readdir(f.root);
  assert.equal((await stat(join(f.root, partition, "pending.json"))).mode & 0o777, 0o600);
  await restored.resetCursor();
  assert.equal(await restored.cursor(), null);
  assert.equal((await restored.pending()).length, 2);
});

test("concurrent writers and generations preserve later hints and prototype-shaped identities", async t => {
  const f = await queue(t, {identities: ["one", "__proto__"]});
  const second = await createNotificationQueue(f.configuration);
  await Promise.all([f.queue.enqueue({identity: "one", cursor: "nc_1"}), second.enqueue({identity: "__proto__", cursor: "nc_2"})]);
  const before = await f.queue.pending();
  assert.equal(before.length, 2);
  await second.enqueue({identity: "one", cursor: "nc_3"});
  await Promise.all(before.map(item => f.queue.acknowledge(item)));
  assert.deepEqual((await f.queue.pending()).map(item => item.identity), ["one"]);
});

test("changed authority stops enqueue/wake and a new watch set has a fresh partition", async t => {
  let current = true, wakes = 0;
  const f = await queue(t, {assertCurrent: async () => current, scheduleWake: async () => {wakes++; return {accepted: true};}});
  await f.queue.bootstrap("nc_base"); current = false;
  await assert.rejects(f.queue.enqueue({identity: "one", cursor: "nc_1"}), /authority/);
  await assert.rejects(f.queue.wake(), /authority/); assert.equal(wakes, 0);
  const other = await createNotificationQueue({...f.configuration, identities: ["one"], assertCurrent: async () => true});
  assert.equal(await other.cursor(), null); assert.deepEqual(await other.pending(), []);
  await f.queue.invalidate(); current = true;
  assert.equal(await f.queue.cursor(), null);
});

test("bootstrap queues baseline reads, hints coalesce, and failed delivery remains pending", async t => {
  const f = await queue(t);
  const {contract} = notificationFixture();
  const protocol = createNotificationProtocol(contract, ["one", "two"]);
  await consumeNotificationStream({chunks: bytes(encodeFrame(ready(["one", "two"])) + encodeFrame(changed("one", "nc_1"))), protocol, queue: f.queue});
  assert.equal((await f.queue.pending()).length, 2);
  const adapter = {invokeStateAction: async action => ({status: 200, body: {identity: action.href.split("/").at(-1), status: "completed", outcome: {}}})};
  await assert.rejects(drainNotificationQueue({queue: f.queue, protocol, adapter, deliver: async () => false}), /intended task/);
  assert.equal((await f.queue.pending()).length, 2);
  await drainNotificationQueue({queue: f.queue, protocol, adapter, deliver: async () => true});
  assert.deepEqual(await f.queue.pending(), []);
});

const publicError = (code = "NOTIFICATION_STREAM_UNAVAILABLE", retryable = true) => ({code,
  message: "Read current state.", retryable, correlation_id: "synthetic", details: []});

for (const status of ["completed", "failed", "expired"]) {
  test(`accepted ${status} state removes exactly the acknowledged terminal identity`, async t => {
    const f = await queue(t, {identities: ["one"]});
    const protocol = createNotificationProtocol(notificationFixture().contract, ["one"]);
    await consumeNotificationStream({chunks: bytes(encodeFrame(ready(["one"]))), protocol, queue: f.queue});
    const body = {identity: "one", status, ...(status === "completed" ? {outcome: {}} : {error: publicError("JOURNEY_EXPIRED", false)})};
    const adapter = {invokeStateAction: async () => ({status: 200, body})};
    assert.deepEqual(await drainNotificationQueue({queue: f.queue, protocol, adapter, deliver: async () => true}), {removed: ["one"]});
    assert.deepEqual(await f.queue.pending(), []);
  });
}

test("terminal delivery rejection and a racing newer generation retain monitoring work", async t => {
  const f = await queue(t, {identities: ["one"]});
  const protocol = createNotificationProtocol(notificationFixture().contract, ["one"]);
  await consumeNotificationStream({chunks: bytes(encodeFrame(ready(["one"]))), protocol, queue: f.queue});
  const adapter = {invokeStateAction: async () => ({status: 200, body: {identity: "one", status: "completed", outcome: {}}})};
  await assert.rejects(drainNotificationQueue({queue: f.queue, protocol, adapter, deliver: async () => false}), /intended task/);
  assert.equal((await f.queue.pending()).length, 1);
  const result = await drainNotificationQueue({queue: f.queue, protocol, adapter, deliver: async () => {
    await f.queue.enqueue({identity: "one", cursor: "nc_racing"}); return true;
  }});
  assert.deepEqual(result, {removed: []});
  assert.equal(await f.queue.cursor(), "nc_racing");
  assert.equal((await f.queue.pending()).length, 1);
});

test("terminal removal selects a new remaining-watch partition and fresh baseline", async t => {
  const f = await queue(t), protocol = createNotificationProtocol(notificationFixture().contract, ["one", "two"]);
  protocol.accept(ready(["one", "two"]));
  await f.queue.enqueue({identity: "one", cursor: "nc_terminal"});
  let reads = 0;
  const adapter = {invokeStateAction: async action => {reads++; assert.equal(action.method, "GET");
    return {status: 200, body: {identity: "one", status: "completed", outcome: {}}};}};
  const {removed} = await drainNotificationQueue({queue: f.queue, protocol, adapter, deliver: async () => true});
  const identities = protocol.identities.filter(identity => !removed.includes(identity));
  assert.deepEqual(identities, ["two"]);
  const remaining = await createNotificationQueue({...f.configuration, identities});
  assert.equal(await remaining.cursor(), null);
  const fresh = createNotificationProtocol(notificationFixture().contract, identities);
  await consumeNotificationStream({chunks: bytes(encodeFrame(ready(identities, "nc_remaining"))), protocol: fresh, queue: remaining});
  assert.deepEqual((await remaining.pending()).map(item => item.identity), ["two"]);
  assert.equal(await remaining.cursor(), "nc_remaining"); assert.equal(reads, 1);
});

test("rejected bootstrap and change wakes propagate after durable cursor/pending commit", async t => {
  for (const rejectAt of [1, 2]) {
    let wakes = 0;
    const f = await queue(t, {identities: ["one"], scheduleWake: async () => ({accepted: ++wakes !== rejectAt})});
    const protocol = createNotificationProtocol(notificationFixture().contract, ["one"]);
    const result = await consumeNotificationStream({chunks: bytes(encodeFrame(ready(["one"])) + encodeFrame(changed("one", "nc_change"))), protocol, queue: f.queue});
    assert.deepEqual(result, {next: "host_wake_unavailable"});
    assert.equal(await f.queue.cursor(), rejectAt === 1 ? "nc_baseline" : "nc_change");
    assert.equal((await f.queue.pending()).length, 1);
    assert.equal((await (await createNotificationQueue(f.configuration)).pending()).length, 1);
  }
});

test("a delayed wake retains committed work and its rejection reaches the supervisor", async t => {
  let release, entered;
  const waiting = new Promise(resolve => {entered = resolve;});
  const f = await queue(t, {identities: ["one"], scheduleWake: async () => {
    entered(); return new Promise(resolve => {release = resolve;});
  }});
  const {contract, contact} = notificationFixture();
  const adapter = hostAdapter({openAuthenticatedEventStream: async () => ({status: 200,
    headers: {"content-type": "text/event-stream"}, chunks: bytes(encodeFrame(ready(["one"])))})});
  const running = runNotificationConnection({adapter, sourceContract: contract, contact, identities: ["one"], queue: f.queue});
  await waiting;
  assert.equal(await f.queue.cursor(), "nc_baseline"); assert.equal((await f.queue.pending()).length, 1);
  release({accepted: false});
  assert.deepEqual(await running, {next: "host_wake_unavailable"});
  assert.equal((await f.queue.pending()).length, 1);
});

test("control frames enforce declared codes, retryability and private-detail sanitization", () => {
  const {contract} = notificationFixture();
  const accept = frame => {const p = createNotificationProtocol(contract, ["one"]); p.accept(ready(["one"])); return p.accept(frame);};
  const frame = {event: "stream_error", data: publicError()};
  assert.deepEqual(accept(frame), frame);
  assert.deepEqual(accept({event: "resync_required", data: publicError("NOTIFICATION_RESYNC_REQUIRED", false)}).event, "resync_required");
  for (const data of [publicError("UNDECLARED"), publicError("NOTIFICATION_STREAM_UNAVAILABLE", false),
    {...publicError(), details: [{access_token: "synthetic-private"}]}, {...publicError(), context_handle: "synthetic-private"}]) {
    assert.throws(() => accept({event: "stream_error", data}));
  }
  assert.throws(() => accept({event: "resync_required", data: publicError()}), /gap error/);
  assert.throws(() => accept({...frame, id: "nc_private_control"}), /schema/);
  assert.throws(() => accept({event: "stream_error", data: {...publicError(), identity: "one"}}), /schema/);
});

function hostAdapter(overrides = {}) {
  const transport = {request: async () => {throw new Error("Unexpected ordinary request");},
    recoverAuthentication: async () => {throw new Error("Unexpected recovery");},
    getProtectedResource: async () => "https://dfsm.ai/mcp/apps/bos/platform",
    captureExecutionScope: async () => async () => true, verifyExecutionIntent: async () => true,
    getNotificationCapabilities: async () => ({authenticatedEventStream: true, durableTaskWake: true}),
    scheduleTaskWake: async () => ({accepted: true}), ...overrides};
  return createBosExternalDependencyAdapter({hostTransport: transport, contextProvider: {
    getCurrentContext: async () => ({contract_version: "bos-identity-mcp/v1"}),
    getExecutionContextHeader: async () => "X-BOS-Context-Handle"}});
}

test("supervisor exposes rejected resumed-work wake before opening another stream", async t => {
  const f = await queue(t, {identities: ["one"], scheduleWake: async () => ({accepted: false})});
  await f.queue.bootstrap("nc_saved"); let opens = 0;
  const adapter = hostAdapter({openAuthenticatedEventStream: async () => {opens++; throw new Error("Must remain scheduled by the host");}});
  const {contract, contact} = notificationFixture();
  assert.deepEqual(await runNotificationConnection({adapter, sourceContract: contract, contact, identities: ["one"], queue: f.queue}),
    {next: "host_wake_unavailable"});
  assert.equal(opens, 0); assert.equal(await f.queue.cursor(), "nc_saved");
  assert.equal((await f.queue.pending()).length, 1);
});

test("declared midstream throttling reconnects while access-loss control stays terminal", async t => {
  for (const code of ["RATE_LIMITED", "ACCESS_DENIED"]) {
    const f = await queue(t, {identities: ["one"]});
    const {contract, contact} = notificationFixture();
    contract.public_errors.push({code: "ACCESS_DENIED", message: "Access ended.", retryable: false, http_status: 403});
    contact.error_contract.codes.push("ACCESS_DENIED");
    const error = publicError(code, code === "RATE_LIMITED");
    const adapter = hostAdapter({openAuthenticatedEventStream: async () => ({status: 200,
      headers: {"content-type": "text/event-stream"}, chunks: bytes(encodeFrame(ready(["one"])) + encodeFrame({event: "stream_error", data: error}))})});
    const result = await runNotificationConnection({adapter, sourceContract: contract, contact, identities: ["one"], queue: f.queue, random: () => 0.5});
    assert.deepEqual(result, code === "RATE_LIMITED" ? {next: "reconnect", delayMs: 500} : {next: "stop", error});
    assert.equal(await f.queue.cursor(), "nc_baseline"); assert.equal((await f.queue.pending()).length, 1);
  }
});

test("transient open and midstream transport loss return bounded jitter with saved work", async t => {
  const {contract, contact} = notificationFixture();
  for (const opening of [true, false]) {
    const f = await queue(t, {identities: ["one"]});
    const failure = () => Object.assign(new Error("synthetic transport detail"), {code: "ECONNRESET"});
    const adapter = hostAdapter({openAuthenticatedEventStream: async () => {
      if (opening) throw failure();
      return {status: 200, headers: {"content-type": "text/event-stream"}, chunks: (async function* () {
        yield new TextEncoder().encode(encodeFrame(ready(["one"])) + encodeFrame(changed("one", "nc_committed")));
        throw failure();
      })()};
    }});
    assert.deepEqual(await runNotificationConnection({adapter, sourceContract: contract, contact, identities: ["one"],
      queue: f.queue, attempt: 2, random: () => 0.5}), {next: "reconnect", delayMs: 2000});
    assert.equal(await f.queue.cursor(), opening ? null : "nc_committed");
    assert.equal((await f.queue.pending()).length, opening ? 0 : 1);
  }
});

test("fetch network failures expose only a sanitized transient disposition", async () => {
  const {contact} = notificationFixture();
  const adapter = hostAdapter({openAuthenticatedEventStream: async () => {
    throw new TypeError("fetch failed", {cause: Object.assign(new Error("synthetic private host detail"), {code: "UND_ERR_SOCKET"})});
  }});
  await assert.rejects(adapter.openNotificationStream(contact, {identities: ["one"]}), error => {
    assert.equal(error.kind, "transient");
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.equal(String(error).includes("synthetic private"), false);
    return true;
  });
});

test("cancellation, authority, malformed protocol and persistence errors stay terminal", async t => {
  const {contract, contact} = notificationFixture();
  const f = await queue(t, {identities: ["one"]});
  const args = {sourceContract: contract, contact, identities: ["one"], queue: f.queue};
  const controller = new AbortController();
  const cancelled = hostAdapter({openAuthenticatedEventStream: async () => ({status: 200, headers: {"content-type": "text/event-stream"},
    chunks: (async function* () {yield new TextEncoder().encode(encodeFrame(ready(["one"])));
      controller.abort(); throw Object.assign(new Error("synthetic cancel"), {name: "AbortError"});})()})});
  assert.deepEqual(await runNotificationConnection({...args, adapter: cancelled, signal: controller.signal}), {next: "stop", reason: "cancelled"});
  assert.equal(await f.queue.cursor(), "nc_baseline");
  let current = true;
  const authority = hostAdapter({captureExecutionScope: async () => async () => current,
    openAuthenticatedEventStream: async () => ({status: 200, headers: {"content-type": "text/event-stream"}, chunks: (async function* () {
      current = false; yield new TextEncoder().encode(encodeFrame(ready(["one"], null)));
    })()})});
  await assert.rejects(runNotificationConnection({...args, adapter: authority}), /scope/);
  const stream = text => hostAdapter({openAuthenticatedEventStream: async () => ({status: 200,
    headers: {"content-type": "text/event-stream"}, chunks: bytes(text)})});
  await assert.rejects(runNotificationConnection({...args, adapter: stream("data: {}\n\n")}), /schema/);
  const fresh = await queue(t, {identities: ["one"]});
  const storage = {...fresh.queue, bootstrap: async () => {throw Object.assign(new Error("Protected persistence failed"), {code: "ECONNRESET"});}};
  await assert.rejects(runNotificationConnection({...args, queue: storage, adapter: stream(encodeFrame(ready(["one"])))}), /persistence/);
  const unknown = hostAdapter({openAuthenticatedEventStream: async () => {throw new TypeError("synthetic invalid host implementation");}});
  await assert.rejects(runNotificationConnection({...args, adapter: unknown}), /transport failed/);
});

test("synthetic HTTP stream uses exact route/query and host-owned authentication", async t => {
  const {contract, contact} = notificationFixture(); let seen;
  const server = createServer((req, res) => {seen = {url: req.url, auth: req.headers.authorization, cursor: req.headers["last-event-id"]};
    res.writeHead(200, {"content-type": "text/event-stream"}); res.end(encodeFrame(ready(["café"], null)) + encodeFrame(changed("café", "nc_2")));});
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const adapter = hostAdapter({openAuthenticatedEventStream: async request => {
    assert.equal(request.headers.authorization, undefined);
    const reply = await fetch(`http://127.0.0.1:${server.address().port}${request.href}`, {headers: {...request.headers, authorization: "Bearer synthetic-host-owned"}, signal: request.signal});
    return {status: reply.status, headers: Object.fromEntries(reply.headers), chunks: reply.body};
  }});
  const reply = await adapter.openNotificationStream(contact, {identities: ["café"], cursor: "nc_1"});
  const frames = await collect(parseNotificationSse(reply.chunks, {maxFrameBytes: 65536}));
  assert.equal(frames.length, 2);
  assert.deepEqual(seen, {url: `${contract.execution.uri}?identity=caf%C3%A9`, auth: "Bearer synthetic-host-owned", cursor: "nc_1"});
  await assert.rejects(adapter.invokeDiscoveredOperation(contact), /incremental/);
});

test("unsupported hosts, scope changes, and task intent rejection fail without dispatch", async () => {
  const {contact} = notificationFixture();
  const absent = hostAdapter();
  assert.deepEqual(await absent.getNotificationCapabilities(), {authenticatedEventStream: false, durableTaskWake: false});
  await assert.rejects(absent.openNotificationStream(contact, {identities: ["one"]}), /unavailable/);
  let calls = 0, current = true;
  const adapter = hostAdapter({openAuthenticatedEventStream: async () => ({status: 200, headers: {"content-type": "text/event-stream"},
    chunks: (async function* () {current = false; yield new TextEncoder().encode(encodeFrame(ready(["one"])));})()}),
    captureExecutionScope: async () => async () => current, scheduleTaskWake: async () => {calls++;}, verifyExecutionIntent: async () => false});
  await assert.rejects(adapter.scheduleNotificationWake({taskRef: "task", pendingWorkRef: "pending"}), /review/);
  const reply = await adapter.openNotificationStream(contact, {identities: ["one"]});
  await assert.rejects(collect(reply.chunks), /scope/); assert.equal(calls, 0);
});

test("one connection preserves pending work on replay gap and respects Retry-After", async t => {
  const f = await queue(t); await f.queue.bootstrap("nc_old");
  const {contract, contact} = notificationFixture();
  const args = {sourceContract: contract, contact, identities: ["one", "two"], queue: f.queue, random: () => 0.5};
  const error = {code: "NOTIFICATION_RESYNC_REQUIRED", message: "Read current state.", retryable: false, correlation_id: "synthetic", details: []};
  const adapter = {getNotificationCapabilities: async () => ({authenticatedEventStream: true, durableTaskWake: true}),
    openNotificationStream: async () => ({status: 409, body: {error}})};
  assert.deepEqual(await runNotificationConnection({...args, adapter}), {next: "bootstrap", delayMs: 0});
  assert.equal((await f.queue.pending()).length, 2); assert.equal(await f.queue.cursor(), null);
  error.code = "RATE_LIMITED"; error.retryable = true;
  adapter.openNotificationStream = async () => ({status: 429, headers: {"retry-after": "30"}, body: {error}});
  assert.deepEqual(await runNotificationConnection({...args, adapter}), {next: "reconnect", delayMs: 30000});
});

test("expiry uses one existing recovery cycle and explicit logout remains terminal", async () => {
  const {contact} = notificationFixture();
  const resource = "https://dfsm.ai/mcp/apps/bos/platform";
  const condition = code => ({code, resource});
  let calls = 0, recoveries = 0;
  const adapter = hostAdapter({openAuthenticatedEventStream: async () => ++calls === 1 ? condition("EXPIRED_TOKEN") :
    {status: 200, headers: {"content-type": "text/event-stream"}, chunks: bytes(encodeFrame(ready(["one"])))},
    recoverAuthentication: async request => {recoveries++; assert.equal(request.protected_resource, resource);
      return {schema_version: "bos.authentication-handoff/v1", message_type: "result", protected_resource: resource, status: "READY"};}});
  const reply = await adapter.openNotificationStream(contact, {identities: ["one"]});
  assert.equal((await collect(reply.chunks)).length > 0, true);
  assert.equal(calls, 2); assert.equal(recoveries, 1);
  const stopped = hostAdapter({openAuthenticatedEventStream: async () => condition("REVOKED_GRANT"),
    recoverAuthentication: async () => {throw new Error("Must not sign back in after logout");}});
  await assert.rejects(stopped.openNotificationStream(contact, {identities: ["one"]}), /authority ended/);
});
