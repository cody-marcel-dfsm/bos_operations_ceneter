import {randomBytes, randomUUID} from "node:crypto";
import {join} from "node:path";
import {createNotificationQueue} from "./notification-queue.mjs";
import {digest} from "../bos-shared-cache/document-cache.mjs";
import {NotificationHostError, fail, exact, opaque, hash, protectedRead, privateDirectory, atomicPrivateJson} from "./protected-files.mjs";
import {createNotificationProtocol, parseNotificationSse, drainNotificationQueue} from "../../platform/bos-workflow-orchestrator/scripts/journey-notifications.mjs";
import {buildIdentityV2JourneyActionRequest, validatePublicError} from "../../platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs";

const token = () => randomBytes(24).toString("hex");
class NotificationNetworkError extends NotificationHostError {}
const sleep = (ms, signal) => new Promise(resolve => {
  if (signal.aborted) return resolve();
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
  const timer = setTimeout(done, ms); signal.addEventListener("abort", done, {once: true});
});
const header = (headers, key) => headers?.get?.(key) ?? headers?.[key];
async function boundedBody(reply, maximum) {
  if (!reply.body?.[Symbol.asyncIterator]) fail();
  const chunks = []; let size = 0;
  for await (const chunk of reply.body) { size += chunk.byteLength; if (size > maximum) fail(); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// Only the trusted, host-owned connection supplies these volatile inputs.
// No credential, context handle or action is persisted by this constructor.
export async function createNotificationHost({root, credentialPath, origin, contextHandle, sourceContract, identities,
  taskIntent, lifetimeMs, assertCurrent, scheduleWake, assertSourceCurrent = async () => true, fetchImpl = fetch}) {
  let connection;
  try {
    sourceContract = structuredClone(sourceContract); identities = structuredClone(identities);
    connection = new URL(origin);
    if (connection.protocol !== "https:" || connection.origin !== origin || connection.username || connection.password ||
        !/^bos_ctx_v2_[a-f0-9]{64}$/u.test(contextHandle) ||
        typeof taskIntent !== "string" || !taskIntent.trim() || Buffer.byteLength(taskIntent) > 4000 ||
        !Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1000 || lifetimeMs > 900000 ||
        typeof assertCurrent !== "function" || typeof scheduleWake !== "function" || typeof assertSourceCurrent !== "function") fail();
    createNotificationProtocol(sourceContract, identities);
    if (!sourceContract.execution.uri.startsWith("/") || sourceContract.execution.uri.startsWith("//") ||
        /[?#]/u.test(sourceContract.execution.uri)) fail();
    await privateDirectory(root);
  } catch { fail(); }
  const controller = new AbortController(), generation = randomUUID(), registrationRef = token();
  const binding = {authorityKey: randomBytes(32).toString("hex"), connectionRef: token(), taskRef: token(), pendingWorkRef: token()};
  // Discovery documents can contain volatile signed links. A random per-session
  // contract reference avoids persisting a raw or hashed handle through them.
  const contractKey = randomBytes(32).toString("hex");
  const queuePartition = digest({binding, identities: [...identities].sort(), contractKey});
  const initial = await protectedRead(credentialPath, {maximum: 4096});
  let secret = initial.bytes.toString("utf8").trim(); initial.bytes.fill(0);
  if (!secret || /[\s\p{Cc}\p{Cf}]/u.test(secret)) fail();
  // The digest is process-local comparison state. It never becomes a partition key or receipt.
  const credentialHash = hash(secret), credentialIdentity = initial.identity;
  const recordPath = join(root, `${registrationRef}.json`);
  let retired = false, retirement = null, protocol = null, runActive = false, activeReader = false, workerLeaseUntil = 0;
  const tickets = new Map();
  const timer = setTimeout(() => { void retire().catch(() => {}); }, lifetimeMs); timer.unref();
  const publicBinding = Object.freeze({registrationRef, generation, taskRef: binding.taskRef, pendingWorkRef: binding.pendingWorkRef});
  function retire() {
    if (retirement) return retirement;
    retired = true; secret = ""; tickets.clear();
    // Every rejecting guard and shutdown caller observes the same durable
    // transition. Publish the promise before abort listeners can re-enter.
    retirement = Promise.resolve().then(() => atomicPrivateJson(recordPath,
      {version: 1, ...publicBinding, queuePartition, status: "retired"}));
    controller.abort();
    return retirement;
  }
  const guard = async () => {
    try {
      if (retired || controller.signal.aborted) fail();
      if (await assertCurrent(publicBinding) !== true) throw new NotificationHostError("task");
      if (await assertSourceCurrent() !== true) throw new NotificationHostError("source");
      const current = await protectedRead(credentialPath, {maximum: 4096});
      const same = current.identity === credentialIdentity && hash(current.bytes.toString("utf8").trim()) === credentialHash;
      current.bytes.fill(0);
      if (!same) throw new NotificationHostError("credential");
      return true;
    } catch (error) { await retire(); throw error instanceof NotificationHostError ? error : new NotificationHostError(); }
  };
  const queueRoot = join(root, "queue"); await privateDirectory(queueRoot, {create: true});
  const queue = await createNotificationQueue({root: queueRoot, binding, identities, contractKey,
    replayMaxEvents: sourceContract.execution.response.limits.replay_max_events, assertCurrent: guard,
    scheduleWake: async () => { await guard(); return scheduleWake(publicBinding); }});
  await atomicPrivateJson(recordPath, {version: 1, ...publicBinding, queuePartition, status: "active"}, {replace: false});
  const request = async (href, {stream = false, cursor} = {}) => {
    await guard();
    const url = new URL(href, connection);
    if (!href.startsWith("/") || href.startsWith("//") || url.origin !== origin || url.username || url.password || url.hash) fail();
    const headers = {authorization: `Bearer ${secret}`, "X-BOS-Context-Handle": contextHandle,
      accept: stream ? "text/event-stream" : "application/json", "cache-control": "no-store"};
    if (cursor !== undefined) headers["Last-Event-ID"] = cursor;
    const timeout = stream ? Math.min(lifetimeMs, sourceContract.execution.response.limits.max_connection_seconds * 1000) : 30000;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]);
    let reply;
    try { reply = await fetchImpl(url.href, {method: "GET", headers, redirect: "manual", signal}); }
    catch { if (controller.signal.aborted) fail(); throw new NotificationNetworkError(); }
    await guard();
    if ((reply.url && reply.url !== url.href) || [301, 302, 303, 307, 308, 401, 403].includes(reply.status)) { await retire(); fail(); }
    return reply;
  };
  const state = async action => {
    await guard();
    // Only an action from the latest validated ready frame can reach this path.
    const allowed = identities.some(identity => JSON.stringify(protocol?.stateAction(identity)) === JSON.stringify(action));
    if (!allowed) fail();
    const value = buildIdentityV2JourneyActionRequest(action, contextHandle);
    if (value.method !== "GET" || value.body !== undefined || action.verb !== "state") fail();
    const reply = await request(value.href);
    if (String(header(reply.headers, "content-type")).split(";", 1)[0] !== "application/json") fail();
    const body = await boundedBody(reply, 1024 * 1024); await guard();
    return {status: reply.status, headers: {}, body};
  };
  const runConnection = async () => {
    await guard();
    const cursor = await queue.cursor();
    const current = createNotificationProtocol(sourceContract, identities, {resuming: cursor !== null});
    const href = sourceContract.execution.uri + "?" + current.identities.map(id => `identity=${encodeURIComponent(id)}`).join("&");
    const reply = await request(href, {stream: true, ...(cursor === null ? {} : {cursor})});
    if (reply.status !== 200) {
      const body = await boundedBody(reply, 65536); validatePublicError(body.error);
      const declared = sourceContract.public_errors.some(item => item.code === body.error.code && item.http_status === reply.status && item.retryable === body.error.retryable);
      if (!declared) fail();
      if (reply.status === 409 && body.error.code === "NOTIFICATION_RESYNC_REQUIRED") { await queue.resetCursor(); return {next: "bootstrap", delayMs: 0}; }
      if (![429, 503].includes(reply.status) || !body.error.retryable) { await retire(); return {next: "stop"}; }
      const retry = header(reply.headers, "retry-after");
      if (retry !== null && retry !== undefined && !/^\d{1,5}$/u.test(String(retry))) fail();
      return {next: "reconnect", delayMs: Math.max(current.reconnect.initial_delay_ms, Number(retry ?? 0) * 1000)};
    }
    if (String(header(reply.headers, "content-type")).split(";", 1)[0] !== "text/event-stream") fail();
    const bounded = (async function* () {
      try { for await (const chunk of reply.body) { await guard(); if (!(chunk instanceof Uint8Array)) fail(); yield chunk; } }
      catch (error) { if (error instanceof NotificationHostError) throw error; throw new NotificationNetworkError(); }
    })();
    // Keep receiving hints when no worker has yet been admitted. Pending state is durable.
    for await (const raw of parseNotificationSse(bounded, {maxFrameBytes: current.maxFrameBytes, signal: controller.signal})) {
      await guard(); const frame = current.accept(raw);
      if (frame.event === "ready") {
        protocol = current;
        if (frame.id !== undefined) await queue.bootstrap(frame.id);
      } else if (frame.event === "journey.changed") await queue.enqueue({identity: frame.data.identity, cursor: frame.id});
      else {
        if (frame.event === "resync_required") { await queue.resetCursor(); return {next: "bootstrap", delayMs: 0}; }
        await retire(); return {next: "stop"};
      }
      await queue.wake();
    }
    return {next: "reconnect", delayMs: current.reconnect.initial_delay_ms};
  };
  return Object.freeze({
    binding: publicBinding,
    async assertCurrent() { return guard(); },
    async poll() {
      await guard();
      return {pending: protocol !== null && (await queue.pending()).length > 0,
        wakeEligible: !activeReader && Date.now() >= workerLeaseUntil, ...publicBinding};
    },
    async run() {
      if (runActive) fail(); runActive = true;
      try {
        while (!retired) {
          let next;
          try { next = await runConnection(); }
          catch (error) {
            if (retired) break;
            if (!(error instanceof NotificationNetworkError)) { await retire(); throw error instanceof NotificationHostError ? error : new NotificationHostError(); }
            await guard(); next = {next: "reconnect", delayMs: sourceContract.execution.response.reconnect.max_delay_ms};
          }
          if (next.next === "stop") break;
          await sleep(next.delayMs, controller.signal);
        }
      } finally { runActive = false; await retire(); }
    },
    async readPending() {
      await guard(); if (!protocol || activeReader || Date.now() < workerLeaseUntil) fail(); activeReader = true;
      try {
        // ACK is a separate worker operation. Capture the pre-read generation, so
        // an event arriving during HTTP/delivery survives the older worker ACK.
        tickets.clear();
        const selected = (await queue.pending()).slice(0, 4);
        const deliveries = [];
        const deferredQueue = {pending: async () => selected, acknowledge: async () => false};
        await drainNotificationQueue({queue: deferredQueue, protocol, adapter: {invokeStateAction: state}, deliver: async item => {
          await guard(); const pending = selected.find(row => row.identity === item.identity);
          const ticket = token(); tickets.set(ticket, {identity: item.identity, generation: pending.generation});
          deliveries.push({...item, ticket});
          // The actual worker accepts separately after receiving the state. Never ACK on read/wake.
          return true;
        }});
        workerLeaseUntil = deliveries.length ? Date.now() + 120000 : 0;
        return {taskIntent, taskRef: publicBinding.taskRef, deliveries};
      } finally { activeReader = false; }
    },
    async acknowledge(ticket) {
      await guard(); if (!opaque(ticket) || !tickets.has(ticket)) return false;
      const item = tickets.get(ticket); tickets.delete(ticket);
      if (Date.now() >= workerLeaseUntil) { if (!tickets.size) workerLeaseUntil = 0; return false; }
      if (!tickets.size) workerLeaseUntil = 0;
      return queue.acknowledge(item);
    },
    async retire() { clearTimeout(timer); await retire(); }
  });
}
