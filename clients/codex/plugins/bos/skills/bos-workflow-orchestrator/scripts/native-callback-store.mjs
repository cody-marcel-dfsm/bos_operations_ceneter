import {constants} from "node:fs";
import {open, mkdir, lstat, realpath, chmod, rename, rm} from "node:fs/promises";
import {join, isAbsolute} from "node:path";
import {randomUUID} from "node:crypto";
import {createServer} from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {canonical, digest, opaque, createNativeReadContract, validateNativeNotificationBatch,
  validateNativeJourneyState} from "./native-callback-contract.mjs";
import {normalizeNotificationIdentities} from "./journey-notifications.mjs";

const object = value => value && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const reference = value => typeof value === "string" && /^[a-f0-9-]{36}$/u.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const integer = (value, low, high) => Number.isSafeInteger(value) && value >= low && value <= high;

async function privateDirectory(path) {
  await mkdir(path, {recursive: true, mode: 0o700});
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.()) {
    throw new Error("Current-user protected continuation storage is unavailable.");
  }
  await chmod(path, 0o700);
}

async function readPrivate(path, maximum = 2 * 1024 * 1024, maxLinks = 1, allowUnlinked = false) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink < (allowUnlinked ? 0 : 1) || stat.nlink > maxLinks ||
        stat.uid !== process.getuid?.() || (stat.mode & 0o077) || stat.size > maximum) {
      throw new Error("Protected continuation state has unsafe ownership, mode or type.");
    }
    return JSON.parse(await file.readFile("utf8"));
  } finally { await file.close(); }
}

// A short exclusive loopback bind is a kernel-owned mutex, with no protocol or
// application data. Exit releases it without reclaiming any pathname. Hash
// collisions/unavailable loopback fail busy, preserving the queue. Node20/POSIX
// supplies this primitive without Python, addons or a resident service.
async function transaction(directory, operation) {
  const server = createServer({pauseOnConnect: true}, socket => socket.destroy());
  server.maxConnections = 1;
  const address = {host: "127.0.0.1", port: 32768 + Number.parseInt(digest(directory).slice(0, 4), 16) % 32768,
    exclusive: true};
  let acquired = false;
  let failure;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      acquired = await new Promise((resolve, reject) => {
        const failed = error => { server.removeListener("listening", listened);
          if (error.code === "EADDRINUSE") resolve(false); else reject(new Error("Local kernel queue exclusion is unavailable; preserve pending work.")); };
        const listened = () => { server.removeListener("error", failed); resolve(true); };
        server.once("error", failed); server.once("listening", listened); server.listen(address);
      });
      if (acquired) break;
      await delay(10);
    }
    if (!acquired) throw new Error("The current continuation queue is busy; preserve pending work.");
    server.on("error", error => { failure = error; });
    const assertHeld = () => {
      if (!server.listening || failure) throw new Error("Kernel queue transaction ownership was lost; preserve pending work.");
    };
    assertHeld();
    return await operation(assertHeld);
  } finally {
    if (acquired) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function writePrivate(directory, state, assertHeld = () => {}) {
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  let file;
  try {
    file = await open(temporary, "wx", 0o600);
    await file.writeFile(canonical(state)); await file.sync(); await file.close(); file = null;
    assertHeld();
    await rename(temporary, join(directory, "state.json"));
    const folder = await open(directory, "r");
    try { await folder.sync(); } finally { await folder.close(); }
  } finally { await file?.close(); await rm(temporary, {force: true}); }
}

function policy(input) {
  if (!object(input) || Object.keys(input).some(key => !["mode", "cadenceSeconds", "lifetimeSeconds", "maxTicks", "stateReadsPerTick"].includes(key))) {
    throw new Error("Native observation policy accepts only its closed finite settings.");
  }
  const result = {mode: input.mode ?? "scheduled", cadenceSeconds: input.cadenceSeconds ?? 300,
    lifetimeSeconds: input.lifetimeSeconds ?? 1800, maxTicks: input.maxTicks ?? 6, stateReadsPerTick: input.stateReadsPerTick ?? 3};
  if (!["active", "scheduled"].includes(result.mode) || !integer(result.cadenceSeconds, 60, 3600) ||
      !integer(result.lifetimeSeconds, 60, 3600) || !integer(result.maxTicks, 1, 12) || !integer(result.stateReadsPerTick, 1, 5)) {
    throw new Error("Select a finite observation policy within one hour and twelve observations.");
  }
  return result;
}

function validate(state) {
  if (!exact(state, ["version", "registration", "taskKey", "sourceKey", "identities", "policy", "createdAt", "deadlineAt", "ticks",
      "generation", "cursor", "contractKey", "pending", "terminal", "seen", "observations", "tick", "schedule", "notBefore", "status",
      "resyncRequired", "backlogMore"]) || state.version !== 1 || !reference(state.registration) || !hash(state.taskKey) || !hash(state.sourceKey) ||
      !integer(state.createdAt, 1, Number.MAX_SAFE_INTEGER) || !integer(state.deadlineAt, state.createdAt, Number.MAX_SAFE_INTEGER) ||
      !integer(state.notBefore, 1, Number.MAX_SAFE_INTEGER) ||
      !integer(state.ticks, 0, 12) || !integer(state.generation, 0, Number.MAX_SAFE_INTEGER) ||
      !(state.cursor === null || opaque(state.cursor)) || !Array.isArray(state.seen) || state.seen.length > 10000 ||
      state.seen.some(value => !opaque(value)) || !object(state.pending) || !object(state.terminal) || !object(state.observations) ||
      typeof state.resyncRequired !== "boolean" || typeof state.backlogMore !== "boolean" ||
      !["OPEN", "STOPPED", "CANCELLED", "COMPLETE", "EXPIRED"].includes(state.status)) throw new Error("Protected continuation state is malformed.");
  const identities = normalizeNotificationIdentities(state.identities, 100);
  if (canonical(identities) !== canonical(state.identities) || canonical(policy(state.policy)) !== canonical(state.policy) ||
      state.deadlineAt !== state.createdAt + state.policy.lifetimeSeconds * 1000 || state.ticks > state.policy.maxTicks ||
      Object.entries(state.pending).some(([identity, generation]) => !identities.includes(identity) || !integer(generation, 1, state.generation)) ||
      Object.entries(state.terminal).some(([identity, terminal]) => !identities.includes(identity) || terminal !== true) ||
      Object.keys(state.observations).length > 60 || Object.entries(state.observations).some(([key, value]) =>
        !reference(key) || !exact(value, ["identity", "generation", "terminal", "keepPending", "tickId"]) ||
        !identities.includes(value.identity) || !integer(value.generation, 1, state.generation) ||
        typeof value.terminal !== "boolean" || typeof value.keepPending !== "boolean" || !reference(value.tickId)) ||
      (state.contractKey !== null && !hash(state.contractKey))) throw new Error("Protected continuation scope is malformed.");
  if (state.tick !== null && (!exact(state.tick, ["id", "inputCursor", "phase", "witness", "expiresAt", "waitSeconds", "stateReads"]) ||
      !reference(state.tick.id) || !integer(state.tick.expiresAt, 1, Number.MAX_SAFE_INTEGER) || !integer(state.tick.waitSeconds, 0, 25) ||
      !integer(state.tick.stateReads, 0, state.policy.stateReadsPerTick) ||
      !(state.tick.inputCursor === null || opaque(state.tick.inputCursor)) || !["REQUESTED", "RESYNC_REQUIRED", "INGESTED"].includes(state.tick.phase) ||
      (state.tick.witness !== null && !hash(state.tick.witness)))) throw new Error("Protected continuation tick is malformed.");
  if (state.tick && (state.tick.phase === "REQUESTED" ? state.tick.witness !== null : !hash(state.tick.witness))) {
    throw new Error("Protected native tick authority witness is malformed.");
  }
  if (state.schedule !== null && (!exact(state.schedule, ["nonce", "id", "phase", "client", "dueAt", "receiptKey"]) || !reference(state.schedule.nonce) ||
      !integer(state.schedule.dueAt, 1, Number.MAX_SAFE_INTEGER) ||
      !(state.schedule.receiptKey === null || hash(state.schedule.receiptKey)) ||
      !["REQUESTED", "REGISTERED"].includes(state.schedule.phase) || !["codex", "claude"].includes(state.schedule.client) ||
      (state.schedule.id !== null && (typeof state.schedule.id !== "string" || !state.schedule.id || state.schedule.id.length > 512)))) {
    throw new Error("Protected current-task schedule is malformed.");
  }
  if (state.schedule && (state.schedule.phase === "REGISTERED" ? state.schedule.id === null || !hash(state.schedule.receiptKey) :
    state.schedule.id !== null || state.schedule.receiptKey !== null)) throw new Error("Native registration receipt binding is malformed.");
  if (state.status === "COMPLETE" && (state.backlogMore || Object.keys(state.pending).length || !identities.every(identity => state.terminal[identity] === true))) {
    throw new Error("A completed continuation must retain exact terminal acknowledgements.");
  }
  return state;
}

export async function createNativeContinuationStore({root, taskIdentity, sourceKey, clock = Date.now}) {
  if (!isAbsolute(root) || typeof taskIdentity !== "string" || !taskIdentity || taskIdentity.length > 512 || !hash(sourceKey)) {
    throw new Error("The native entrypoint must supply its actual current task and source closure.");
  }
  await privateDirectory(root);
  if (await realpath(root) !== root) throw new Error("Protected continuation root cannot use a symbolic-link path.");
  const taskKey = digest(taskIdentity);
  const directory = async registration => {
    if (!reference(registration)) throw new Error("A current-task registration reference is required.");
    const path = join(root, `queue-${registration}`), legacy = join(root, registration);
    let old;
    try { old = await lstat(legacy); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (old) {
      if (!old.isDirectory() || old.isSymbolicLink() || old.uid !== process.getuid?.() || (old.mode & 0o077)) {
        throw new Error("Legacy continuation partition has unsafe custody.");
      }
      const saved = validate(await readPrivate(join(legacy, "state.json")));
      if (saved.registration !== registration || saved.taskKey !== taskKey) throw new Error("This continuation belongs to another native conversation.");
      try { await lstat(path); throw new Error("Two continuation storage generations require explicit recovery; preserve both."); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      // Fence every old pathname-based writer before publishing any new state.
      // Its final rename now fails, even if it held an earlier snapshot/temp fd.
      // Never recreate the legacy pathname; the entire queue moves intact.
      await rename(legacy, path);
      const parent = await open(root, "r"); try { await parent.sync(); } finally { await parent.close(); }
    }
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) {
      throw new Error("Protected continuation partition is unavailable.");
    }
    return path;
  };
  const mutate = async (registration, operation, {allowChangedSource = false} = {}) => {
    if (!reference(registration)) throw new Error("A current-task registration reference is required.");
    // The logical key remains stable before/after legacy-directory migration.
    return transaction(join(root, registration), async assertHeld => {
      const path = await directory(registration);
      const state = validate(await readPrivate(join(path, "state.json")));
      if (state.registration !== registration || state.taskKey !== taskKey) throw new Error("This continuation belongs to another native conversation.");
      if (!allowChangedSource && state.sourceKey !== sourceKey) throw new Error("The installed continuation source changed; retain the queue and rebind from current intent.");
      const result = await operation(state);
      validate(state); await writePrivate(path, state, assertHeld); return result;
    });
  };
  const active = state => {
    if (state.status !== "OPEN") return false;
    if (clock() >= state.deadlineAt || state.ticks >= state.policy.maxTicks && state.tick === null) {
      state.status = "EXPIRED"; return false;
    }
    return true;
  };
  const dirty = (state, identity) => {
    if (state.generation >= Number.MAX_SAFE_INTEGER) throw new Error("A fresh continuation partition is required.");
    Object.defineProperty(state.pending, identity, {value: ++state.generation, enumerable: true, configurable: true, writable: true});
    delete state.terminal[identity];
    for (const [key, observation] of Object.entries(state.observations)) if (observation.identity === identity) delete state.observations[key];
  };
  const tick = (state, tickId) => {
    if (!active(state) || state.tick?.id !== tickId || clock() >= state.tick.expiresAt) throw new Error("A current finite native observation tick is required.");
  };
  const commitBatch = (state, batch, tickId) => {
    if (state.seen.includes(batch.cursor) && batch.cursor !== state.cursor) {
      throw new Error("Native replay attempted to regress an already committed opaque cursor.");
    }
    if (batch.bootstrap && !state.seen.includes(batch.cursor)) for (const identity of state.identities) dirty(state, identity);
    for (const hint of batch.changed) if (!state.seen.includes(hint.cursor)) dirty(state, hint.identity);
    state.cursor = batch.cursor; state.resyncRequired = false; state.backlogMore = batch.more;
    state.seen = [...new Set([...state.seen, ...batch.changed.map(item => item.cursor), batch.cursor])].slice(-10000);
    state.tick.phase = "INGESTED"; state.tick.witness = batch.witness;
    state.notBefore = Math.max(state.notBefore, clock() + batch.retryAfterMs);
    return {next: "native_state_reads", tickId, pending: Object.entries(state.pending).slice(0, state.policy.stateReadsPerTick)
      .map(([identity, generation]) => ({identity, generation})), more: batch.more, retryAfterMs: batch.retryAfterMs};
  };
  return Object.freeze({
    async create({identities, ...input}) {
      const selected = normalizeNotificationIdentities(identities, 100), settings = policy(input);
      const registration = randomUUID(), path = join(root, `queue-${registration}`), now = clock();
      await privateDirectory(path);
      const state = {version: 1, registration, taskKey, sourceKey, identities: selected, policy: settings,
        createdAt: now, deadlineAt: now + settings.lifetimeSeconds * 1000, ticks: 0, generation: 0, cursor: null,
        contractKey: null, pending: {}, terminal: {}, seen: [], observations: {}, tick: null, schedule: null,
        resyncRequired: false, backlogMore: false, notBefore: now, status: "OPEN"};
      await writePrivate(path, state);
      return {registration, policy: settings, deadlineAt: state.deadlineAt, localStateOnly: true};
    },
    status: registration => mutate(registration, state => { active(state); return {registration, status: state.status, pending: {...state.pending},
      schedule: state.schedule, sourceMatches: state.sourceKey === sourceKey, deadlineAt: state.deadlineAt,
      ticks: state.ticks, policy: state.policy, backlogMore: state.backlogMore, localStateOnly: true}; }, {allowChangedSource: true}),
    plan: (registration, {scheduleNonce = null, waitSeconds = 0} = {}) => mutate(registration, state => {
      if (!active(state)) return {next: "stop", status: state.status, ownScheduleId: state.schedule?.id ?? null};
      if (!integer(waitSeconds, 0, 25)) throw new Error("Native held-read waits are bounded to25seconds.");
      if (state.backlogMore && waitSeconds !== 0) throw new Error("Drain the finite native backlog with wait_seconds0.");
      if (state.schedule) {
        if (state.schedule.phase !== "REGISTERED" || scheduleNonce !== state.schedule.nonce) {
          return {next: "await_own_schedule", ownScheduleId: state.schedule.id};
        }
        state.schedule = null;
      } else if (scheduleNonce !== null) throw new Error("This wake does not match the current own registration.");
      if (clock() < state.notBefore) return {next: "wait", notBefore: state.notBefore};
      if (state.tick && clock() < state.tick.expiresAt) throw new Error("Finish the existing current observation before starting another.");
      if (state.ticks >= state.policy.maxTicks) { state.status = "EXPIRED"; return {next: "stop", status: state.status}; }
      state.ticks++;
      state.tick = {id: randomUUID(), inputCursor: state.cursor, phase: "REQUESTED", witness: null,
        expiresAt: Math.min(state.deadlineAt, clock() + 180000), waitSeconds, stateReads: 0};
      return {next: "native_read", tickId: state.tick.id, toolName: "journeys.notifications.read",
        arguments: {identity: state.identities, ...(state.cursor === null ? {} : {cursor: state.cursor}), wait_seconds: waitSeconds}};
    }),
    ingest: (registration, {tickId, context, catalog, envelope}) => mutate(registration, state => {
      tick(state, tickId);
      if (state.tick.phase !== "REQUESTED") throw new Error("This native observation was already committed.");
      const contract = createNativeReadContract({context, catalog});
      if (state.contractKey !== null && state.contractKey !== contract.key) throw new Error("Fresh native descriptors changed; rebind the suspended objective.");
      const batch = validateNativeNotificationBatch({contract, identities: state.identities, cursor: state.tick.inputCursor,
        waitSeconds: state.tick.waitSeconds, envelope});
      state.contractKey ??= contract.key;
      if (batch.kind === "stop") { state.status = "STOPPED"; state.tick = null; return {next: "stop", error: batch.error}; }
      if (batch.kind === "retry") {
        state.tick = null; state.notBefore = clock() + state.policy.cadenceSeconds * 1000;
        return {next: "schedule_or_wait", error: batch.error};
      }
      if (batch.kind === "resync") {
        if (state.tick.inputCursor === null) throw new Error("A scope-preserving resync requires an original cursor anchor.");
        state.resyncRequired = true; state.tick.phase = "RESYNC_REQUIRED"; state.tick.witness = batch.witness;
        return {next: "native_bootstrap_same_context", tickId, error: batch.error,
          toolName: "journeys.notifications.read", arguments: {identity: state.identities, wait_seconds: 0}};
      }
      return commitBatch(state, batch, tickId);
    }),
    completeResync: (registration, {tickId, context, catalog, resyncEnvelope, bootstrapEnvelope}) => mutate(registration, state => {
      tick(state, tickId);
      if (!state.resyncRequired || state.tick.phase !== "RESYNC_REQUIRED") throw new Error("A current authenticated same-scope resync is required.");
      const contract = createNativeReadContract({context, catalog});
      if (contract.key !== state.contractKey) throw new Error("The native resync descriptor changed.");
      const resync = validateNativeNotificationBatch({contract, identities: state.identities, cursor: state.tick.inputCursor,
        waitSeconds: state.tick.waitSeconds, envelope: resyncEnvelope});
      if (resync.kind !== "resync" || resync.witness !== state.tick.witness) throw new Error("The original authenticated resync witness changed.");
      const bootstrap = validateNativeNotificationBatch({contract, identities: state.identities, cursor: null, waitSeconds: 0,
        envelope: bootstrapEnvelope});
      if (bootstrap.kind !== "batch") throw new Error("Same-context native bootstrap is incomplete; retain the original authority cursor.");
      // Both native wrappers were checked against this one fresh context before replacing the durable scope anchor.
      state.seen = []; state.resyncRequired = false; state.tick.inputCursor = null; state.tick.waitSeconds = 0;
      return commitBatch(state, bootstrap, tickId);
    }),
    observe: (registration, {tickId, identity, generation, context, catalog, notificationEnvelope, stateEnvelope}) => mutate(registration, state => {
      tick(state, tickId);
      if (state.tick.phase !== "INGESTED" || state.pending[identity] !== generation) throw new Error("The pending observation generation changed.");
      const contract = createNativeReadContract({context, catalog});
      if (contract.key !== state.contractKey) throw new Error("The current native descriptor changed.");
      const witness = validateNativeNotificationBatch({contract, identities: state.identities, cursor: state.tick.inputCursor,
        waitSeconds: state.tick.waitSeconds, envelope: notificationEnvelope});
      if (witness.kind !== "batch" || witness.witness !== state.tick.witness) throw new Error("State reads require this tick's exact native authority witness.");
      if (state.tick.stateReads >= state.policy.stateReadsPerTick) {
        throw new Error("The finite state-read budget is exhausted.");
      }
      const observation = validateNativeJourneyState({contract, identity, envelope: stateEnvelope});
      state.tick.stateReads++;
      if (observation.kind === "stop") { state.status = "STOPPED"; state.tick = null; return {next: "stop", observation}; }
      const retryAfter = observation.headers?.["Retry-After"];
      if (retryAfter !== undefined) {
        const due = typeof retryAfter === "string" && /^[0-9]+$/u.test(retryAfter) ?
          clock() + Number(retryAfter) * 1000 : typeof retryAfter === "string" ? Date.parse(retryAfter) : NaN;
        if (!Number.isSafeInteger(due) || due < 0) throw new Error("The service Retry-After cannot be interpreted safely; retain pending work.");
        state.notBefore = Math.max(state.notBefore, due);
      }
      if (observation.kind !== "observation") return {next: "retain_pending", observation};
      const observationRef = randomUUID();
      state.observations[observationRef] = {identity, generation, terminal: observation.terminal,
        keepPending: observation.keepPending === true, tickId};
      if (observation.retryAfterSeconds !== undefined) state.notBefore = Math.max(state.notBefore, clock() + observation.retryAfterSeconds * 1000);
      return {next: "deliver_in_current_conversation", observationRef, identity, generation, ...observation};
    }),
    acknowledgeDelivered: (registration, {observationRef, identity, generation}) => mutate(registration, state => {
      const observation = state.observations[observationRef];
      if (!observation || observation.identity !== identity || observation.generation !== generation ||
          state.tick?.phase !== "INGESTED" || state.resyncRequired || !active(state)) return {acknowledged: false};
      delete state.observations[observationRef];
      if (state.pending[identity] !== generation) return {acknowledged: false};
      if (!observation.keepPending) delete state.pending[identity];
      if (observation.terminal) Object.defineProperty(state.terminal, identity,
        {value: true, enumerable: true, configurable: true, writable: true});
      if (!state.backlogMore && state.identities.every(name => state.terminal[name] === true) && !Object.keys(state.pending).length) state.status = "COMPLETE";
      return {acknowledged: true, terminal: observation.terminal, status: state.status};
    }),
    finish: (registration, {tickId}) => mutate(registration, state => {
      if (state.tick?.id !== tickId) throw new Error("Finish only this current native tick.");
      state.tick = null;
      if (state.status === "OPEN" && !state.backlogMore && state.identities.every(name => state.terminal[name] === true) &&
          !Object.keys(state.pending).length) state.status = "COMPLETE";
      active(state);
      return {status: state.status, pending: Object.keys(state.pending).length, next: state.status === "OPEN" ? "schedule_or_wait" : "stop"};
    }),
    prepareSchedule: (registration, {client}) => mutate(registration, state => {
      if (!active(state) || state.policy.mode !== "scheduled") return {next: "stop", status: state.status};
      if (!["codex", "claude"].includes(client) || state.tick !== null) throw new Error("Finish the native tick before registering its next single fire.");
      if (state.cursor === null || state.contractKey === null || state.resyncRequired) {
        return {next: "initial_scoped_read_required"};
      }
      if (state.backlogMore) return {next: "bounded_wait_zero_drain_required", notBefore: state.notBefore};
      if (state.schedule) return {next: "await_existing_registration", ownScheduleId: state.schedule.id};
      const dueAt = Math.max(clock() + state.policy.cadenceSeconds * 1000, state.notBefore);
      if (dueAt >= state.deadlineAt) { state.status = "EXPIRED"; return {next: "stop", status: state.status}; }
      state.schedule = {nonce: randomUUID(), id: null, phase: "REQUESTED", client, dueAt, receiptKey: null};
      return {next: "native_single_fire", registration, scheduleNonce: state.schedule.nonce, dueAt,
        sourceKey, maxRemainingObservations: state.policy.maxTicks - state.ticks, defaultCurrentConversationRequired: true};
    }),
    attachSchedule: (registration, {scheduleNonce, id, receipt, singleFireVerified, currentTaskVerified}) => mutate(registration, state => {
      if (!active(state) || state.schedule?.nonce !== scheduleNonce || state.schedule.phase !== "REQUESTED" ||
          typeof id !== "string" || !id || id.length > 512 || /[\p{Cc}\p{Cf}]/u.test(id) ||
          singleFireVerified !== true || currentTaskVerified !== true || !object(receipt) ||
          Buffer.byteLength(canonical(receipt)) > 262144 || !canonical(receipt).includes(JSON.stringify(id))) {
        throw new Error("Bind the actual native receipt only after the host verifies its finite single fire and current-task target.");
      }
      // The caller is the explicit native tool workflow. This digest retains its input binding;
      // helper fixtures and confirmation fields supply no independent native integration proof.
      state.schedule.id = id; state.schedule.phase = "REGISTERED"; state.schedule.receiptKey = digest(receipt);
      state.notBefore = Math.max(state.notBefore, state.schedule.dueAt);
      return {registered: true, id, localStateOnly: true, registrationProvesWake: false};
    }),
    suspend: registration => mutate(registration, state => {
      state.status = "STOPPED"; state.tick = null; state.observations = {};
      return {status: state.status, ownScheduleId: state.schedule?.id ?? null, pending: Object.keys(state.pending).length};
    }, {allowChangedSource: true}),
    cancel: registration => mutate(registration, state => {
      state.status = "CANCELLED"; state.tick = null; state.observations = {};
      return {status: state.status, ownScheduleId: state.schedule?.id ?? null, pending: Object.keys(state.pending).length};
    }, {allowChangedSource: true})
  });
}
