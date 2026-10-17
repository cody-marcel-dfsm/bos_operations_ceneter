// Host-owned protected storage. This module is excluded from customer skill packages.
import {open, mkdir, lstat, chmod, rename, rm} from "node:fs/promises";
import {isAbsolute, join} from "node:path";
import {randomUUID} from "node:crypto";
import {canonicalJson, digest, withAuthorityMutationLock} from "../bos-shared-cache/document-cache.mjs";

const opaque = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,512}$/u.test(value);
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
async function directory(path) {
  await mkdir(path, {recursive: true, mode: 0o700});
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Protected notification storage is unavailable");
  await chmod(path, 0o700);
}

export async function createNotificationQueue({root, binding, identities, contractKey, replayMaxEvents,
  assertCurrent, scheduleWake}) {
  // The host supplies this constructor's private authority and existing task binding.
  if (!isAbsolute(root) || !exact(binding, ["authorityKey", "connectionRef", "taskRef", "pendingWorkRef"]) ||
      !/^[a-f0-9]{64}$/u.test(binding.authorityKey) || !opaque(binding.connectionRef) ||
      !opaque(binding.taskRef) || !opaque(binding.pendingWorkRef) || !/^[a-f0-9]{64}$/u.test(contractKey) ||
      typeof assertCurrent !== "function" || typeof scheduleWake !== "function" ||
      !Number.isSafeInteger(replayMaxEvents) || replayMaxEvents < 1 || replayMaxEvents > 10000 ||
      !Array.isArray(identities) || !identities.length || identities.length > 100 ||
      new Set(identities).size !== identities.length || identities.some(identity => typeof identity !== "string" ||
        !identity || identity.normalize("NFC") !== identity || Buffer.byteLength(identity) > 255 || /[\p{Cc}\p{Cf}]/u.test(identity))) {
    throw new Error("A trusted bounded notification storage binding is required");
  }
  const selected = structuredClone(binding), watched = [...identities].sort();
  const key = digest({binding: selected, identities: watched, contractKey});
  await directory(root);
  const partition = join(root, key);
  await directory(partition);
  const path = join(partition, "pending.json"), lockPath = join(partition, "mutation.lock");
  const initial = () => ({version: 1, cursor: null, generation: 0, pending: {}, seen: []});
  const guard = async () => {
    if (await assertCurrent() !== true) throw new Error("The notification authority or intended task changed");
  };
  const validate = state => {
    if (!exact(state, ["version", "cursor", "generation", "pending", "seen"]) || state.version !== 1 ||
        !(state.cursor === null || opaque(state.cursor)) || !Number.isSafeInteger(state.generation) || state.generation < 0 ||
        !state.pending || typeof state.pending !== "object" || Array.isArray(state.pending) ||
        Object.entries(state.pending).some(([identity, generation]) => !watched.includes(identity) ||
          !Number.isSafeInteger(generation) || generation < 1 || generation > state.generation) ||
        !Array.isArray(state.seen) || state.seen.length > replayMaxEvents || new Set(state.seen).size !== state.seen.length ||
        state.seen.some(cursor => !opaque(cursor))) throw new Error("Protected notification state is malformed");
    return state;
  };
  const read = async () => {
    let file;
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error("Protected notification state is unavailable");
      file = await open(path, "r");
      return validate(JSON.parse(await file.readFile("utf8")));
    } catch (error) { if (error.code === "ENOENT") return initial(); throw error; }
    finally { await file?.close(); }
  };
  const write = async state => {
    validate(state);
    const temporary = join(partition, `.${randomUUID()}.tmp`);
    let file;
    try {
      file = await open(temporary, "wx", 0o600);
      await file.writeFile(canonicalJson(state));
      await file.sync();
      await file.close(); file = null;
      await guard();
      await rename(temporary, path);
      const folder = await open(partition, "r");
      try { await folder.sync(); } finally { await folder.close(); }
    } finally { await file?.close(); await rm(temporary, {force: true}); }
  };
  const locked = async operation => {
    await guard();
    try { if ((await lstat(lockPath)).isSymbolicLink()) throw new Error("Protected notification lock is invalid"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    return withAuthorityMutationLock(lockPath, async () => { await guard(); return operation(await read()); });
  };
  const advance = (state, cursor) => {
    if (!opaque(cursor)) throw new Error("An opaque notification cursor is required");
    state.cursor = cursor;
    state.seen.push(cursor);
    state.seen = state.seen.slice(-replayMaxEvents);
  };
  const dirty = (state, identity) => {
    if (state.generation >= Number.MAX_SAFE_INTEGER) throw new Error("Notification generation requires a fresh partition");
    Object.defineProperty(state.pending, identity, {value: ++state.generation, enumerable: true, writable: true, configurable: true});
  };
  return Object.freeze({
    cursor: () => locked(state => state.cursor),
    pending: () => locked(state => Object.entries(state.pending).map(([identity, generation]) => ({identity, generation}))),
    bootstrap: cursor => locked(async state => {
      if (state.seen.includes(cursor)) return;
      for (const identity of watched) dirty(state, identity);
      advance(state, cursor);
      await write(state);
    }),
    enqueue: ({identity, cursor}) => locked(async state => {
      if (!watched.includes(identity) || !opaque(cursor)) throw new Error("Notification hint is outside the exact watch set");
      if (state.seen.includes(cursor)) return;
      dirty(state, identity);
      advance(state, cursor);
      await write(state);
    }),
    acknowledge: ({identity, generation}) => locked(async state => {
      if (!watched.includes(identity) || !Number.isSafeInteger(generation) || generation < 1 || state.pending[identity] !== generation) return false;
      delete state.pending[identity];
      await write(state);
      return true;
    }),
    // Wake is deliberately outside the file lock; rejection keeps the durable pending work.
    wake: async () => {
      const pending = await locked(state => Object.keys(state.pending).length > 0);
      if (!pending) return {accepted: true};
      await guard();
      const result = await scheduleWake({taskRef: selected.taskRef, pendingWorkRef: selected.pendingWorkRef});
      await guard();
      return {accepted: result?.accepted === true};
    },
    resetCursor: () => locked(async state => { state.cursor = null; state.seen = []; await write(state); }),
    // Called only by the trusted host on logout/context or watch-set replacement.
    invalidate: () => withAuthorityMutationLock(lockPath, () => rm(path, {force: true}))
  });
}
