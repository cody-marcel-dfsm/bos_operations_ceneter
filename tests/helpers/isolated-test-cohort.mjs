import { spawn } from "node:child_process";

// Every job remains a separate process. Results retain declaration order even
// when workers finish in a different order; a failure never skips later jobs.
export function isolatedTestCohort(jobs, { concurrency = 4, outputLimit = 1024 * 1024,
  killAfterMs = 5000, signal } = {}) {
  if (!Array.isArray(jobs) || !jobs.length || jobs.some(job =>
    !job || typeof job.name !== "string" || !job.name || typeof job.command !== "string" ||
    !Array.isArray(job.args) || job.args.some(arg => typeof arg !== "string")) ||
    new Set(jobs.map(job => job.name)).size !== jobs.length) throw new Error("Unique named process jobs required");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4 ||
    !Number.isInteger(outputLimit) || outputLimit < 1 || !Number.isInteger(killAfterMs) || killAfterMs < 1)
    throw new Error("Bounded concurrency, output and cancellation limits required");
  const deferred = jobs.map(() => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
  });
  const byName = new Map(jobs.map((job, index) => [job.name, deferred[index].promise]));
  const active = new Set();
  let next = 0;
  let cancelled = false;
  const cancelledResult = job => ({ name: job.name, code: null, signal: null,
    stdout: "", stderr: "", error: "Cohort cancelled", cancelled: true });
  function cancel() {
    if (cancelled) return;
    cancelled = true;
    while (next < jobs.length) { deferred[next].resolve(cancelledResult(jobs[next])); next++; }
    for (const stop of active) stop();
  }
  function pump() {
    while (!cancelled && active.size < concurrency && next < jobs.length) {
      const index = next++;
      const job = jobs[index];
      let child;
      let stdout = "";
      let stderr = "";
      let bytes = 0;
      let error = null;
      let timer;
      let cleanup = Promise.resolve();
      let stopped = false;
      const send = signum => {
        try {
          if (process.platform === "win32") child?.kill(signum);
          else if (child?.pid) process.kill(-child.pid, signum);
        } catch (failure) { if (failure.code !== "ESRCH") error ??= failure.message; }
      };
      const stop = () => {
        if (stopped) return;
        stopped = true;
        send("SIGTERM");
        cleanup = new Promise(done => {
          timer = setTimeout(() => { send("SIGKILL"); done(); }, killAfterMs);
        });
      };
      active.add(stop);
      const finish = async (code, exitSignal) => {
        // Wait for the bounded process-group cleanup even if the leader closes
        // its pipes first. Descendants can ignore TERM or close their own pipes.
        await cleanup;
        clearTimeout(timer);
        active.delete(stop);
        deferred[index].resolve({ name: job.name, code, signal: exitSignal,
          stdout, stderr, error, cancelled });
        pump();
      };
      try {
        child = spawn(job.command, job.args, { cwd: job.cwd, env: job.env ?? process.env,
          detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
        const collect = key => data => {
          const remaining = Math.max(0, outputLimit - bytes);
          const kept = data.subarray(0, remaining).toString("utf8");
          if (key === "stdout") stdout += kept; else stderr += kept;
          bytes += data.length;
          if (bytes > outputLimit) { error ??= `Process output exceeded ${outputLimit} bytes`; stop(); }
        };
        child.stdout.on("data", collect("stdout"));
        child.stderr.on("data", collect("stderr"));
        child.once("error", failure => { error ??= failure.message; });
        child.once("close", finish);
      } catch (failure) { error = failure.message; finish(null, null); }
    }
  }
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  queueMicrotask(pump);
  const completion = Promise.all(deferred.map(item => item.promise)).finally(() => {
    signal?.removeEventListener("abort", cancel);
  });
  return { completion, cancel, outcome(name) {
    if (!byName.has(name)) throw new Error(`Unknown process job: ${name}`);
    return byName.get(name);
  } };
}
