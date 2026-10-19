#!/usr/bin/env node
import {readFile, mkdir, lstat, realpath} from "node:fs/promises";
import {homedir} from "node:os";
import {resolve, join, dirname, relative, isAbsolute} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {createNativeContinuationStore} from "./native-callback-store.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export function currentNativeTask(client, environment = process.env) {
  const value = client === "codex" ? environment.CODEX_THREAD_ID : client === "claude" ? environment.CLAUDE_CODE_SESSION_ID : null;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new Error("Run this entrypoint through the actual current Codex or Claude conversation shell.");
  }
  return `${client}:${value}`;
}

export async function nativeSourceClosure(directory = here) {
  const skill = dirname(directory), packageRoot = resolve(skill, "../..");
  const found = new Map();
  const visit = async path => {
    const rel = relative(packageRoot, path);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Native continuation imports must stay inside the published skill package.");
    if (found.has(rel)) return;
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Native continuation source must be a regular published file.");
    const bytes = await readFile(path);
    found.set(rel, {sha256: createHash("sha256").update(bytes).digest("hex"), mode: stat.mode & 0o777});
    if (path.endsWith(".mjs")) {
      for (const match of bytes.toString("utf8").matchAll(/(?:import|export)\s+(?:(?:[^;]*?)\s+from\s*)?["'](\.[^"']+)["']/gu)) {
        await visit(resolve(dirname(path), match[1]));
      }
    }
  };
  await visit(join(directory, "native-callback-continuation.mjs"));
  await visit(join(skill, "SKILL.md"));
  await visit(join(skill, "references", "native-callback-continuation.md"));
  const bindings = Object.fromEntries([...found].sort(([left], [right]) => left.localeCompare(right)));
  return {sourceKey: createHash("sha256").update(JSON.stringify(bindings)).digest("hex"), bindings};
}

async function currentUserRoot() {
  if (!["darwin", "linux"].includes(process.platform) || typeof process.getuid !== "function") {
    throw new Error("Protected native continuation currently requires a POSIX local host; preserve ordinary state-read recovery.");
  }
  const home = await realpath(homedir());
  const segments = process.platform === "darwin" ? ["Library", "Application Support", "BOS", "native-continuations", "v1"] :
    [".local", "state", "BOS", "native-continuations", "v1"];
  let path = home;
  for (const segment of segments) {
    path = join(path, segment);
    await mkdir(path, {mode: 0o700}).catch(error => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()) {
      throw new Error("The native continuation storage path has unsafe ownership or symbolic links.");
    }
  }
  return path;
}

async function input() {
  let value = "";
  for await (const part of process.stdin) {
    value += part;
    if (Buffer.byteLength(value) > 4 * 1024 * 1024) throw new Error("Native continuation input exceeded its finite bound.");
  }
  const result = value.trim() ? JSON.parse(value) : {};
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Provide one structured native operation input.");
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const args = [...argv], command = args.shift(), registration = args[0]?.startsWith("--") ? undefined : args.shift();
  if (args.length !== 2 || args[0] !== "--client" || !["codex", "claude"].includes(args[1])) {
    throw new Error("Usage: native-callback-continuation.mjs <command> [registration] --client codex|claude (JSON on stdin).");
  }
  const client = args[1], taskIdentity = currentNativeTask(client), closure = await nativeSourceClosure();
  const store = await createNativeContinuationStore({root: await currentUserRoot(), taskIdentity, sourceKey: closure.sourceKey});
  const value = await input();
  const allowed = {
    create: ["identities", "mode", "cadenceSeconds", "lifetimeSeconds", "maxTicks", "stateReadsPerTick"], status: [],
    plan: ["scheduleNonce", "waitSeconds"], ingest: ["tickId", "context", "catalog", "envelope"],
    "complete-resync": ["tickId", "context", "catalog", "resyncEnvelope", "bootstrapEnvelope"],
    observe: ["tickId", "identity", "generation", "context", "catalog", "notificationEnvelope", "stateEnvelope"],
    "ack-delivered": ["observationRef", "identity", "generation"], finish: ["tickId"], "prepare-schedule": [],
    "attach-schedule": ["scheduleNonce", "id", "receipt", "singleFireVerified", "currentTaskVerified"], suspend: [], cancel: []
  };
  if (!Object.hasOwn(allowed, command) || Object.keys(value).some(key => !allowed[command].includes(key))) {
    throw new Error("Native continuation commands accept only their closed current-task inputs.");
  }
  const operations = {
    create: () => store.create(value), status: () => store.status(registration), plan: () => store.plan(registration, value),
    ingest: () => store.ingest(registration, value), "complete-resync": () => store.completeResync(registration, value),
    observe: () => store.observe(registration, value), "ack-delivered": () => store.acknowledgeDelivered(registration, value),
    finish: () => store.finish(registration, value), "prepare-schedule": () => store.prepareSchedule(registration, {client}),
    "attach-schedule": () => store.attachSchedule(registration, value), suspend: () => store.suspend(registration), cancel: () => store.cancel(registration)
  };
  if (!Object.hasOwn(operations, command)) throw new Error("Select a supported native continuation command.");
  const result = await operations[command]();
  if (command === "prepare-schedule" && result.next === "native_single_fire") {
    result.prompt = `Use the currently installed bos-workflow-orchestrator native callback continuation workflow in this current conversation only. ` +
      `Registration ${registration}; single-fire nonce ${result.scheduleNonce}; original source ${closure.sourceKey}. ` +
      `Use its current helper with this nonce; require the actual current task, unchanged source, finite budget and deadline. ` +
      `Refresh BOS context and exact native read descriptors, revalidate the saved cursor, commit hints, refetch canonical state, ` +
      `and acknowledge only an observation actually accepted in this conversation. Keep signed lifecycle actions inert in this monitoring step. ` +
      `Stop on authority/source/task mismatch; preserve pending work. Create at most the next admitted single fire. ` +
      `Cancel only this registration's own recorded native schedule. Stay quiet for unchanged observations.`;
    result.singleFireRequired = true;
  }
  return {...result, evidenceScope: "protected_local_queue", establishesNativeAuthentication: false, establishesActualHostWake: false};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
    process.stderr.write(`${error.message}\n`); process.exitCode = 1;
  });
}
