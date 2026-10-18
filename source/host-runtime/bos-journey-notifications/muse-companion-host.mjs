import {createServer, createConnection} from "node:net";
import {chmod, lstat, rm, open} from "node:fs/promises";
import {join, dirname} from "node:path";
import {randomBytes} from "node:crypto";
import {NotificationHostError, fail, exact, opaque, privateDirectory, protectedRead, atomicPrivateJson} from "./protected-files.mjs";

const bindingFields = ["registrationRef", "generation", "taskRef", "pendingWorkRef"];
const validBinding = value => exact(value, bindingFields) && bindingFields.every(field => opaque(value[field]));
const matches = (left, right) => validBinding(left) && bindingFields.every(field => left[field] === right[field]);
const maximumReply = 5 * 1024 * 1024;

// This local protocol has fixed operations and a fixed registered task. Callers
// can never supply a network request, authority selector, prompt or executable.
export async function createCompanionBridge({root, host}) {
  await privateDirectory(root);
  const socketPath = join(root, `s-${randomBytes(8).toString("hex")}.sock`), controlPath = join(root, "control.json");
  if (Buffer.byteLength(socketPath) > 100 || !validBinding(host.binding)) fail();
  let active = true, reading = false;
  const sockets = new Set();
  const serve = async request => {
    if (!active || !request || !matches(request.binding, host.binding)) fail();
    if (exact(request, ["operation", "binding"]) && request.operation === "retire") {
      await host.retire(); return {retired: true};
    }
    await host.assertCurrent();
    if (exact(request, ["operation", "binding"]) && request.operation === "poll") {
      const value = await host.poll();
      return {pending: value.pending === true && value.wakeEligible === true, binding: host.binding};
    }
    if (exact(request, ["operation", "binding"]) && request.operation === "read") {
      if (reading) fail(); reading = true;
      try { return await host.readPending(); } finally { reading = false; }
    }
    if (exact(request, ["operation", "binding", "ticket", "accepted"]) && request.operation === "ack" &&
        request.accepted === true && opaque(request.ticket)) return {acknowledged: await host.acknowledge(request.ticket)};
    fail();
  };
  const server = createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    socket.setTimeout(35000, () => socket.destroy());
    let text = "", used = false;
    const decoder = new TextDecoder("utf-8", {fatal: true});
    socket.on("error", () => {});
    socket.on("data", chunk => {
      if (used) return socket.destroy();
      try { text += decoder.decode(chunk, {stream: true}); } catch { return socket.destroy(); }
      if (Buffer.byteLength(text) > 4096) return socket.destroy();
      if (!text.endsWith("\n")) return;
      used = true;
      void (async () => {
        try {
          const result = JSON.stringify({ok: true, result: await serve(JSON.parse(text))}) + "\n";
          if (Buffer.byteLength(result) > maximumReply) fail();
          socket.end(result);
        } catch (error) { socket.end(JSON.stringify({ok: false, reason: new NotificationHostError(error.reason).reason}) + "\n"); }
      })();
    });
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
    await chmod(socketPath, 0o600);
    await atomicPrivateJson(controlPath, {version: 1, socketPath, binding: host.binding});
  } catch { server.close(); await rm(socketPath, {force: true}); fail(); }
  return Object.freeze({controlPath, async close() {
    if (!active) return; active = false;
    // The retire request aborts the monitor while its reply is still being
    // written. Drain that bounded reply before destroying remaining sockets.
    await new Promise(resolve => {
      const timer = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 1000);
      server.close(() => { clearTimeout(timer); resolve(); });
    });
    // Keep control/queue/registration receipts. The retired endpoint is unavailable.
    await rm(socketPath, {force: true});
  }});
}

export async function readCompanionControl(path) {
  const value = JSON.parse((await protectedRead(path)).bytes.toString("utf8"));
  if (!exact(value, ["version", "socketPath", "binding"]) || value.version !== 1 || !validBinding(value.binding) ||
      dirname(value.socketPath) !== dirname(path) || !/^s-[a-f0-9]{16}\.sock$/u.test(value.socketPath.split("/").at(-1))) fail();
  await privateDirectory(dirname(path));
  const info = await lstat(value.socketPath);
  if (!info.isSocket() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600) fail();
  return value;
}

export async function callCompanion(controlPath, operation, extra = {}) {
  let control;
  try { control = await readCompanionControl(controlPath); } catch { fail(); }
  return new Promise((resolve, reject) => {
    let reply = "", done = false;
    const decoder = new TextDecoder("utf-8", {fatal: true});
    const socket = createConnection(control.socketPath);
    const finish = (error, value) => { if (done) return; done = true; socket.destroy(); error ? reject(error) : resolve(value); };
    const rejectSafe = reason => finish(new NotificationHostError(typeof reason === "string" ? reason : undefined));
    socket.setTimeout(35000, rejectSafe);
    socket.on("error", rejectSafe);
    socket.on("connect", () => socket.write(JSON.stringify({operation, binding: control.binding, ...extra}) + "\n"));
    socket.on("data", chunk => {
      try { reply += decoder.decode(chunk, {stream: true}); } catch { return rejectSafe(); }
      if (Buffer.byteLength(reply) > maximumReply) rejectSafe();
    });
    socket.on("end", () => {
      try {
        reply += decoder.decode();
        const value = JSON.parse(reply);
        if (exact(value, ["ok", "reason"]) && value.ok === false) return rejectSafe(value.reason);
        if (!exact(value, ["ok", "result"]) || value.ok !== true) return rejectSafe();
        finish(null, value.result);
      } catch { rejectSafe(); }
    });
    socket.on("close", () => { if (!done) rejectSafe(); });
  });
}

// A live or unexplained lease is never removed. A proven dead process leaves a
// preserved lease receipt; the next runtime gets entirely new references.
export async function acquireCompanionLease(root) {
  await privateDirectory(root);
  const path = join(root, "lease.json"), nonce = randomBytes(24).toString("hex");
  let claim;
  try {
    claim = await open(join(root, "lease.claim"), "wx", 0o600);
    try {
      const prior = JSON.parse((await protectedRead(path)).bytes.toString("utf8"));
      if (!exact(prior, ["pid", "nonce"]) || !Number.isSafeInteger(prior.pid) || prior.pid < 1 || !opaque(prior.nonce)) fail();
      try { process.kill(prior.pid, 0); fail(); } catch (error) { if (error.code !== "ESRCH") throw error; }
      await atomicPrivateJson(join(root, `retired-lease-${prior.nonce}.json`), prior, {replace: false});
      await rm(path);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const file = await open(path, "wx", 0o600);
    try { await file.writeFile(JSON.stringify({pid: process.pid, nonce})); await file.sync(); } finally { await file.close(); }
    return async () => {
      const value = JSON.parse((await protectedRead(path)).bytes.toString("utf8"));
      if (value.nonce !== nonce || value.pid !== process.pid) fail();
      await atomicPrivateJson(join(root, `retired-lease-${nonce}.json`), value, {replace: false});
      await rm(path);
    };
  } catch { fail(); } finally {
    if (claim) { await claim.close(); await rm(join(root, "lease.claim")); }
  }
}
