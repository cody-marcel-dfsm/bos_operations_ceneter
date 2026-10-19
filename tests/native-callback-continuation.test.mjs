import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm, readFile, writeFile, stat, symlink, realpath, rename, cp} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createNativeReadContract, validateNativeNotificationBatch, validateNativeJourneyState} from "../source/platform/bos-workflow-orchestrator/scripts/native-callback-contract.mjs";
import {createNativeContinuationStore} from "../source/platform/bos-workflow-orchestrator/scripts/native-callback-store.mjs";
import {currentNativeTask} from "../source/platform/bos-workflow-orchestrator/scripts/native-callback-continuation.mjs";
import {notificationFixture, ready, changed} from "./helpers/synthetic-notifications.mjs";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {createServer} from "node:net";
import {digest} from "../source/platform/bos-workflow-orchestrator/scripts/native-callback-contract.mjs";

const context = {context_handle: "synthetic_current_handle", organization_name: "Synthetic organization", application_name: "Lead Director",
  installation_name: "Synthetic installation", role_label: "Synthetic role", is_default: true};
const error = code => ({code, message: "Synthetic read status.", retryable: false, correlation_id: "corr_synthetic", details: []});
const envelope = (result, selected = context, isError = false) => ({isError,
  structuredContent: {contract_version: "bos-identity-mcp/v2", context: selected, result}, _meta: {"bos/context": selected}, content: []});
const base = {ttlMs: 0, cacheScope: "private"};
const notifications = (frames = [ready(["one"])], cursor = frames.filter(item => item.id).at(-1)?.id ?? "nc_base") =>
  envelope({frames, cursor, more: false, retry_after_ms: 1000, ...base});
const stateResponse = (status = "completed", seconds = 1) => envelope({http_status: status === "in_progress" ? 202 : status === "expired" ? 410 : 200,
  body: {identity: "one", status, ...(status === "in_progress" ? {current_node: {code: "synthetic_wait", type: "server", operation: "synthetic.wait"},
    retry_after_seconds: seconds, action: {verb: "state", method: "GET", href: "/bos/synthetic/journeys/one", payload_schema: null}} :
    status === "expired" ? {error: error("JOURNEY_EXPIRED"), expired_at: "2026-10-18T20:00:00Z"} : {outcome: {}})}, headers: {}, ...base}, context, status === "expired");

function catalog(selected = context) {
  const notificationInput = {type: "object", properties: {identity: {type: "array", minItems: 1, maxItems: 100,
    uniqueItems: true, items: {type: "string"}}, cursor: {type: "string"}, wait_seconds: {type: "integer", minimum: 0, maximum: 25}},
    required: ["identity"], additionalProperties: false};
  const failure = {type: "object", properties: {http_status: {type: "integer"}, error: {type: "object"},
    ttlMs: {const: 0}, cacheScope: {const: "private"}}, required: ["http_status", "error", "ttlMs", "cacheScope"], additionalProperties: false};
  const success = {type: "object", properties: {frames: {type: "array", minItems: 1, maxItems: 100,
    items: notificationFixture().contract.output_schema}, cursor: {type: "string"}, more: {type: "boolean"},
    retry_after_ms: {type: "integer"}, ttlMs: {const: 0}, cacheScope: {const: "private"}},
    required: ["frames", "cursor", "more", "retry_after_ms", "ttlMs", "cacheScope"], additionalProperties: false};
  const state = {type: "object", properties: {http_status: {type: "integer"}, body: {type: "object"}, headers: {type: "object"},
    ttlMs: {const: 0}, cacheScope: {const: "private"}}, required: ["http_status", "body", "headers", "ttlMs", "cacheScope"], additionalProperties: false};
  const descriptor = (name, inputSchema, outputSchema) => ({name, description: "Synthetic native read.", inputSchema, outputSchema,
    annotations: {readOnlyHint: true, destructiveHint: false}, _meta: {"bos/contractVersion": "bos-identity-mcp/v2"}});
  return {isError: false, structuredContent: {contract_version: "bos-identity-mcp/v2", context_handle: selected.context_handle, resources: [],
    tools: [descriptor("journeys.notifications.read", notificationInput, {oneOf: [success, failure]}),
      descriptor("journeys.state.read", {type: "object", properties: {identity: {type: "string"}}, required: ["identity"], additionalProperties: false},
        {oneOf: [state, failure]})]}};
}

async function fixture(t, settings = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "bos-native-continuation-")));
  t.after(() => rm(root, {recursive: true, force: true}));
  let now = Date.parse("2026-10-18T20:00:00Z");
  const config = {root, taskIdentity: "synthetic_current_task", sourceKey: "a".repeat(64), clock: () => now};
  const store = await createNativeContinuationStore(config);
  const registration = (await store.create({identities: ["one"], ...settings})).registration;
  const begin = async frames => {
    const plan = await store.plan(registration);
    const native = notifications(frames);
    const result = await store.ingest(registration, {tickId: plan.tickId, context, catalog: catalog(), envelope: native});
    return {plan, native, result};
  };
  return {root, directory: join(root, `queue-${registration}`), config, store, registration, begin, advance: seconds => { now += seconds * 1000; }};
}

const exists = async path => { try { await stat(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } };
async function untilFile(path) {
  for (let attempt = 0; attempt < 500; attempt++) { if (await exists(path)) return; await delay(10); }
  throw new Error("Owned subprocess did not reach its publication barrier");
}
function raceWorker(t, f, method, hold = false) {
  const id = randomUUID(), entered = join(f.root, `${id}.entered`), release = join(f.root, `${id}.release`);
  const child = spawn(process.execPath, [new URL("./helpers/native-callback-race-worker.mjs", import.meta.url).pathname,
    JSON.stringify({root: f.root, registration: f.registration, now: f.config.clock(), method, hold, entered, release})],
  {stdio: ["ignore", "pipe", "pipe"]});
  let stdout = "", stderr = "", settled = false;
  child.stdout.on("data", part => { stdout += part; }); child.stderr.on("data", part => { stderr += part; });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject); child.once("close", (code, signal) => { settled = true; resolve({code, signal, stdout, stderr}); });
  });
  t.after(async () => { if (!settled) child.kill("SIGKILL"); await completion; });
  return {child, completion, entered, release, settled: () => settled};
}

test("contested dead-marker plan and cancel serialize across processes through durable publication", async t => {
  const f = await fixture(t), started = await f.begin([ready(["one"]), changed("one", "nc_contested")]);
  await f.store.finish(f.registration, {tickId: started.plan.tickId}); f.advance(2);
  const before = JSON.parse(await readFile(join(f.directory, "state.json"), "utf8"));
  const marker = JSON.stringify({pid: 2 ** 31 - 2, token: randomUUID()});
  await writeFile(join(f.directory, "mutation.guard"), marker, {mode: 0o600});
  const plan = raceWorker(t, f, "plan", true); await untilFile(plan.entered);
  const cancel = raceWorker(t, f, "cancel"); await delay(100);
  assert.equal(cancel.settled(), false, "a second owner cannot enter before the first durable publication");
  assert.equal(JSON.parse(await readFile(join(f.directory, "state.json"), "utf8")).tick, null);
  await writeFile(plan.release, "release", {mode: 0o600});
  assert.equal((await plan.completion).code, 0); assert.equal((await cancel.completion).code, 0);
  const after = JSON.parse(await readFile(join(f.directory, "state.json"), "utf8"));
  assert.equal(after.status, "CANCELLED"); assert.equal(after.tick, null);
  assert.equal(after.cursor, before.cursor); assert.deepEqual(after.pending, before.pending);
  assert.deepEqual(after.observations, {});
  assert.equal(await readFile(join(f.directory, "mutation.guard"), "utf8"), marker, "no stale recoverer removes a successor's pathname");
  assert.equal((await f.store.plan(f.registration)).next, "stop");
  assert.equal((await f.store.prepareSchedule(f.registration, {client: "codex"})).next, "stop");
});

test("kernel transaction ownership releases after an owned writer crash without unlink recovery", async t => {
  const f = await fixture(t), started = await f.begin([ready(["one"]), changed("one", "nc_crash")]);
  await f.store.finish(f.registration, {tickId: started.plan.tickId}); f.advance(2);
  const before = await f.store.status(f.registration);
  const plan = raceWorker(t, f, "plan", true); await untilFile(plan.entered);
  plan.child.kill("SIGKILL"); assert.equal((await plan.completion).signal, "SIGKILL");
  const cancel = raceWorker(t, f, "cancel"); assert.equal((await cancel.completion).code, 0);
  const after = await f.store.status(f.registration);
  assert.equal(after.status, "CANCELLED"); assert.deepEqual(after.pending, before.pending);
});

test("source upgrade moves legacy state intact and fences an already-held old pathname writer", async t => {
  const f = await fixture(t), started = await f.begin([ready(["one"]), changed("one", "nc_legacy")]);
  await f.store.finish(f.registration, {tickId: started.plan.tickId});
  const before = JSON.parse(await readFile(join(f.directory, "state.json"), "utf8"));
  before.sourceKey = "b".repeat(64); await writeFile(join(f.directory, "state.json"), JSON.stringify(before), {mode: 0o600});
  const legacy = join(f.root, f.registration); await rename(f.directory, legacy);
  const old = raceWorker(t, f, "legacy-write"); await untilFile(old.entered);
  await assert.rejects(f.store.plan(f.registration), /source changed/);
  assert.equal(await exists(legacy), false);
  assert.equal((await f.store.cancel(f.registration)).status, "CANCELLED");
  await writeFile(old.release, "release", {mode: 0o600});
  const result = await old.completion; assert.equal(result.code, 1); assert.match(result.stderr, /ENOENT/);
  const after = JSON.parse(await readFile(join(f.directory, "state.json"), "utf8"));
  assert.equal(after.status, "CANCELLED"); assert.equal(after.cursor, before.cursor);
  assert.deepEqual(after.pending, before.pending); assert.equal(await exists(legacy), false);
});

test("legacy migration rejects foreign tasks and conflicting storage without dropping either queue", async t => {
  const f = await fixture(t), legacy = join(f.root, f.registration);
  await rename(f.directory, legacy);
  const other = await createNativeContinuationStore({...f.config, taskIdentity: "different_task"});
  await assert.rejects(other.status(f.registration), /another native conversation/);
  assert.equal(await exists(legacy), true); assert.equal(await exists(f.directory), false);
  await cp(legacy, f.directory, {recursive: true});
  const saved = await readFile(join(legacy, "state.json"));
  await assert.rejects(f.store.cancel(f.registration), /Two continuation/);
  assert.deepEqual(await readFile(join(legacy, "state.json")), saved);
  assert.deepEqual(await readFile(join(f.directory, "state.json")), saved);
});

test("unavailable kernel mutex fails bounded busy with original pending bytes preserved", async t => {
  const f = await fixture(t), path = join(f.directory, "state.json"), saved = await readFile(path);
  const server = createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen({host: "127.0.0.1",
    port: 32768 + Number.parseInt(digest(join(f.root, f.registration)).slice(0, 4), 16) % 32768, exclusive: true}, resolve); });
  try { await assert.rejects(f.store.cancel(f.registration), /busy/); assert.deepEqual(await readFile(path), saved); }
  finally { await new Promise(resolve => server.close(resolve)); }
});

test("native context catalog and execute wrappers preserve their distinct exact scoped shapes", () => {
  const contract = createNativeReadContract({context, catalog: catalog()});
  assert.equal(validateNativeNotificationBatch({contract, identities: ["one"], cursor: null, waitSeconds: 0,
    envelope: notifications()}).kind, "batch");
  for (const mutate of [value => {delete value._meta;}, value => {value.structuredContent.context = {...context, role_label: "different"};},
    value => {value._meta["bos/context"] = {...context, context_handle: "different"};}, value => {delete value.structuredContent; value.content = [{type: "text", text: "scoped"}];}]) {
    const value = structuredClone(notifications()); mutate(value);
    assert.throws(() => validateNativeNotificationBatch({contract, identities: ["one"], cursor: null, waitSeconds: 0, envelope: value}), /context|structured/);
  }
  const wrongCatalog = catalog(); wrongCatalog.structuredContent.context_handle = "different";
  assert.throws(() => createNativeReadContract({context, catalog: wrongCatalog}), /catalog/);
});

test("scheduler admission requires a persisted initial native cursor and only an own finite single fire", async t => {
  const f = await fixture(t);
  assert.equal((await f.store.prepareSchedule(f.registration, {client: "codex"})).next, "initial_scoped_read_required");
  const a = await f.begin(); await f.store.finish(f.registration, {tickId: a.plan.tickId});
  const schedule = await f.store.prepareSchedule(f.registration, {client: "codex"});
  assert.equal(schedule.next, "native_single_fire");
  assert.equal((await f.store.prepareSchedule(f.registration, {client: "codex"})).next, "await_existing_registration");
  await assert.rejects(f.store.attachSchedule(f.registration, {scheduleNonce: schedule.scheduleNonce, id: "synthetic_own_schedule"}), /actual native receipt/);
  assert.equal((await f.store.attachSchedule(f.registration, {scheduleNonce: schedule.scheduleNonce, id: "synthetic_own_schedule",
    receipt: {id: "synthetic_own_schedule", fixture: true}, singleFireVerified: true, currentTaskVerified: true})).registrationProvesWake, false);
  assert.equal((await f.store.plan(f.registration, {scheduleNonce: "foreign"})).next, "await_own_schedule");
  assert.equal((await f.store.cancel(f.registration)).ownScheduleId, "synthetic_own_schedule");
});

test("protected native queue reopens without persisted handles, actions or state bodies", async t => {
  const f = await fixture(t); await f.begin([ready(["one"]), changed("one", "nc_new")]);
  const restored = await createNativeContinuationStore(f.config);
  assert.equal(Object.keys((await restored.status(f.registration)).pending).length, 1);
  const path = join(f.directory, "state.json"), body = await readFile(path, "utf8");
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal((await stat(f.directory)).mode & 0o777, 0o700);
  for (const absent of [context.context_handle, context.organization_name, "state_action", "payload_schema", "outcome"]) assert.equal(body.includes(absent), false);
  const otherTask = await createNativeContinuationStore({...f.config, taskIdentity: "different_task"});
  await assert.rejects(otherTask.status(f.registration), /another native conversation/);
  const otherSource = await createNativeContinuationStore({...f.config, sourceKey: "b".repeat(64)});
  await assert.rejects(otherSource.plan(f.registration), /source changed/);
  assert.equal((await otherSource.status(f.registration)).sourceMatches, false);
});

for (const seconds of [1, 30, 900]) test(`202 retains pending work and exact service retry timing ${seconds}`, async t => {
  const f = await fixture(t), a = await f.begin();
  const generation = a.result.pending[0].generation;
  const observation = await f.store.observe(f.registration, {tickId: a.plan.tickId, identity: "one", generation,
    context, catalog: catalog(), notificationEnvelope: a.native, stateEnvelope: stateResponse("in_progress", seconds)});
  assert.equal(observation.retryAfterSeconds, seconds);
  assert.equal((await f.store.acknowledgeDelivered(f.registration, {observationRef: observation.observationRef, identity: "one", generation})).acknowledged, true);
  assert.equal((await f.store.status(f.registration)).pending.one, generation);
  await f.store.finish(f.registration, {tickId: a.plan.tickId});
  const schedule = await f.store.prepareSchedule(f.registration, {client: "codex"});
  assert.ok(schedule.dueAt >= Date.parse("2026-10-18T20:00:00Z") + seconds * 1000);
});

test("410 terminal state stays pending until exact intended-task observation ACK", async t => {
  const f = await fixture(t), a = await f.begin(), generation = a.result.pending[0].generation;
  const observation = await f.store.observe(f.registration, {tickId: a.plan.tickId, identity: "one", generation,
    context, catalog: catalog(), notificationEnvelope: a.native, stateEnvelope: stateResponse("expired")});
  assert.equal((await f.store.status(f.registration)).status, "OPEN");
  assert.equal((await f.store.status(f.registration)).pending.one, generation);
  assert.equal((await f.store.acknowledgeDelivered(f.registration, {observationRef: observation.observationRef, identity: "one", generation: generation + 1})).acknowledged, false);
  assert.equal((await f.store.acknowledgeDelivered(f.registration, {observationRef: observation.observationRef, identity: "one", generation})).status, "COMPLETE");
  assert.deepEqual((await f.store.status(f.registration)).pending, {});
});

test("malformed later frame commits no earlier cursor or hint", async t => {
  const f = await fixture(t), plan = await f.store.plan(f.registration);
  const native = notifications([ready(["one"]), changed("one", "nc_valid"), changed("foreign", "nc_wrong")]);
  await assert.rejects(f.store.ingest(f.registration, {tickId: plan.tickId, context, catalog: catalog(), envelope: native}), /scope|schema/);
  const persisted = JSON.parse(await readFile(join(f.directory, "state.json"), "utf8"));
  assert.equal(persisted.cursor, null); assert.deepEqual(persisted.pending, {});
});

test("scope-preserving resync retains original cursor until same-context bootstrap is committed", async t => {
  const f = await fixture(t), first = await f.begin();
  await f.store.finish(f.registration, {tickId: first.plan.tickId}); f.advance(2);
  const plan = await f.store.plan(f.registration), resync = envelope({http_status: 409, error: error("NOTIFICATION_RESYNC_REQUIRED"), ...base}, context, true);
  assert.equal((await f.store.ingest(f.registration, {tickId: plan.tickId, context, catalog: catalog(), envelope: resync})).next, "native_bootstrap_same_context");
  let persisted = JSON.parse(await readFile(join(f.directory, "state.json"), "utf8"));
  assert.equal(persisted.cursor, first.native.structuredContent.result.cursor);
  const bootstrap = notifications([ready(["one"], "nc_fresh")]);
  const foreign = {...context, context_handle: "different_fresh_handle"};
  await assert.rejects(f.store.completeResync(f.registration, {tickId: plan.tickId, context: foreign, catalog: catalog(foreign),
    resyncEnvelope: resync, bootstrapEnvelope: bootstrap}), /context/);
  await f.store.completeResync(f.registration, {tickId: plan.tickId, context, catalog: catalog(), resyncEnvelope: resync, bootstrapEnvelope: bootstrap});
  persisted = JSON.parse(await readFile(join(f.directory, "state.json"), "utf8"));
  assert.equal(persisted.cursor, "nc_fresh"); assert.equal(persisted.resyncRequired, false);
});

for (const [status, code] of [[422, "INVALID_NOTIFICATION_CURSOR"], [403, "NOTIFICATION_ACCESS_LOST"]]) {
  test(`${code} stops automatic continuation and preserves original pending work`, async t => {
    const f = await fixture(t), first = await f.begin();
    await f.store.finish(f.registration, {tickId: first.plan.tickId}); f.advance(2);
    const plan = await f.store.plan(f.registration);
    await f.store.ingest(f.registration, {tickId: plan.tickId, context, catalog: catalog(),
      envelope: envelope({http_status: status, error: error(code), ...base}, context, true)});
    const current = await f.store.status(f.registration);
    assert.equal(current.status, "STOPPED"); assert.equal(Object.keys(current.pending).length, 1);
    assert.equal((await f.store.prepareSchedule(f.registration, {client: "codex"})).next, "stop");
  });
}

test("real host identifiers are required and fixtures create no native authentication or wake claim", () => {
  assert.equal(currentNativeTask("codex", {CODEX_THREAD_ID: "synthetic_current_task"}), "codex:synthetic_current_task");
  assert.equal(currentNativeTask("claude", {CLAUDE_CODE_SESSION_ID: "synthetic_current_session"}), "claude:synthetic_current_session");
  assert.throws(() => currentNativeTask("codex", {}), /actual current/);
});

test("native read admission rejects absent, duplicate or write-capable descriptors and mutation-shaped inputs", () => {
  for (const change of [value => {value.structuredContent.tools.pop();}, value => {value.structuredContent.tools.push(value.structuredContent.tools[0]);},
    value => {value.structuredContent.tools[0].annotations.readOnlyHint = false;}]) {
    const value = catalog(); change(value);
    assert.throws(() => createNativeReadContract({context, catalog: value}), /descriptors/);
  }
  const contract = createNativeReadContract({context, catalog: catalog()});
  assert.throws(() => contract.read("journeys.state.read", {identity: "one", href: "/synthetic/stop", method: "POST"}, stateResponse()), /input/);
});

test("a resumed ready-only result preserves the service cursor and pending generation", async t => {
  const f = await fixture(t), first = await f.begin();
  await f.store.finish(f.registration, {tickId: first.plan.tickId}); f.advance(2);
  const plan = await f.store.plan(f.registration);
  const result = await f.store.ingest(f.registration, {tickId: plan.tickId, context, catalog: catalog(),
    envelope: notifications([ready(["one"], null)], plan.arguments.cursor)});
  assert.equal(result.pending[0].generation, first.result.pending[0].generation);
});

test("a later generation survives a stale observation and ACK after continuation recovery", async t => {
  const f = await fixture(t), first = await f.begin(), generation = first.result.pending[0].generation;
  const observation = await f.store.observe(f.registration, {tickId: first.plan.tickId, identity: "one", generation,
    context, catalog: catalog(), notificationEnvelope: first.native, stateEnvelope: stateResponse()});
  await f.store.finish(f.registration, {tickId: first.plan.tickId}); f.advance(2);
  const next = await f.store.plan(f.registration);
  await f.store.ingest(f.registration, {tickId: next.tickId, context, catalog: catalog(),
    envelope: notifications([ready(["one"], null), changed("one", "nc_later")])});
  assert.equal((await f.store.acknowledgeDelivered(f.registration, {observationRef: observation.observationRef, identity: "one", generation})).acknowledged, false);
  assert.ok((await f.store.status(f.registration)).pending.one > generation);
});

test("state authorization loss immediately stops successors with queued work retained", async t => {
  const f = await fixture(t), first = await f.begin(), generation = first.result.pending[0].generation;
  const result = await f.store.observe(f.registration, {tickId: first.plan.tickId, identity: "one", generation,
    context, catalog: catalog(), notificationEnvelope: first.native,
    stateEnvelope: envelope({http_status: 403, error: error("NOTIFICATION_ACCESS_LOST"), ...base}, context, true)});
  assert.equal(result.next, "stop");
  assert.equal((await f.store.status(f.registration)).pending.one, generation);
});

test("finite tick budget and lifetime preserve pending work while ending scheduler admission", async t => {
  const f = await fixture(t, {maxTicks: 1}), first = await f.begin();
  await f.store.finish(f.registration, {tickId: first.plan.tickId});
  assert.equal((await f.store.status(f.registration)).status, "EXPIRED");
  assert.equal((await f.store.prepareSchedule(f.registration, {client: "codex"})).next, "stop");
  assert.equal(Object.keys((await f.store.status(f.registration)).pending).length, 1);
  const second = await fixture(t, {lifetimeSeconds: 60}); second.advance(61);
  assert.equal((await second.store.plan(second.registration)).status, "EXPIRED");
  await assert.rejects(second.store.create({identities: ["one"], maxTicks: 13}), /finite/);
  await assert.rejects(second.store.create({identities: ["one"], root: "/synthetic/arbitrary"}), /closed/);
});

test("protected queue refuses symbolic-link state and retains an inert legacy dead marker", async t => {
  const f = await fixture(t), path = join(f.directory, "state.json"), saved = await readFile(path);
  const target = join(f.root, "synthetic-target.json"); await writeFile(target, saved, {mode: 0o600});
  await rm(path); await symlink(target, path);
  await assert.rejects(f.store.status(f.registration), /ELOOP|symbolic|Protected/);
  await rm(path); await writeFile(path, saved, {mode: 0o600});
  await writeFile(join(f.directory, "mutation.guard"), JSON.stringify({pid: 2 ** 31 - 2, token: randomUUID()}), {mode: 0o600});
  assert.equal((await f.store.status(f.registration)).status, "OPEN");
});

test("more=true drains with bounded wait0 and duplicate replay preserves exact-generation ACK", async t => {
  const f = await fixture(t), plan = await f.store.plan(f.registration);
  const native = notifications([ready(["one"]), changed("one", "nc_window")]);
  native.structuredContent.result.more = true;
  const first = await f.store.ingest(f.registration, {tickId: plan.tickId, context, catalog: catalog(), envelope: native});
  const generation = first.pending[0].generation;
  const observation = await f.store.observe(f.registration, {tickId: plan.tickId, identity: "one", generation,
    context, catalog: catalog(), notificationEnvelope: native, stateEnvelope: stateResponse()});
  await f.store.finish(f.registration, {tickId: plan.tickId}); f.advance(2);
  assert.equal((await f.store.prepareSchedule(f.registration, {client: "codex"})).next, "bounded_wait_zero_drain_required");
  await assert.rejects(f.store.plan(f.registration, {waitSeconds: 25}), /wait_seconds0/);
  const next = await f.store.plan(f.registration, {waitSeconds: 0});
  assert.equal(next.arguments.cursor, "nc_window"); assert.equal(next.arguments.wait_seconds, 0);
  const second = await f.store.ingest(f.registration, {tickId: next.tickId, context, catalog: catalog(),
    envelope: notifications([ready(["one"], null), changed("one", "nc_window")])});
  assert.equal(second.pending[0].generation, generation);
  assert.equal((await f.store.acknowledgeDelivered(f.registration, {observationRef: observation.observationRef, identity: "one", generation})).acknowledged, true);
});

test("batch cursor cannot advance beyond an omitted event or regress into known replay history", async t => {
  const f = await fixture(t), first = await f.begin();
  await f.store.finish(f.registration, {tickId: first.plan.tickId}); f.advance(2);
  const plan = await f.store.plan(f.registration), native = notifications([ready(["one"], null), changed("one", "nc_included")]);
  native.structuredContent.result.cursor = "nc_omitted";
  await assert.rejects(f.store.ingest(f.registration, {tickId: plan.tickId, context, catalog: catalog(), envelope: native}), /beyond included/);
  const persisted = JSON.parse(await readFile(join(f.directory, "state.json"), "utf8"));
  assert.equal(persisted.cursor, first.native.structuredContent.result.cursor);
});

test("standing child hints retain the watched root identity and returned child actions remain inert", async t => {
  const f = await fixture(t), first = await f.begin([ready(["one"]), changed("one", "nc_child_transition")]);
  const generation = first.result.pending[0].generation, response = stateResponse("in_progress", 30);
  delete response.structuredContent.result.body.current_node;
  response.structuredContent.result.body.registration = {callback: "synthetic", active_since: "2026-10-18T20:00:00Z", expires_at: null,
    admission_status: "active", run_counts: {completed: 2}, runs: [{status: "completed", action:
      {verb: "state", method: "GET", href: "/bos/synthetic/journey-controls/ctrl_inert_child_selection", payload_schema: null}}], runs_truncated: false};
  const observation = await f.store.observe(f.registration, {tickId: first.plan.tickId, identity: "one", generation,
    context, catalog: catalog(), notificationEnvelope: first.native, stateEnvelope: response});
  assert.equal(observation.decision.next, "standing_workflow"); assert.equal(observation.keepPending, true);
  assert.equal(JSON.stringify(observation).includes("ctrl_inert_child_selection"), false);
  const saved = await readFile(join(f.directory, "state.json"), "utf8");
  assert.equal(saved.includes("ctrl_inert_child_selection"), false);
});

test("concurrent protected queue readers preserve the same committed generation", async t => {
  const f = await fixture(t), first = await f.begin();
  const second = await createNativeContinuationStore(f.config);
  const results = await Promise.all(Array.from({length: 12}, (_, index) =>
    (index % 2 ? f.store : second).status(f.registration)));
  assert.ok(results.every(item => item.pending.one === first.result.pending[0].generation));
});

test("prototype-shaped public identities preserve terminal generation acknowledgement", async t => {
  const f = await fixture(t), registration = (await f.store.create({identities: ["__proto__"]})).registration;
  const plan = await f.store.plan(registration), native = notifications([ready(["__proto__"])]);
  const ingested = await f.store.ingest(registration, {tickId: plan.tickId, context, catalog: catalog(), envelope: native});
  const generation = ingested.pending[0].generation, response = stateResponse();
  response.structuredContent.result.body.identity = "__proto__";
  const observation = await f.store.observe(registration, {tickId: plan.tickId, identity: "__proto__", generation,
    context, catalog: catalog(), notificationEnvelope: native, stateEnvelope: response});
  assert.equal((await f.store.acknowledgeDelivered(registration, {observationRef: observation.observationRef, identity: "__proto__", generation})).status, "COMPLETE");
});

test("acknowledging pending observations never resets the finite per-tick state-read budget", async t => {
  const f = await fixture(t, {stateReadsPerTick: 1}), first = await f.begin();
  const generation = first.result.pending[0].generation;
  const input = {tickId: first.plan.tickId, identity: "one", generation, context, catalog: catalog(),
    notificationEnvelope: first.native, stateEnvelope: stateResponse("in_progress", 30)};
  const observation = await f.store.observe(f.registration, input);
  assert.equal((await f.store.acknowledgeDelivered(f.registration, {identity: "one", generation,
    observationRef: observation.observationRef})).acknowledged, true);
  await assert.rejects(f.store.observe(f.registration, input), /finite state-read budget/);
});

const canonicalStateError = (http_status, body, headers = {}) => envelope({http_status, body, headers, ...base}, context, http_status >= 400);

test("producer canonical error flags retain the schema-selected state shape and adapter error distinction", () => {
  const contract = createNativeReadContract({context, catalog: catalog()});
  assert.equal(validateNativeJourneyState({contract, identity: "one", envelope: stateResponse("expired")}).terminal, true);
  assert.equal(validateNativeJourneyState({contract, identity: "one", envelope: canonicalStateError(404, {error: error("JOURNEY_NOT_FOUND")})}).terminal, true);
  const rate = validateNativeJourneyState({contract, identity: "one", envelope: canonicalStateError(429, {error: error("RATE_LIMITED")}, {"Retry-After": "30"})});
  assert.equal(rate.kind, "pending_error"); assert.deepEqual(rate.headers, {"Retry-After": "30"});
  assert.equal(validateNativeJourneyState({contract, identity: "one", envelope: canonicalStateError(403, {error: error("FORBIDDEN")})}).kind, "stop");
  const adapter = envelope({http_status: 503, error: {...error("UNAVAILABLE"), retryable: true}, ...base}, context, true);
  assert.equal(validateNativeJourneyState({contract, identity: "one", envelope: adapter}).kind, "pending_error");
  adapter.structuredContent.result.http_status = 403;
  assert.equal(validateNativeJourneyState({contract, identity: "one", envelope: adapter}).kind, "stop");
  adapter.isError = false;
  assert.throws(() => validateNativeJourneyState({contract, identity: "one", envelope: adapter}), /exact error shape and flag/);
});

test("producer-shaped410 delivers before ACK and stale expiry delivery cannot clear a newer hint", async t => {
  const f = await fixture(t), first = await f.begin();
  const old = await f.store.observe(f.registration, {tickId: first.plan.tickId, identity: "one", generation: first.result.pending[0].generation,
    context, catalog: catalog(), notificationEnvelope: first.native, stateEnvelope: stateResponse("expired")});
  assert.equal((await f.store.status(f.registration)).status, "OPEN");
  await f.store.finish(f.registration, {tickId: first.plan.tickId}); f.advance(2);
  const plan = await f.store.plan(f.registration), native = notifications([ready(["one"], null), changed("one", "nc_after_expiry_read")]);
  const next = await f.store.ingest(f.registration, {tickId: plan.tickId, context, catalog: catalog(), envelope: native});
  assert.equal((await f.store.acknowledgeDelivered(f.registration, {observationRef: old.observationRef, identity: "one", generation: old.generation})).acknowledged, false);
  const generation = next.pending[0].generation;
  assert.equal((await f.store.status(f.registration)).pending.one, generation);
  const current = await f.store.observe(f.registration, {tickId: plan.tickId, identity: "one", generation, context, catalog: catalog(),
    notificationEnvelope: native, stateEnvelope: stateResponse("expired")});
  assert.equal((await f.store.acknowledgeDelivered(f.registration, {observationRef: current.observationRef, identity: "one", generation})).status, "COMPLETE");
});

test("producer-shaped404 remains pending until intended conversation delivery and exact ACK", async t => {
  const f = await fixture(t), first = await f.begin(), generation = first.result.pending[0].generation;
  const observed = await f.store.observe(f.registration, {tickId: first.plan.tickId, identity: "one", generation, context, catalog: catalog(),
    notificationEnvelope: first.native, stateEnvelope: canonicalStateError(404, {error: error("JOURNEY_NOT_FOUND")})});
  assert.equal(observed.next, "deliver_in_current_conversation"); assert.equal(observed.decision.next, "remove_from_watch_set");
  assert.equal((await f.store.status(f.registration)).pending.one, generation);
  assert.equal((await f.store.acknowledgeDelivered(f.registration, {observationRef: observed.observationRef, identity: "one", generation})).status, "COMPLETE");
});

for (const seconds of [1, 30, 900]) test(`producer-shaped429 preserves pending generation and exact retry timing ${seconds}`, async t => {
  const f = await fixture(t, {mode: "active"}), first = await f.begin(), generation = first.result.pending[0].generation;
  const observed = await f.store.observe(f.registration, {tickId: first.plan.tickId, identity: "one", generation, context, catalog: catalog(),
    notificationEnvelope: first.native, stateEnvelope: canonicalStateError(429, {error: error("RATE_LIMITED")}, {"Retry-After": String(seconds)})});
  assert.equal(observed.next, "retain_pending"); assert.equal(observed.observation.headers["Retry-After"], String(seconds));
  assert.equal((await f.store.status(f.registration)).pending.one, generation);
  assert.equal((await f.store.acknowledgeDelivered(f.registration, {observationRef: "not_delivered", identity: "one", generation})).acknowledged, false);
  await f.store.finish(f.registration, {tickId: first.plan.tickId});
  const wait = await f.store.plan(f.registration);
  assert.equal(wait.next, "wait");
  f.advance(seconds); assert.equal((await f.store.plan(f.registration)).next, "native_read");
});

test("filtered producer windows retain included or replay cursors despite unrelated journal activity", () => {
  const contract = createNativeReadContract({context, catalog: catalog()});
  for (const [cursor, frames, result] of [[null, [ready(["one"], "nc_zero"), changed("one", "nc_watched_one")], "nc_watched_one"],
    [null, [ready(["one"], "nc_zero")], "nc_zero"], ["nc_watched_one", [ready(["one"], null)], "nc_watched_one"]]) {
    assert.equal(validateNativeNotificationBatch({contract, identities: ["one"], cursor, waitSeconds: 0,
      envelope: notifications(frames, result)}).cursor, result);
    assert.throws(() => validateNativeNotificationBatch({contract, identities: ["one"], cursor, waitSeconds: 0,
      envelope: notifications(frames, "nc_unincluded_two")}), /beyond included/);
  }
});
