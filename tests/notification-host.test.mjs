import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, realpath, writeFile, readFile, readdir, chmod, symlink, rename, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {createNotificationHost} from "../source/host-runtime/bos-journey-notifications/notification-host.mjs";
import {createCompanionBridge, callCompanion, acquireCompanionLease, readCompanionControl} from "../source/host-runtime/bos-journey-notifications/muse-companion-host.mjs";
import {NotificationHostError, protectedRead, atomicPrivateJson} from "../source/host-runtime/bos-journey-notifications/protected-files.mjs";
import {notificationFixture, ready, changed, encodeFrame} from "./helpers/synthetic-notifications.mjs";

const context = "bos_ctx_v2_" + "1".repeat(64), secret = "synthetic-existing-key";
const until = async condition => { for (let n = 0; n < 300; n++) { if (await condition()) return; await delay(10); } throw new Error("Synthetic host condition timed out"); };
async function fixture(t, {fetch: customFetch, lifetimeMs = 30000} = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "bnh-")));
  const credential = join(root, "existing-credential"); await writeFile(credential, secret + "\n", {mode: 0o600});
  const {contract} = notificationFixture(), chunks = [], requests = [];
  let current = true, source = true, fetches = 0;
  const fetchImpl = customFetch ?? (async (url, options) => {
    requests.push({url, options});
    assert.equal(options.method, "GET"); assert.equal(options.redirect, "manual");
    assert.equal(options.headers.authorization, `Bearer ${secret}`);
    assert.equal(options.headers["X-BOS-Context-Handle"], context);
    if (!url.includes("journey-notifications?")) return new Response(JSON.stringify({identity: "synthetic-journey", status: "completed", outcome: {}}), {headers: {"content-type": "application/json"}});
    fetches++;
    const first = fetches === 1;
    return {status: 200, url, headers: {"content-type": "text/event-stream"}, body: (async function* () {
      yield Buffer.from(encodeFrame(ready(["synthetic-journey"], first ? "nc_first" : null)));
      while (!options.signal.aborted) {
        if (chunks.length) yield Buffer.from(chunks.shift()); else await delay(5);
      }
    })()};
  });
  const host = await createNotificationHost({root, credentialPath: credential, origin: "https://service.example.invalid", contextHandle: context,
    sourceContract: contract, identities: ["synthetic-journey"], taskIntent: "Continue the synthetic registered journey through its returned actions.", lifetimeMs, assertCurrent: async () => current,
    assertSourceCurrent: async () => source, scheduleWake: async () => ({accepted: false}), fetchImpl});
  let running;
  t.after(async () => { try { await host.retire(); await running?.catch(() => {}); } finally { await rm(root, {recursive: true, force: true}); } });
  return {root, credential, host, requests, chunks, contract, retireTask: () => { current = false; }, retireSource: () => { source = false; },
    async start() { running = host.run(); void running.catch(() => {}); await until(async () => (await host.poll()).pending); }};
}

test("real private queue retains pending through state read until explicit worker acceptance", async t => {
  const f = await fixture(t); await f.start();
  const read = await f.host.readPending(); assert.equal(read.deliveries.length, 1);
  assert.equal((await f.host.poll()).pending, true);
  assert.equal(await f.host.acknowledge(read.deliveries[0].ticket), true);
  assert.equal((await f.host.poll()).pending, false);
  assert.equal(f.requests.length, 2);
  const records = (await readdir(f.root)).filter(name => name.endsWith(".json"));
  for (const name of records) { const bytes = await readFile(join(f.root, name), "utf8"); assert.ok(!bytes.includes(secret)); assert.ok(!bytes.includes(context)); }
});
test("an overlapping later hint survives the previous worker ticket", async t => {
  const f = await fixture(t); await f.start();
  const first = await f.host.readPending();
  f.chunks.push(encodeFrame(changed("synthetic-journey", "nc_second")));
  await delay(50);
  assert.equal(await f.host.acknowledge(first.deliveries[0].ticket), false);
  assert.equal((await f.host.poll()).pending, true);
  const second = await f.host.readPending(); assert.equal(await f.host.acknowledge(second.deliveries[0].ticket), true);
  assert.equal(await f.host.acknowledge(second.deliveries[0].ticket), false);
});
test("task, source and credential replacement retire a generation and retain queue bytes", async t => {
  for (const kind of ["task", "source", "content", "inode", "mode"]) await t.test(kind, async t => {
    const f = await fixture(t); await f.start();
    if (kind === "task") f.retireTask();
    if (kind === "source") f.retireSource();
    if (kind === "content") await writeFile(f.credential, "synthetic-replacement");
    if (kind === "inode") { await rename(f.credential, f.credential + ".old"); await writeFile(f.credential, secret + "\n", {mode: 0o600}); }
    if (kind === "mode") await chmod(f.credential, 0o644);
    await assert.rejects(f.host.assertCurrent(), NotificationHostError);
    const record = JSON.parse(await readFile(join(f.root, `${f.host.binding.registrationRef}.json`), "utf8"));
    assert.equal(record.status, "retired");
    const partitions = await readdir(join(f.root, "queue")); assert.equal(partitions.length, 1);
    assert.ok((await readFile(join(f.root, "queue", partitions[0], "pending.json"), "utf8")).includes("synthetic-journey"));
  });
});
test("private file reading refuses symlinks, unsafe modes and duplicate creation", async t => {
  const f = await fixture(t), link = join(f.root, "link"); await symlink(f.credential, link);
  await assert.rejects(protectedRead(link), NotificationHostError);
  await chmod(f.credential, 0o640); await assert.rejects(protectedRead(f.credential), NotificationHostError);
  const path = join(f.root, "new.json"); await atomicPrivateJson(path, {first: true}, {replace: false});
  await assert.rejects(atomicPrivateJson(path, {second: true}, {replace: false}), NotificationHostError);
  assert.deepEqual(JSON.parse(await readFile(path)), {first: true});
});
test("redirect and unauthorized responses disclose no native error or credential", async t => {
  for (const status of [302, 401, 403]) await t.test(String(status), async t => {
    const f = await fixture(t, {fetch: async () => ({status, headers: {location: "https://elsewhere.example.invalid"}})});
    const run = f.host.run(); await delay(30); await f.host.retire(); await run;
    await assert.rejects(f.host.poll(), error => error instanceof NotificationHostError && !String(error).includes(secret));
  });
});
test("actual private IPC accepts fixed task operations and rejects changed bindings and arbitrary operations", async t => {
  const f = await fixture(t); await f.start();
  const bridge = await createCompanionBridge({root: f.root, host: f.host}); t.after(() => bridge.close());
  assert.equal((await callCompanion(bridge.controlPath, "poll")).pending, true);
  await assert.rejects(callCompanion(bridge.controlPath, "request", {href: "https://elsewhere.example.invalid"}), NotificationHostError);
  const control = await readCompanionControl(bridge.controlPath);
  await assert.rejects(callCompanion(bridge.controlPath, "read", {binding: {...control.binding, taskRef: "unrelated-task"}}), NotificationHostError);
  const read = await callCompanion(bridge.controlPath, "read"); assert.equal(read.deliveries.length, 1);
  assert.equal((await callCompanion(bridge.controlPath, "poll")).pending, false);
  assert.equal((await f.host.poll()).pending, true);
  assert.equal((await callCompanion(bridge.controlPath, "ack", {ticket: read.deliveries[0].ticket, accepted: true})).acknowledged, true);
  assert.equal((await callCompanion(bridge.controlPath, "retire")).retired, true);
  await assert.rejects(callCompanion(bridge.controlPath, "read"), NotificationHostError);
});
test("live and malformed runtime leases are preserved; released leases get new references", async t => {
  const f = await fixture(t), release = await acquireCompanionLease(f.root);
  await assert.rejects(acquireCompanionLease(f.root), NotificationHostError);
  const before = JSON.parse(await readFile(join(f.root, "lease.json")));
  await release(); const next = await acquireCompanionLease(f.root);
  assert.notEqual(JSON.parse(await readFile(join(f.root, "lease.json"))).nonce, before.nonce);
  await next(); await writeFile(join(f.root, "lease.json"), "{}", {mode: 0o600});
  await assert.rejects(acquireCompanionLease(f.root), NotificationHostError);
  assert.equal(await readFile(join(f.root, "lease.json"), "utf8"), "{}");
});
test("bounded lifetime retires volatile authority while durable state remains", async t => {
  const f = await fixture(t, {lifetimeMs: 1000}); await f.start();
  const value = await f.host.readPending(); assert.match(value.taskIntent, /synthetic registered journey/u);
  await delay(1100);
  await assert.rejects(f.host.acknowledge(value.deliveries[0].ticket), NotificationHostError);
  const record = JSON.parse(await readFile(join(f.root, `${f.host.binding.registrationRef}.json`)));
  assert.equal(record.status, "retired");
  assert.equal(JSON.parse(await readFile(join(f.root, "queue", record.queuePartition, "pending.json"))).generation, 1);
});
test("volatile input mutation cannot replace the selected route or watch", async t => {
  const f = await fixture(t);
  f.contract.execution.uri = "/unrelated";
  await f.start(); assert.ok(f.requests[0].url.includes("/journey-notifications?identity=synthetic-journey"));
});
test("complete EOF reconnects with the committed cursor and duplicate replay coalesces", async t => {
  let streams = 0;
  const f = await fixture(t, {fetch: async (url, options) => {
    if (!url.includes("journey-notifications?")) return new Response(JSON.stringify({identity: "synthetic-journey", status: "completed", outcome: {}}), {headers: {"content-type": "application/json"}});
    const count = ++streams;
    if (count > 1) assert.equal(options.headers["Last-Event-ID"], "nc_change");
    return {status: 200, url, headers: {"content-type": "text/event-stream"}, body: (async function* () {
      const bytes = Buffer.from(encodeFrame(ready(["synthetic-journey"], count === 1 ? "nc_first" : null)) + encodeFrame(changed("synthetic-journey", "nc_change")));
      yield bytes.subarray(0, 17); yield bytes.subarray(17);
      if (count > 1) while (!options.signal.aborted) await delay(5);
    })()};
  }});
  await f.start(); await until(() => streams === 2); await delay(50);
  const record = JSON.parse(await readFile(join(f.root, `${f.host.binding.registrationRef}.json`)));
  const pending = JSON.parse(await readFile(join(f.root, "queue", record.queuePartition, "pending.json")));
  assert.equal(pending.generation, 2); assert.equal(pending.cursor, "nc_change");
});
test("malformed ready actions never create an arbitrary authenticated request", async t => {
  let requests = 0;
  const frame = ready(["synthetic-journey"]); frame.data.journeys[0].state_action.href = "https://elsewhere.example.invalid/private";
  const f = await fixture(t, {fetch: async (url) => {
    requests++; return {status: 200, url, headers: {"content-type": "text/event-stream"}, body: (async function* () { yield Buffer.from(encodeFrame(frame)); })()};
  }});
  await assert.rejects(f.host.run(), NotificationHostError); assert.equal(requests, 1);
  await assert.rejects(f.host.readPending(), NotificationHostError);
});
