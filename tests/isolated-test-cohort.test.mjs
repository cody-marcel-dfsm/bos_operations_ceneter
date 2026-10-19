import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isolatedTestCohort } from "./helpers/isolated-test-cohort.mjs";

const nodeJob = (name, code) => ({ name, command: process.execPath, args: ["-e", code] });
test("isolated cohort runs all 152 targets with four workers, ordered outcomes and retained failures", async () => {
  const jobs = Array.from({ length: 152 }, (_, index) => nodeJob(String(index), `
    const start=Date.now();globalThis.fixture=${index};
    setTimeout(()=>{console.log(JSON.stringify({start,end:Date.now(),pid:process.pid,fixture:globalThis.fixture}));
    process.exitCode=${index === 7 ? 3 : 0}},${index % 3 + 10});`));
  const results = await isolatedTestCohort(jobs).completion;
  assert.deepEqual(results.map(item => item.name), jobs.map(item => item.name));
  assert.equal(results.filter(item => item.code !== 0).length, 1);
  assert.equal(results[7].code, 3);
  const runs = results.map((item, index) => {
    assert.equal(item.error, null);
    const run = JSON.parse(item.stdout);
    assert.equal(run.fixture, index);
    return run;
  });
  assert.equal(new Set(runs.map(run => run.pid)).size, 152);
  const events = runs.flatMap(run => [[run.start, 1], [run.end, -1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0;
  let peak = 0;
  for (const [, delta] of events) { active += delta; peak = Math.max(peak, active); }
  assert.ok(peak > 1 && peak <= 4, `peak concurrent process bodies: ${peak}`);
  assert.equal(active, 0);
});

test("isolated cohort preserves spawn errors and bounded output, then completes remaining targets", async () => {
  const results = await isolatedTestCohort([
    { name: "missing", command: "/nonexistent/cohort-command", args: [] },
    nodeJob("overflow", "process.stdout.write('x'.repeat(8192));setInterval(()=>{},1000)"),
    nodeJob("last", "console.log('complete')")
  ], { concurrency: 2, outputLimit: 128, killAfterMs: 20 }).completion;
  assert.match(results[0].error, /ENOENT/);
  assert.match(results[1].error, /output exceeded/);
  assert.ok(Buffer.byteLength(results[1].stdout) <= 128);
  assert.equal(results[2].code, 0);
  assert.match(results[2].stdout, /complete/);
});

test("isolated cohort cancellation settles queued jobs and kills its owned process group", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cohort-cancel-"));
  const file = join(directory, "owned.json");
  const abort = new AbortController();
  const leader = `const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});
    require('node:fs').writeFileSync(${JSON.stringify(file)},JSON.stringify({leader:process.pid,child:child.pid}));
    setInterval(()=>{},1000);`;
  try {
    const cohort = isolatedTestCohort([nodeJob("leader", leader), nodeJob("queued", "process.exit(99)")],
      { concurrency: 1, signal: abort.signal, killAfterMs: 50 });
    let pids;
    const deadline = Date.now() + 5000;
    while (!pids && Date.now() < deadline) {
      try { pids = JSON.parse(await readFile(file, "utf8")); }
      catch (error) { if (error.code !== "ENOENT") throw error; await new Promise(done => setTimeout(done, 10)); }
    }
    assert.ok(pids, "owned child started");
    abort.abort();
    const results = await cohort.completion;
    assert.ok(results.every(item => item.cancelled));
    assert.equal(results[1].code, null);
    for (const pid of Object.values(pids)) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("isolated cohort rejects duplicate targets and unbounded worker settings", async () => {
  const job = nodeJob("same", "");
  assert.throws(() => isolatedTestCohort([job, job]), /Unique named/);
  assert.throws(() => isolatedTestCohort([job], { concurrency: 5 }), /Bounded/);
  const abort = new AbortController(); abort.abort();
  const cohort = isolatedTestCohort([job], { signal: abort.signal });
  assert.equal((await cohort.completion)[0].cancelled, true);
  assert.throws(() => cohort.outcome("foreign"), /Unknown/);
});
