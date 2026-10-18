#!/usr/bin/env node
import {lstat} from "node:fs/promises";
import {resolve, join} from "node:path";
import {fileURLToPath} from "node:url";
import {createNotificationHost} from "./notification-host.mjs";
import {createCompanionBridge, callCompanion, acquireCompanionLease} from "./muse-companion-host.mjs";
import {NotificationHostError, fail, exact, hash, fileIdentity, privateDirectory, protectedRead} from "./protected-files.mjs";
import {verifyNotificationHost} from "../../../scripts/install-notification-host.mjs";

async function volatileInput(stream) {
  const chunks = []; let length = 0;
  for await (const bytes of stream) {
    length += bytes.length; if (length > 2 * 1024 * 1024) fail(); chunks.push(bytes);
  }
  const buffer = Buffer.concat(chunks);
  try { return JSON.parse(buffer.toString("utf8")); } finally { buffer.fill(0); }
}
async function installedSourceGuard(root) {
  await privateDirectory(root);
  const activePath = join(root, "active.json");
  const activeBytes = await protectedRead(activePath), active = JSON.parse(activeBytes.bytes.toString("utf8"));
  if (active.status !== "installed" || !/^[a-f0-9]{40}$/u.test(active.revision) || active.hook?.enabled !== true) fail();
  const installation = join(root, "releases", active.revision), manifest = await verifyNotificationHost(installation);
  if (active.manifest_sha256 !== hash(JSON.stringify(manifest)) ||
      fileURLToPath(import.meta.url) !== join(installation, "source/host-runtime/bos-journey-notifications/muse-companion-cli.mjs")) fail();
  const identities = new Map();
  for (const file of manifest.files) identities.set(join(installation, file.path), fileIdentity(await lstat(join(installation, file.path))));
  identities.set(join(installation, "installation.json"), fileIdentity(await lstat(join(installation, "installation.json"))));
  return async () => {
    try {
      const current = await protectedRead(activePath);
      // Recording the actual native hook may update metadata during bootstrap;
      // only the runtime source/status selection controls this generation.
      const value = JSON.parse(current.bytes.toString("utf8"));
      if (value.revision !== active.revision || value.manifest_sha256 !== active.manifest_sha256 || value.status !== "installed" ||
          JSON.stringify(value.hook) !== JSON.stringify(active.hook)) return false;
      for (const [path, identity] of identities) {
        const info = await lstat(path); if (info.isSymbolicLink() || fileIdentity(info) !== identity) return false;
      }
      return true;
    } catch { return false; }
  };
}

export async function main(args = process.argv.slice(2), input = process.stdin) {
  const [operation, ...rest] = args, options = {};
  for (let index = 0; index < rest.length; index += 2) {
    if (!["--root", "--control", "--credential-file", "--ticket"].includes(rest[index]) || !rest[index + 1] || Object.hasOwn(options, rest[index])) fail();
    options[rest[index]] = rest[index + 1];
  }
  if (operation === "monitor") {
    if (!exact(options, ["--root", "--credential-file"])) fail();
    const root = resolve(options["--root"]), runtime = join(root, "run");
    const assertSourceCurrent = await installedSourceGuard(root);
    await privateDirectory(runtime);
    const releaseLease = await acquireCompanionLease(runtime);
    let host, bridge, active = true;
    try {
      const value = await volatileInput(input);
      if (!exact(value, ["origin", "contextHandle", "sourceContract", "identities", "taskIntent", "lifetimeMs", "intentConfirmed"]) || value.intentConfirmed !== true) fail();
      host = await createNotificationHost({...value, root: runtime, credentialPath: resolve(options["--credential-file"]),
        assertCurrent: async () => active, assertSourceCurrent,
        // The hook requests admission. A worker's later explicit state handoff ACK
        // supplies acceptance; a requested/silent wake never reports accepted.
        scheduleWake: async () => ({accepted: false})});
      bridge = await createCompanionBridge({root: runtime, host});
      const stop = () => { active = false; void host.retire().catch(() => {}); };
      process.once("SIGTERM", stop); process.once("SIGINT", stop);
      console.log(JSON.stringify({started: true, control_path: bridge.controlPath, binding: host.binding,
        native_wake_proven: false}));
      try { await host.run(); } finally { process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop); }
    } finally {
      active = false; await host?.retire(); await bridge?.close(); await releaseLease();
    }
    return;
  }
  if (!["hook-payload", "worker-read", "worker-ack", "retire"].includes(operation) || !options["--control"]) fail();
  if (operation === "worker-ack" ? !exact(options, ["--control", "--ticket"]) : !exact(options, ["--control"])) fail();
  const path = resolve(options["--control"]);
  if (operation === "hook-payload") {
    try {
      const result = await callCompanion(path, "poll");
      console.log(JSON.stringify(result.pending === true ? result.binding : null));
    } catch { console.log("null"); }
  } else {
    const result = await callCompanion(path, operation === "worker-read" ? "read" : operation === "worker-ack" ? "ack" : "retire",
      operation === "worker-ack" ? {ticket: options["--ticket"], accepted: true} : {});
    console.log(JSON.stringify(result));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error("Protected notification operation failed; retain pending work and use current host controls. " +
    (error instanceof NotificationHostError ? error.reason : "unavailable")); process.exitCode = 1; });
}
