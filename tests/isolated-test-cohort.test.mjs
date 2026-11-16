import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isolatedTestCohort } from "./helpers/isolated-test-cohort.mjs";
import { assertNativeGitEquivalent, nativeGitEligible, prepareNativeValidationGit } from "./helpers/native-validation-git.mjs";

const scratch = new URL("../Vault/tmp/", import.meta.url);
async function ownedDirectory(prefix) {
  await mkdir(scratch, { recursive: true });
  return mkdtemp(new URL(prefix, scratch).pathname);
}

// A killed orphan is a zombie until its reaper runs; it is terminated either way.
function terminated(pid) {
  try { process.kill(pid, 0); } catch (error) { return error.code === "ESRCH"; }
  if (process.platform !== "linux") return false;
  try { return readFileSync(`/proc/${pid}/stat`, "utf8").replace(/^.*\) /s, "")[0] === "Z"; }
  catch (error) { return error.code === "ENOENT"; }
}

const nodeJob = (name, code) => ({ name, command: process.execPath, args: ["-e", code] });
test("optional raw capture preserves split Unicode and invalid bytes without changing default results", async () => {
  const job=nodeJob("raw",`process.stdout.write(Buffer.from([240,159]));process.stderr.write(Buffer.from([255]));setTimeout(()=>process.stdout.write(Buffer.from([152,128])),20);`);
  const [captured]=await isolatedTestCohort([job],{captureBytes:true}).completion;
  assert.equal(captured.code,0);assert.deepEqual(captured.stdoutBytes,Buffer.from([240,159,152,128]));
  assert.deepEqual(captured.stderrBytes,Buffer.from([255]));
  const [ordinary]=await isolatedTestCohort([nodeJob("ordinary","console.log('same')")]).completion;
  assert.equal(ordinary.stdout,"same\n");assert.equal("stdoutBytes" in ordinary,false);
  assert.throws(()=>isolatedTestCohort([job],{captureBytes:1}),/Bounded/);
});
test("raw capture shares the exact output bound and pending cancellation has empty byte custody", async () => {
  const [result]=await isolatedTestCohort([nodeJob("overflow","process.stdout.write('a'.repeat(100));process.stderr.write('b'.repeat(100))")],
    {captureBytes:true,outputLimit:5,killAfterMs:20}).completion;
  assert.match(result.error,/exceeded/u);assert.equal(result.stdoutBytes.length+result.stderrBytes.length,5);
  const abort=new AbortController();abort.abort();const [cancelled]=await isolatedTestCohort([nodeJob("pending","process.exit(0)")],{captureBytes:true,signal:abort.signal}).completion;
  assert.equal(cancelled.cancelled,true);assert.deepEqual(cancelled.stdoutBytes,Buffer.alloc(0));assert.deepEqual(cancelled.stderrBytes,Buffer.alloc(0));
});
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
    for (const pid of Object.values(pids)) assert.ok(terminated(pid), `owned process ${pid} survived cancellation`);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("isolated cohort deadlines stop the owned group and retain later case execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cohort-deadline-"));
  const file = join(directory, "owned.json");
  const leader = `const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});
    require('node:fs').writeFileSync(${JSON.stringify(file)},JSON.stringify({leader:process.pid,child:child.pid}));
    setInterval(()=>{},1000);`;
  try {
    const results = await isolatedTestCohort([nodeJob("deadline", leader), nodeJob("later", "console.log('completed')")],
      {concurrency: 1, timeoutMs: 1000, killAfterMs: 50}).completion;
    const pids = JSON.parse(await readFile(file, "utf8"));
    assert.match(results[0].error, /timed out after 1000 milliseconds/);
    assert.equal(results[0].cancelled, false);
    for (const pid of Object.values(pids)) assert.throws(() => process.kill(pid, 0), {code: "ESRCH"});
    assert.equal(results[1].code, 0); assert.equal(results[1].error, null);
    assert.match(results[1].stdout, /completed/);
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test("isolated cohort rejects duplicate targets and unbounded worker settings", async () => {
  const job = nodeJob("same", "");
  assert.throws(() => isolatedTestCohort([job, job]), /Unique named/);
  for (const concurrency of [0, 9, 1.5, NaN, Infinity])
    assert.throws(() => isolatedTestCohort([job], { concurrency }), /Bounded/);
  for (const timeoutMs of [-1, NaN, Infinity, 1.5]) {
    assert.throws(() => isolatedTestCohort([job], {timeoutMs}), /Bounded/);
  }
  const abort = new AbortController(); abort.abort();
  const cohort = isolatedTestCohort([job], { signal: abort.signal });
  assert.equal((await cohort.completion)[0].cancelled, true);
  assert.throws(() => cohort.outcome("foreign"), /Unknown/);
});

test("eight independent workers enter an actual barrier while retaining ordered failures and raw bytes", async () => {
  const directory = await ownedDirectory("cohort-eight-");
  try {
    const jobs = Array.from({ length: 16 }, (_, index) => nodeJob(String(index), `
      const fs=require('node:fs');const directory=${JSON.stringify(directory)};
      const start=Date.now();fs.writeFileSync(directory+'/'+${index},String(process.pid));
      const deadline=Date.now()+5000;
      const timer=setInterval(()=>{
        if(fs.readdirSync(directory).length>=8){clearInterval(timer);setTimeout(()=>{
          console.log(JSON.stringify({start,end:Date.now(),index:${index},pid:process.pid}));
          process.stderr.write(Buffer.from([255]));process.exitCode=${index === 7 ? 3 : 0};},20);}
        else if(Date.now()>deadline){clearInterval(timer);process.exitCode=99;}
      },5);`));
    const results = await isolatedTestCohort(jobs, { concurrency: 8, captureBytes: true, timeoutMs: 10000 }).completion;
    assert.deepEqual(results.map(result => result.name), jobs.map(job => job.name));
    assert.deepEqual(results.map(result => result.code), jobs.map((_, index) => index === 7 ? 3 : 0));
    const spans = results.map((result, index) => {
      assert.equal(result.error, null); assert.equal(result.cancelled, false);
      assert.deepEqual(result.stderrBytes, Buffer.from([255]));
      const span = JSON.parse(result.stdoutBytes); assert.equal(span.index, index); return span;
    });
    const events = spans.flatMap(span => [[span.start, 1], [span.end, -1]])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let active = 0, peak = 0;
    for (const [, change] of events) { active += change; peak = Math.max(active, peak); }
    assert.equal(active, 0); assert.equal(peak, 8);
    assert.equal(new Set(spans.map(span => span.pid)).size, 16);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("eight-worker cancellation drains active jobs and retains the ninth queued result", async () => {
  const directory = await ownedDirectory("cohort-eight-cancel-");
  try {
    const abort = new AbortController();
    const jobs = Array.from({ length: 9 }, (_, index) => nodeJob(String(index), `
      require('node:fs').writeFileSync(${JSON.stringify(directory)}+'/'+${index},String(process.pid));
      setInterval(()=>{},1000);`));
    const cohort = isolatedTestCohort(jobs, { concurrency: 8, signal: abort.signal, killAfterMs: 50, captureBytes: true });
    const deadline = Date.now() + 5000;
    while ((await readdir(directory)).length < 8 && Date.now() < deadline) await new Promise(done => setTimeout(done, 10));
    const files = await readdir(directory); assert.equal(files.length, 8);
    abort.abort();
    const results = await cohort.completion;
    assert.equal(results.length, 9); assert.ok(results.every(result => result.cancelled));
    assert.equal(results[8].code, null); assert.equal(results[8].stdoutBytes.length, 0);
    for (const file of files) assert.ok(terminated(Number(await readFile(join(directory, file), "utf8"))));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native Git decision preserves Linux, custom wrappers and malformed or mismatching equivalence", () => {
  const fact = { kind: "file", entry: { uid: 0, mode: 0o755 } };
  assert.equal(nativeGitEligible("darwin", "/usr/bin/git", fact), true);
  for (const [platform, path, value] of [["linux", "/usr/bin/git", fact], ["darwin", "/custom/git", fact],
    ["darwin", "/usr/bin/git", { ...fact, kind: "symlink" }],
    ["darwin", "/usr/bin/git", { ...fact, entry: { uid: 501, mode: 0o755 } }],
    ["darwin", "/usr/bin/git", { ...fact, entry: { uid: 0, mode: 0o777 } }]])
    assert.equal(nativeGitEligible(platform, path, value), false);
  const valid = { version: "git version synthetic", exec_path: "/synthetic/git-core" };
  assert.doesNotThrow(() => assertNativeGitEquivalent(valid, { ...valid }));
  for (const invalid of [null, {}, { ...valid, version: "git version different" },
    { ...valid, exec_path: "/other/git-core" }, { ...valid, version: "git version synthetic\nextra" }])
    assert.throws(() => assertNativeGitEquivalent(valid, invalid), /equivalence/);
  assert.throws(() => assertNativeGitEquivalent({ ...valid, exec_path: "relative" }, valid), /equivalence/);
  for (const version of ["git version \t", "git version \u001b", "git version " + "x".repeat(4096)])
    assert.throws(() => assertNativeGitEquivalent({ ...valid, version }, { ...valid, version }), /equivalence/);
});

test("real native Git resource preserves original Python, Node and every existing environment value", async () => {
  const directory = await ownedDirectory("native-git-positive-");
  const environment = { ...process.env, NATIVE_VALIDATION_MARKER: "original" };
  const original = { ...environment };
  let resource;
  try {
    resource = await prepareNativeValidationGit({ parentDirectory: directory, environment });
    assert.deepEqual(environment, original); assert.ok(Object.isFrozen(resource.environment));
    assert.equal(resource.node, process.execPath); assert.equal(await resource.verify(), true);
    const expected = { ...environment };
    if (resource.provenance.mode === "direct-system-darwin-git") {
      expected.PATH = resource.provenance.private_directory + ":" + environment.PATH;
      assert.deepEqual(await readdir(resource.provenance.private_directory), ["git"]);
      assert.equal((await lstat(resource.provenance.private_directory)).mode & 0o777, 0o700);
      assertNativeGitEquivalent(resource.provenance.equivalence.shim, resource.provenance.equivalence.direct);
    } else assert.equal(nativeGitEligible(process.platform, resource.provenance.original_tools.git.path, resource.provenance.original_tools.git), false);
    assert.deepEqual(resource.environment, expected);
    const child = JSON.parse(execFileSync(resource.python, ["-c", "import hashlib,json,os,sys;keys=json.loads(sys.argv[1]);print(json.dumps({'executable':sys.executable,'sha256':hashlib.sha256(json.dumps({k:os.environ.get(k) for k in keys},sort_keys=True,separators=(',',':')).encode()).hexdigest()}))", JSON.stringify(Object.keys(expected))],
      { env: resource.environment, encoding: "utf8" }));
    const sorted = Object.fromEntries(Object.keys(expected).sort().map(key => [key, expected[key]]));
    assert.equal(child.executable, resource.python);
    assert.equal(child.sha256, createHash("sha256").update(JSON.stringify(sorted)).digest("hex"));
    await resource.dispose(); await resource.dispose();
    assert.deepEqual(await readdir(directory), []);
    await assert.rejects(resource.verify(), /disposed/);
  } finally { if (resource) await resource.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("real custom Git wrapper stays selected and executable tampering rejects verification", async () => {
  const directory = await ownedDirectory("native-git-custom-");
  let resource;
  try {
    const bin = join(directory, "bin"); await mkdir(bin);
    const wrapper = join(bin, "git"); await writeFile(wrapper, "#!/bin/sh\nprintf custom-wrapper\n", { mode: 0o755 });
    const nodeWrapper = join(bin, "node"); await writeFile(nodeWrapper, "#!/bin/sh\nprintf custom-node-wrapper\n", { mode: 0o755 });
    const environment = { ...process.env, PATH: bin + ":" + process.env.PATH };
    resource = await prepareNativeValidationGit({ parentDirectory: directory, environment });
    assert.equal(resource.provenance.mode, "original"); assert.deepEqual(resource.environment, environment);
    assert.equal(resource.provenance.original_tools.git.path, wrapper);
    assert.equal(resource.provenance.original_tools.node.path, nodeWrapper);
    assert.equal(resource.node, process.execPath);
    assert.equal("utility" in resource.provenance, false);
    assert.equal(execFileSync("git", ["--version"], { env: resource.environment, encoding: "utf8" }), "custom-wrapper");
    assert.equal(execFileSync("node", ["--version"], { env: resource.environment, encoding: "utf8" }), "custom-node-wrapper");
    await resource.verify(); await writeFile(wrapper, "#!/bin/sh\nprintf changed-wrapper\n");
    await assert.rejects(resource.verify(), /Original tool executable changed/);
    await resource.dispose(); assert.deepEqual(await readdir(directory), ["bin"]);
    await unlink(wrapper); await symlink("/usr/bin/git", wrapper);
    resource = await prepareNativeValidationGit({ parentDirectory: directory, environment });
    assert.equal(resource.provenance.mode, "original");
    assert.equal(resource.provenance.original_tools.git.kind, "symlink");
    assert.deepEqual(resource.environment, environment);
    assert.equal("utility" in resource.provenance, false);
    await resource.verify(); await resource.dispose();
  } finally { if (resource) await resource.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("native resource rejects directory, foreign-entry and link tampering with owned cleanup", async () => {
  const directory = await ownedDirectory("native-git-custody-");
  let resource;
  try {
    resource = await prepareNativeValidationGit({ parentDirectory: directory });
    if (resource.provenance.mode === "direct-system-darwin-git") {
      const privateDirectory = resource.provenance.private_directory;
      await chmod(privateDirectory, 0o755); await assert.rejects(resource.verify(), /directory custody/); await chmod(privateDirectory, 0o700);
      const savedDirectory = join(directory, "saved-directory");
      await rename(privateDirectory, savedDirectory); await mkdir(privateDirectory, { mode: 0o700 });
      const foreignMarker = join(privateDirectory, "foreign-marker"); await writeFile(foreignMarker, "preserve-replaced-directory");
      await assert.rejects(resource.verify(), /directory custody/); await assert.rejects(resource.dispose(), /directory custody/);
      assert.equal(await readFile(foreignMarker, "utf8"), "preserve-replaced-directory");
      await rm(privateDirectory, { recursive: true }); await rename(savedDirectory, privateDirectory);
      await resource.verify();
      const foreign = join(privateDirectory, "foreign"); await writeFile(foreign, "preserve");
      await assert.rejects(resource.verify(), /only its owned link/); await assert.rejects(resource.dispose(), /only its owned link/);
      assert.equal(await readFile(foreign, "utf8"), "preserve"); await unlink(foreign);
      const link = join(privateDirectory, "git"), saved = join(directory, "saved-link");
      await rename(link, saved); await symlink("/usr/bin/git", link);
      await assert.rejects(resource.verify(), /link identity/); await assert.rejects(resource.dispose(), /link ownership/);
      await unlink(link); await rename(saved, link); await resource.dispose();
    } else await resource.dispose();
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
