// Closed test-only resource sampling and captured-input lifetime.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, rmdir } from "node:fs/promises";
import { availableParallelism, freemem, totalmem } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const GiB = 1024 ** 3, workerBytes = 256 * 1024 ** 2;
const digest = value => createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, function (_, item) {
  return item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
});
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const identity = stat => ({ dev: String(stat.dev), ino: String(stat.ino), uid: Number(stat.uid), mode: Number(stat.mode) & 0o7777 });
const toolIdentity = stat => ({ ...identity(stat), size: String(stat.size), mtime_ns: String(stat.mtimeNs), ctime_ns: String(stat.ctimeNs) });
const safe = value => Number.isSafeInteger(value) && value >= 0;

export function assertValidationContinuity(before, after) {
  for (const value of [before, after]) {
    assert.ok(value && Object.getPrototypeOf(value) === Object.prototype &&
      /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value.commit), "Closed captured state with actual outer commit required");
  }
  const { commit: beforeCommit, ...beforeActual } = before;
  const { commit: afterCommit, ...afterActual } = after;
  assert.deepEqual(afterActual, beforeActual, "Captured actual validation inputs changed");
  return Object.freeze({ before_commit: beforeCommit, after_commit: afterCommit, actual_sha256: digest(canonical(beforeActual)) });
}

export async function createVerifiedDirectory(parent, prefix) {
  if (!isAbsolute(parent) || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(prefix)) throw new Error("Closed absolute directory resource required");
  const parentStat = await lstat(parent, { bigint: true });
  assert.ok(parentStat.isDirectory() && !parentStat.isSymbolicLink() && Number(parentStat.uid) === process.getuid(), "Owned directory parent required");
  const parentIdentity = identity(parentStat);
  const path = await mkdtemp(join(parent, prefix));
  const initial = await lstat(path, { bigint: true });
  const captured = freeze(identity(initial));
  let disposed = false;
  async function verify() {
    if (disposed) throw new Error("Owned directory already disposed");
    for (const [name, expected] of [[parent, parentIdentity], [path, captured]]) {
      const fact = await lstat(name, { bigint: true });
      assert.ok(fact.isDirectory() && !fact.isSymbolicLink(), "Directory resource type changed");
      assert.deepEqual(identity(fact), expected, "Directory resource custody changed");
    }
    return true;
  }
  async function dispose() {
    if (disposed) return;
    await verify();
    await rmdir(path); // Never recurse into a foreign or nonempty descendant.
    disposed = true;
  }
  try { assert.equal(captured.mode, 0o700); await verify(); }
  catch (error) { try { await dispose(); } catch (cleanup) { error.cleanup = cleanup.message; } throw error; }
  return Object.freeze({ path, identity: captured, verify, dispose });
}

export function parseDarwinValidationMetrics(vm, pressure, swap) {
  if ([vm, pressure, swap].some(value => typeof value !== "string" || Buffer.byteLength(value) > 32768 || /[^\x09\x0a\x0d\x20-\x7e]/u.test(value)))
    throw new Error("Bounded ASCII Darwin metrics required");
  const lines = vm.trim().split(/\r?\n/u);
  const header = /^Mach Virtual Memory Statistics: \(page size of ([0-9]+) bytes\)$/u.exec(lines.shift());
  if (!header) throw new Error("Darwin page header required");
  const pageSize = Number(header[1]);
  if (![4096, 16384].includes(pageSize)) throw new Error("Known Darwin page size required");
  const rows = {};
  const known = new Set(["Pages free", "Pages active", "Pages inactive", "Pages speculative", "Pages throttled", "Pages wired down", "Pages purgeable",
    '"Translation faults"', '"Pages copy-on-write"', '"Pages zero filled"', '"Pages reactivated"', '"Pages purged"', "File-backed pages", "Anonymous pages",
    "Pages copy-on-write", "Pages zero filled", "Pages reactivated", "Pages purged",
    "Pages stored in compressor", "Pages occupied by compressor", "Decompressions", "Compressions", "Pageins", "Pageouts", "Swapins", "Swapouts"]);
  for (const line of lines) {
    const match = /^([^:]+):\s+([0-9]+)\.$/u.exec(line);
    if (!match || !known.has(match[1]) || Object.hasOwn(rows, match[1])) throw new Error("Unique known Darwin counter rows required");
    const value = Number(match[2]); if (!safe(value)) throw new Error("Safe Darwin counter required");
    rows[match[1]] = value;
  }
  for (const key of ["Pages free", "Pages inactive", "File-backed pages", "Swapins", "Swapouts"])
    if (!Object.hasOwn(rows, key)) throw new Error("Missing Darwin counter");
  if (!/^(?:1|2|4)\s*$/u.test(pressure)) throw new Error("Known pressure level required");
  const usage = /^\s*total = ([0-9]+\.[0-9]{2})M\s+used = ([0-9]+\.[0-9]{2})M\s+free = ([0-9]+\.[0-9]{2})M\s+\(encrypted\)\s*$/u.exec(swap);
  if (!usage) throw new Error("Closed Darwin swap usage required");
  const amounts = usage.slice(1).map(value => Number(value) * 1024 ** 2);
  if (amounts.some(value => !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) || amounts[1] > amounts[0] || amounts[2] > amounts[0])
    throw new Error("Consistent bounded swap usage required");
  const result = { page_size: pageSize, free_bytes: rows["Pages free"] * pageSize,
    inactive_bytes: rows["Pages inactive"] * pageSize, file_backed_bytes: rows["File-backed pages"] * pageSize,
    swapins: rows.Swapins, swapouts: rows.Swapouts, swap_used_bytes: amounts[1], pressure: Number(pressure.trim()) };
  if (![result.free_bytes, result.inactive_bytes, result.file_backed_bytes].every(safe)) throw new Error("Bounded memory byte counts required");
  return Object.freeze(result);
}

function hostValid(host) {
  if (!host || !Number.isSafeInteger(host.cpus) || host.cpus < 1 || !safe(host.free_bytes) ||
    !safe(host.total_bytes) || host.total_bytes < 1 || host.free_bytes > host.total_bytes) throw new Error("Actual bounded host resource facts required");
}
function sampleValid(sample, host) {
  return sample && Object.keys(sample).sort().join() === ["page_size", "free_bytes", "inactive_bytes", "file_backed_bytes", "swapins", "swapouts", "swap_used_bytes", "pressure"].sort().join() &&
    [4096,16384].includes(sample.page_size) && ["free_bytes", "inactive_bytes", "file_backed_bytes", "swapins", "swapouts"].every(key => safe(sample[key])) &&
    [sample.free_bytes, sample.inactive_bytes, sample.file_backed_bytes].every(value => value <= host.total_bytes) &&
    Number.isFinite(sample.swap_used_bytes) && sample.swap_used_bytes >= 0 && sample.swap_used_bytes <= Number.MAX_SAFE_INTEGER && sample.pressure === 1;
}
function swapStable(first, next) {
  return first.swapins === next.swapins && first.swapouts === next.swapouts && first.swap_used_bytes === next.swap_used_bytes;
}
export function evaluateNativeValidationCapacity(host, first, second) {
  hostValid(host);
  const cap = budget => Math.max(1, Math.min(8, host.cpus, Math.floor(budget / workerBytes)));
  const base = { capacity: cap(host.free_bytes), mode: "free-only", free_capacity: cap(host.free_bytes),
    free_bytes: host.free_bytes, reserve_bytes: Math.ceil(Math.max(2 * GiB, host.total_bytes / 16)), credit_bytes: 0, budget_bytes: host.free_bytes };
  if (host.platform !== "darwin" || !sampleValid(first, host) || !sampleValid(second, host) || !swapStable(first, second)) return Object.freeze(base);
  const credit = Math.max(0, Math.floor(Math.min(first.inactive_bytes, first.file_backed_bytes, second.inactive_bytes, second.file_backed_bytes) / 4) - base.reserve_bytes);
  if (!credit) return Object.freeze(base);
  const budget = Math.min(host.total_bytes, host.free_bytes + credit);
  return Object.freeze({ ...base, capacity: cap(budget), mode: "darwin-credited", credit_bytes: credit, budget_bytes: budget });
}

export function createValidationPressureGuard(host, baseline, onDegrade) {
  hostValid(host);
  if (!sampleValid(baseline, host) || typeof onDegrade !== "function") throw new Error("Normal baseline and cancellation callback required");
  let failure;
  const fail = error => {
    if (failure) return;
    failure = error instanceof Error ? error : new Error("Validation resource sampling failed");
    try { onDegrade(failure); } catch (error) { failure.cancellation_error = error.message; }
  };
  return Object.freeze({ fail, observe(sample) {
    if (!sampleValid(sample, host) || !swapStable(baseline, sample)) fail(new Error("Credited validation pressure or swap degraded"));
    return !failure;
  }, verify() { if (failure) throw failure; return true; } });
}

async function tool(path) {
  const before = await lstat(path, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink() && Number(before.uid) === 0 && !(Number(before.mode) & 0o022) && (Number(before.mode) & 0o111), "System metric tool custody required");
  const descriptor = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const raw = await descriptor.readFile();
    assert.deepEqual(toolIdentity(await descriptor.stat({ bigint: true })), toolIdentity(before), "Metric tool moved during capture");
    assert.deepEqual(toolIdentity(await lstat(path, { bigint: true })), toolIdentity(before), "Metric path moved during capture");
    return { path, ...toolIdentity(before), sha256: digest(raw) };
  } finally { await descriptor.close(); }
}
export async function settleValidationOperations(operations) {
  const results = await Promise.allSettled(operations);
  const failure = results.find(result => result.status === "rejected");
  if (failure) throw failure.reason;
  return results.map(result => result.value);
}
async function capture() {
  const outputs = await settleValidationOperations([["/usr/bin/vm_stat", []], ["/usr/sbin/sysctl", ["-n", "kern.memorystatus_vm_pressure_level"]], ["/usr/sbin/sysctl", ["-n", "vm.swapusage"]]].map(async ([path, args]) => {
    const result = await run(path, args, { encoding: "utf8", timeout: 2000, maxBuffer: 32768 });
    if (result.stderr) throw new Error("Metric tool emitted diagnostics");
    return result.stdout;
  }));
  return parseDarwinValidationMetrics(...outputs);
}

export async function prepareNativeValidationResources() {
  const host = freeze({ platform: process.platform, cpus: availableParallelism(), free_bytes: freemem(), total_bytes: totalmem() });
  hostValid(host);
  let first, second, tools, fallback;
  if (host.platform === "darwin") {
    try { tools = await settleValidationOperations(["/usr/bin/vm_stat", "/usr/sbin/sysctl"].map(tool)); first = await capture(); second = await capture(); }
    catch (error) { fallback = error.code ?? error.name; }
  }
  const decision = evaluateNativeValidationCapacity(host, first, second);
  const provenance = freeze({ host, ...decision, samples: first && second ? [first, second] : [], tools: tools ?? [], fallback: fallback ?? null });
  let disposed = false, stopped = false, started = false, timer, pending;
  let guard;
  async function stop() { stopped = true; clearTimeout(timer); if (pending) await pending; }
  async function verify() {
    if (disposed) throw new Error("Validation resources already disposed");
    if (guard) guard.verify();
    if (decision.mode === "darwin-credited") {
      assert.deepEqual(await settleValidationOperations(["/usr/bin/vm_stat", "/usr/sbin/sysctl"].map(tool)), tools, "Metric tool identity changed");
      const current = await capture();
      if (!sampleValid(current, host) || !swapStable(second, current)) throw new Error("Credited validation pressure or swap degraded");
      if (guard) guard.verify();
    }
    return true;
  }
  function startMonitor(onDegrade) {
    if (disposed || started || typeof onDegrade !== "function") throw new Error("One owned validation monitor required");
    started = true;
    if (decision.mode !== "darwin-credited") return stop;
    guard = createValidationPressureGuard(host, second, onDegrade);
    async function tick() {
      pending = (async () => { try { guard.observe(await capture()); } catch (error) { guard.fail(error); } })();
      await pending;
      if (!stopped) timer = setTimeout(tick, 1000);
    }
    timer = setTimeout(tick, 1000);
    return stop;
  }
  async function dispose() { if (disposed) return; await stop(); disposed = true; }
  return Object.freeze({ capacity: decision.capacity, provenance, startMonitor, verify, dispose });
}
