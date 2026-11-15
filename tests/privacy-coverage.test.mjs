import assert from "node:assert/strict";
import {copyFile, mkdir, mkdtemp, readdir, readFile, rm, rename, symlink, writeFile} from "node:fs/promises";
import {execFile,spawn} from "node:child_process";
import {promisify} from "node:util";
import {createHash, createHmac} from "node:crypto";
import {EventEmitter,once} from "node:events";
import {join} from "node:path";
import test from "node:test";
import {privacyFileCoverage, privacyPolicyIdentity, privacyPolicyDigest, privacyCoveragePartition, privacyTransitionProof} from "../scripts/lib/privacy-coverage.mjs";
import {createPrivacyScanPool} from "../scripts/lib/privacy-scan-pool.mjs";
import {privacyPolicyPreview, scanPrivacyFile, root as projectRoot} from "../scripts/check-customer-data.mjs";
import {createDeterministicZip} from "../scripts/lib/deterministic-zip.mjs";
const exec = promisify(execFile);

async function fixture(t) {
  await mkdir(join(projectRoot,"Vault/tmp"),{recursive:true});
  const root = await mkdtemp(join(projectRoot,"Vault/tmp/pc-"));
  t.after(() => rm(root, {recursive: true, force: true}));
  const directory = join(root, ".git", "oracle", "privacy-coverage");
  const paths = [join(root, "a.txt"), join(root, "b.txt"), join(root, "c.txt")];
  for (const path of paths) await writeFile(path, "synthetic safe bytes");
  let calls = [];
  const scan = async (path, body) => {
    calls.push(path);
    return body.includes("synthetic-blocked") ? ["synthetic failing observation"] : [];
  };
  return {root, directory, paths, scan, calls,
    run: options => privacyFileCoverage({root, directory, candidates: paths, policy: {rules: "original", environment: "original"},
      source: {commit: "a".repeat(40), tree: "b".repeat(40)}, scan, ...options})};
}

async function transition(f, previous, current, changes = {}) {
  const sorted = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  const payload = sorted({kind: "boc-privacy-policy-transition-v1", scope: "UNCHANGED_NON_ARCHIVE_PASS",
    previous_policy_sha256: privacyPolicyDigest(previous), current_policy_sha256: privacyPolicyDigest(current),
    technical_receipt_sha256: "a".repeat(64), facts_sha256: "b".repeat(64), ...changes});
  const key = await readFile(join(f.directory, "issuer.key"));
  const signature = createHmac("sha256", key).update(JSON.stringify(payload) + "\n").digest("hex");
  const path = join(f.directory, "transitions", privacyPolicyDigest(current) + ".json");
  await writeFile(path, JSON.stringify(sorted({...payload, signature}), null, 2) + "\n", {mode: 0o600});
  return path;
}

test("privacy reuses exact file results across CLs and scans only changed membership/content", async t => {
  const f = await fixture(t);
  const cold = await f.run();
  assert.equal(cold.report.scanned, 3);
  const originals = await readdir(join(f.directory, "records"));
  const warm = await f.run({source: {commit: "c".repeat(40), tree: "d".repeat(40)}});
  assert.equal(warm.report.scanned, 0); assert.equal(warm.report.reused, 3);
  assert.deepEqual(await readdir(join(f.directory, "records")), originals);
  const retained = JSON.parse(await readFile(join(f.directory, "records", originals[0])));
  assert.equal(retained.source.commit, "a".repeat(40));
  await writeFile(f.paths[0], "changed safe bytes");
  assert.equal((await f.run()).report.scanned, 1);
  const added = join(f.root, "new.txt"); await writeFile(added, "new safe bytes");
  const changed = await f.run({candidates: [f.paths[0], f.paths[1], added]});
  assert.equal(changed.report.scanned, 1); assert.equal(changed.report.reused, 2);
  assert.notEqual(changed.report.membership_sha256, warm.report.membership_sha256);
  assert.equal(changed.report.files.length, 3);
});

test("rules, functional environment, executable policy and native exception context invalidate affected coverage", async t => {
  const f = await fixture(t); await f.run();
  for (const policy of [{rules: "changed"}, {environment: "changed"}, {executable: "changed"}]) {
    const result = await f.run({policy}); assert.equal(result.report.scanned, 3); assert.equal(result.report.reused, 0);
  }
  const context = await f.run({contextFor: async path => path === f.paths[0] ? {native: "changed"} : {}});
  assert.equal(context.report.scanned, 1); assert.equal(context.report.reused, 2);
});

test("unchanged failed file observations remain failed and completed files survive an aggregate execution error", async t => {
  const f = await fixture(t); await writeFile(f.paths[1], "synthetic-blocked");
  const failed = await f.run(); assert.equal(failed.report.outcome, "FAILED");
  const warm = await f.run(); assert.deepEqual(warm.findings, failed.findings); assert.equal(warm.report.reused, 3);
  const policy = {new: "execution checkpoint"};
  await assert.rejects(f.run({policy, scan: async (path, body) => {
    if (path === f.paths[1]) throw new Error("synthetic scanner interruption");
    return f.scan(path, body);
  }}), /scanner interruption/u);
  // Both independently completed files retain signed checkpoints; the thrown
  // scanner failure alone is retried and must still become an explicit finding.
  const resumed = await f.run({policy}); assert.equal(resumed.report.reused, 2); assert.equal(resumed.report.scanned, 1);
  assert.equal(resumed.report.outcome, "FAILED");
});

test("corrupt cached passes cannot conceal an original failure and linked metadata never supplies coverage", async t => {
  const f = await fixture(t); await writeFile(f.paths[0], "synthetic-blocked"); await f.run();
  for (const name of await readdir(join(f.directory, "by-input"))) {
    const path = join(f.directory, "by-input", name);
    const pointer = JSON.parse(await readFile(path));
    const recordPath = join(f.directory, "records", pointer.record), record = JSON.parse(await readFile(recordPath));
    if (record.input.path === "a.txt") { record.findings = []; await writeFile(recordPath, JSON.stringify(record) + "\n"); }
  }
  const result = await f.run(); assert.equal(result.report.invalidated, 1); assert.equal(result.report.scanned, 1);
  assert.equal(result.report.outcome, "FAILED");
  await rm(join(f.directory, "by-input"), {recursive: true});
  const outside = await mkdtemp(join(projectRoot,"Vault/tmp/po-"));
  t.after(() => rm(outside, {recursive: true, force: true}));
  await symlink(outside, join(f.directory, "by-input"));
  await assert.rejects(f.run(), /owned private directory/u); assert.deepEqual(await readdir(outside), []);
});

test("scanner consumes captured bytes and changed live content cannot reuse that result", async t => {
  const f = await fixture(t);
  await f.run({candidates: [f.paths[0]], scan: async (path, body) => {
    await writeFile(path, "synthetic-blocked");
    assert.equal(body.toString(), "synthetic safe bytes"); return [];
  }});
  const current = await f.run({candidates: [f.paths[0]]});
  assert.equal(current.report.scanned, 1); assert.equal(current.report.outcome, "FAILED");
  await rm(f.paths[0]); await assert.rejects(f.run(), /Required privacy input became unavailable/u);
});

test("real privacy policy identity binds bytes and declared functional environment while preserving chat bookkeeping", async t => {
  const f = await fixture(t), config = f.paths[0];
  const before = process.env.CODEX_THREAD_ID;
  t.after(() => { if (before === undefined) delete process.env.CODEX_THREAD_ID; else process.env.CODEX_THREAD_ID = before; });
  process.env.CODEX_THREAD_ID = "synthetic-chat-A"; const original = await privacyPolicyIdentity([config]);
  process.env.CODEX_THREAD_ID = "synthetic-chat-B";
  const current = await privacyPolicyIdentity([config]);
  assert.notEqual(current.provenance.environment_sha256, original.provenance.environment_sha256);
  assert.deepEqual({...current, provenance: null}, {...original, provenance: null});
  await f.run({policy: original}); assert.equal((await f.run({policy: current})).report.scanned, 0);
  await writeFile(config, "changed privacy rules"); assert.notDeepEqual(await privacyPolicyIdentity([config]), original);
});

test("archive option and locale environment changes invalidate original privacy applicability", async t => {
  const f = await fixture(t);
  for (const name of ["UNZIP", "UNZIPOPT", "ZIPINFO", "ZIPINFOOPT", "LC_CTYPE", "LC_MESSAGES", "LC_COLLATE"]) {
    const previous = process.env[name];
    const original = await privacyPolicyIdentity([f.paths[0]]);
    await f.run({policy: original});
    try {
      process.env[name] = "synthetic-functional-change";
      const changed = await privacyPolicyIdentity([f.paths[0]]);
      assert.notDeepEqual(changed.environment, original.environment);
      assert.equal((await f.run({policy: changed})).report.scanned, 3);
      assert.equal((await f.run({policy: changed})).report.reused, 3);
    } finally {
      if (previous === undefined) delete process.env[name]; else process.env[name] = previous;
    }
  }
});

test("fresh ZIP inspection rejects unsafe content despite inherited UNZIPOPT and retains the real failed observation", async t => {
  const f = await fixture(t);
  for (const directory of ["scripts/lib", "privacy"]) await mkdir(join(f.root, directory), {recursive: true});
  for (const name of ["scripts/check-customer-data.mjs", "scripts/lib/privacy-coverage.mjs",
    "scripts/lib/privacy-scan-pool.mjs", "scripts/lib/privacy-scan-worker.mjs",
    "privacy/customer-identifiers.sha256", "privacy/approved-binary-assets.sha256",
    "privacy/owned-github-pr-identities.json", "privacy/owned-native-probe-identities.json"])
    await copyFile(new URL("../" + name, import.meta.url), join(f.root, name));
  for (const args of [["init", "-q"], ["config", "user.name", "Synthetic Privacy"],
    ["config", "user.email", "fixture@example.invalid"], ["add", "scripts", "privacy"], ["commit", "-qm", "baseline"]])
    await exec("git", args, {cwd: f.root});
  await writeFile(join(f.root, "payload.txt"), ["synthetic-probe", "@", "private-domain", ".com"].join(""));
  await exec("zip", ["-q", "fixture.zip", "payload.txt"], {cwd: f.root});
  const entry = "const m=await import('./scripts/check-customer-data.mjs');const findings=await m.fixturePrivacyFailures(['fixture.zip']);console.log(JSON.stringify({findings,report:m.lastPrivacyCoverage}));";
  const environment = {...process.env};
  for (const name of ["UNZIP", "UNZIPOPT", "ZIPINFO", "ZIPINFOOPT"]) delete environment[name];
  const invoke = async options => JSON.parse((await exec(process.execPath, ["--input-type=module", "-e", entry],
    {cwd: f.root, env: {...environment, ...options}})).stdout);
  const cold = await invoke({UNZIPOPT: "-z"});
  assert.equal(cold.report.scanned, 1); assert.equal(cold.report.outcome, "FAILED");
  assert.ok(cold.findings.some(value => value.includes("non-synthetic email address")));
  const warm = await invoke({UNZIPOPT: "-z"});
  assert.equal(warm.report.reused, 1); assert.deepEqual(warm.findings, cold.findings);
  const normal = await invoke({});
  assert.equal(normal.report.scanned, 1); assert.equal(normal.report.outcome, "FAILED");
});

test("production privacy CLI preserves full source/Vault membership and consumes prior exact-file results", async t => {
  const f = await fixture(t);
  for (const directory of ["scripts/lib", "privacy", "source", "Vault/tmp"]) await mkdir(join(f.root, directory), {recursive: true});
  for (const name of ["scripts/check-customer-data.mjs", "scripts/lib/privacy-coverage.mjs",
    "scripts/lib/privacy-scan-pool.mjs", "scripts/lib/privacy-scan-worker.mjs",
    "privacy/customer-identifiers.sha256", "privacy/approved-binary-assets.sha256",
    "privacy/owned-github-pr-identities.json", "privacy/owned-native-probe-identities.json"])
    await copyFile(new URL("../" + name, import.meta.url), join(f.root, name));
  for(let index=0;index<40;index++)await writeFile(join(f.root,"source",`synthetic-${index}.txt`),"synthetic worker input");
  for (const args of [["init", "-q"], ["config", "user.name", "Synthetic Privacy"],
    ["config", "user.email", "fixture@example.invalid"], ["add", "scripts", "privacy", "source"], ["commit", "-qm", "baseline"]])
    await exec("git", args, {cwd: f.root});
  const entry = "const m=await import('./scripts/check-customer-data.mjs');const findings=await m.privacyFailures();console.log(JSON.stringify({findings,report:m.lastPrivacyCoverage}));";
  const invoke = async () => JSON.parse((await exec(process.execPath, ["--input-type=module", "-e", entry], {cwd: f.root})).stdout);
  const cold = await invoke(); assert.deepEqual(cold.findings, []); assert.ok(cold.report.scanned >= 9);
  assert.equal(cold.report.concurrency,8);assert.equal(cold.report.bridged,0);
  const warm = await invoke(); assert.equal(warm.report.scanned, 0); assert.equal(warm.report.reused, cold.report.scanned);
  const artifact = join(f.root, "Vault/tmp/new.log"); await writeFile(artifact, "synthetic private validation artifact");
  const added = await invoke(); assert.equal(added.report.scanned, 1); assert.equal(added.report.files.length, cold.report.files.length + 1);
  await rm(artifact); const removed = await invoke();
  assert.equal(removed.report.scanned, 0); assert.equal(removed.report.files.length, cold.report.files.length);
  assert.notEqual(removed.report.membership_sha256, added.report.membership_sha256);
  const large=join(f.root,"Vault/tmp/large.txt"),address=["someone","production-domain.invalidated"].join("@");
  await writeFile(large,"x".repeat(8*1024*1024)+"\n"+address);
  const fullFallback=await invoke();assert(fullFallback.findings.some(row=>row.includes("large.txt: non-synthetic email")));
  assert(fullFallback.report.scanned_bytes>8*1024*1024);assert.equal(fullFallback.report.scanned,1);
  await rm(large);assert.equal((await invoke()).report.outcome,"PASSED");
  const token="a".repeat(64),child=spawn(process.execPath,["--input-type=module","-e",entry],{cwd:f.root,
    env:{...process.env,BOC_PRIVACY_READY_FD:"3",BOC_PRIVACY_READY_TOKEN:token},stdio:["ignore","pipe","pipe","pipe"]});
  let output="",errors="";child.stdout.on("data",chunk=>output+=chunk);child.stderr.on("data",chunk=>errors+=chunk);
  const finished=once(child,"close");
  const ready=await new Promise((resolve,reject)=>{let bytes="";child.stdio[3].on("data",chunk=>{bytes+=chunk;
    if(bytes.length>1024)reject(Error("oversized readiness"));else if(bytes.includes("\n"))resolve(JSON.parse(bytes));});child.on("error",reject);});
  assert.equal(ready.kind,"boc-privacy-snapshot-ready-v1");assert.equal(ready.token,token);
  assert.match(ready.source,/^[0-9a-f]{40}$/u);assert.match(ready.policy_sha256,/^[0-9a-f]{64}$/u);
  // Unique test fixtures created after this barrier cannot disappear from the
  // already captured membership. A following scan still discovers every file.
  const later=join(f.root,"Vault/tmp/post-snapshot.txt");await writeFile(later,address);
  assert.equal((await finished)[0],0,errors);const captured=JSON.parse(output);
  assert.equal(captured.report.files.length,ready.files);assert.deepEqual(captured.findings,[]);
  assert((await invoke()).findings.some(row=>row.includes("post-snapshot.txt: non-synthetic email")));
  await rm(later);

});

test("reviewed archive-only transition retains exact original non-archive passes and executes archive members", async t => {
  const f = await fixture(t), previous = {rules: "original"}, current = {rules: "original", archive: "sanitized"};
  const archive = join(f.root, "artifact.zip"); await writeFile(archive, "synthetic archive bytes");
  const candidates = [...f.paths, archive];
  await f.run({policy: previous, candidates});
  const originals = new Map(await Promise.all((await readdir(join(f.directory, "records")))
    .map(async name => [name, await readFile(join(f.directory, "records", name))])));
  await transition(f, previous, current);
  const adopted = await f.run({policy: current, candidates});
  assert.equal(adopted.report.bridged, 3); assert.equal(adopted.report.reused, 3); assert.equal(adopted.report.scanned, 1);
  assert.equal(adopted.report.files.find(row => row.path.endsWith(".zip")).retained, undefined);
  for (const [name, bytes] of originals) assert.deepEqual(await readFile(join(f.directory, "records", name)), bytes);
  await writeFile(f.paths[0], "changed bytes under repaired policy");
  const changed = await f.run({policy: current, candidates});
  assert.equal(changed.report.bridged, 2); assert.equal(changed.report.scanned, 1); assert.equal(changed.report.reused, 3);
});

test("transition assessment partitions authentic originals and captures affected data without activating a bridge", async t => {
  const f = await fixture(t), previous = {rules: "original"}, current = {rules: "original", archive: "sanitized"};
  const archive = join(f.root, "artifact.zip"); await writeFile(archive, "synthetic archive bytes");
  await f.run({policy: previous, candidates: [...f.paths, archive]});
  const added = join(f.root, "added.txt"); await writeFile(added, "new uncovered bytes");
  const candidates = [...f.paths, archive, added];
  const partition = await privacyCoveragePartition({root: f.root, directory: f.directory, candidates,
    policy: current, previousPolicy: privacyPolicyDigest(previous)});
  assert.equal(partition.files.filter(row => row.original).length, 3);
  const selected = partition.files.filter(row => !row.original).map(row => join(f.root, row.path));
  const checked = await f.run({policy: current, candidates: selected}); assert.equal(checked.report.scanned, 2);
  const proof = await privacyTransitionProof({root: f.root, directory: f.directory, partition,
    validation: checked.report, findings: checked.findings});
  assert.equal(proof.affected_count, 2); assert.equal(proof.archive_count, 1); assert.equal(proof.original_pass_count, 3);
  assert.deepEqual(await readdir(join(f.directory, "transitions")), []);
  const unapproved = await f.run({policy: current, candidates});
  assert.equal(unapproved.report.bridged, 0); assert.equal(unapproved.report.scanned, 3);
});

test("forged/stale transition facts, changed original proof and original failures never grant a bridged pass", async t => {
  for (const variant of ["signature", "scope", "policy", "proof", "failure"]) {
    const f = await fixture(t), previous = {rules: "original"}, current = {rules: "original", archive: "sanitized"};
    if (variant === "failure") await writeFile(f.paths[0], "synthetic-blocked");
    await f.run({policy: previous});
    const path = await transition(f, previous, current, variant === "scope" ? {scope: "ALL_FILES"}
      : variant === "policy" ? {current_policy_sha256: "c".repeat(64)} : {});
    if (variant === "signature") await writeFile(path, (await readFile(path, "utf8")).replace('"signature": "', '"signature": "0'));
    if (variant === "proof") {
      for (const name of await readdir(join(f.directory, "records"))) {
        const path = join(f.directory, "records", name), record = JSON.parse(await readFile(path));
        if (record.input.path === "a.txt") { record.source.commit = "changed original"; await writeFile(path, JSON.stringify(record) + "\n"); }
      }
    }
    const result = await f.run({policy: current});
    assert.equal(result.report.bridged, ["proof", "failure"].includes(variant) ? 2 : 0);
    assert.equal(result.report.scanned, ["proof", "failure"].includes(variant) ? 1 : 3);
    if (variant === "failure") assert.equal(result.report.outcome, "FAILED");
    else assert.ok(result.report.invalidated > 0);
  }
});

test("bounded independent file observations preserve sorted merge, exact snapshots and atomic reuse", async t => {
  const f=await fixture(t);let active=0,peak=0;
  const result=await f.run({concurrency:4,candidates:[...f.paths].reverse(),scan:async(path,body)=>{
    active++;peak=Math.max(peak,active);const snapshot=body.toString("utf8");
    await new Promise(resolve=>setTimeout(resolve,path.endsWith("a.txt")?30:5));
    active--;assert.equal(snapshot,"synthetic safe bytes");return path.endsWith("b.txt")?["synthetic recorded failure"]:[];
  }});
  assert(peak>1&&peak<=4);assert.deepEqual(result.report.files.map(row=>row.path),["a.txt","b.txt","c.txt"]);
  assert(result.report.max_input_reads<=2);
  assert.deepEqual(result.findings,["synthetic recorded failure"]);assert.equal(result.report.bytes,3*Buffer.byteLength("synthetic safe bytes"));
  assert.equal(result.report.scanned,3);assert.equal(result.report.bridged,0);
  const warm=await f.run({concurrency:4});assert.equal(warm.report.reused,3);assert.equal(warm.report.scanned,0);assert.equal(warm.report.outcome,"FAILED");
  await assert.rejects(f.run({concurrency:9}),/Bounded/);
});

test("canonical FIFO persists later observations while the first input remains blocked",async t=>{
  const f=await fixture(t),last=join(f.root,"z.txt"),paths=[...f.paths,last];
  for(const [index,path]of paths.entries())await writeFile(path,"x".repeat([256,64,64,1][index]));
  let release;const held=new Promise(resolve=>release=resolve);t.after(()=>release());const started=[];
  const resultPromise=f.run({candidates:[...paths].reverse(),concurrency:2,contextFor:async path=>({item:path.slice(-5)}),scan:async(path,body)=>{
    started.push(path);if(path===paths[0]){await writeFile(path,"later source mutation");await held;}
    return path===paths[1]?["synthetic exact finding"]:[];
  }});
  let records=[];
  for(let attempt=0;attempt<200;attempt++){
    try{records=await Promise.all((await readdir(join(f.directory,"records"))).map(async name=>JSON.parse(await readFile(join(f.directory,"records",name)))));}catch(error){if(error.code!=="ENOENT")throw error;}
    if(records.length===3)break;await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.deepEqual([...started.slice(0,2)].sort(),[paths[0],paths[1]].sort());
  assert(started.indexOf(paths[1])<started.indexOf(paths[2]));assert.equal(records.length,3);assert(records.every(row=>row.input.path!=="a.txt"));
  release();const result=await resultPromise;
  assert.deepEqual(result.report.files.map(row=>row.path),["a.txt","b.txt","c.txt","z.txt"]);
  assert.equal(result.report.files[0].sha256,createHash("sha256").update("x".repeat(256)).digest("hex"));
  assert.deepEqual(result.findings,["synthetic exact finding"]);assert(result.report.max_input_reads<=2);
});

test("canonical FIFO input and scan errors reject in canonical order without a partial pass",async t=>{
  const f=await fixture(t);
  await assert.rejects(f.run({candidates:[join(f.root,"missing-z.txt"),join(f.root,"missing-a.txt")],concurrency:2}),error=>{
    assert(error instanceof AggregateError);assert.equal(error.errors.length,2);
    assert(error.errors[0].message.endsWith("missing-a.txt"));assert(error.errors[1].message.endsWith("missing-z.txt"));return true;
  });
  const attempted=[];
  await assert.rejects(f.run({concurrency:2,scan:async path=>{attempted.push(path);await new Promise(resolve=>setTimeout(resolve,path.endsWith("a.txt")?30:1));throw Error(path.slice(-5));}}),error=>{
    assert.deepEqual(error.errors.map(row=>row.message),["a.txt","b.txt","c.txt"]);return true;
  });
  assert.equal(attempted.length,3);assert.equal((await readdir(join(f.directory,"runs"))).length,0);
});

test("canonical FIFO retains exact findings and input identities against the retired size dispatcher",async t=>{
  const f=await fixture(t),paths=Array.from({length:6},(_,n)=>join(f.root,n===5?"z.txt":String.fromCharCode(97+n)+".txt"));
  for(const [index,path]of paths.entries())await writeFile(path,"x".repeat(index===5?8:1));
  const source=await readFile(new URL("../scripts/lib/privacy-coverage.mjs",import.meta.url),"utf8");
  const referenceSource=source.replace("  let position = 0, reading = 0",`  const referenceDispatch=(await Promise.all(paths.map(async(path,ordinal)=>({ordinal,size:(await lstat(path)).size})))).sort((a,b)=>b.size-a.size||a.ordinal-b.ordinal);
  let position = 0, reading = 0`).replace("const ordinal = position++;","const {ordinal} = referenceDispatch[position++];");
  assert.notEqual(referenceSource,source);const reference=await import("data:text/javascript;base64,"+Buffer.from(referenceSource).toString("base64"));
  const scan=async(path,body)=>{await new Promise(resolve=>setTimeout(resolve,body.length*20));return path.endsWith("b.txt")?["synthetic retained failure"]:[];};
  const contextFor=async path=>({snapshot:path.slice(-5)}),policy={rules:"exact-dispatch-equivalence"};
  const before=await reference.privacyFileCoverage({root:f.root,directory:join(f.root,".git/oracle/reference"),candidates:paths,policy,contextFor,scan,concurrency:2});
  const after=await f.run({candidates:[...paths].reverse(),policy,contextFor,scan,concurrency:2});
  assert.deepEqual(after.findings,before.findings);
  const observations=result=>result.report.files.map(({path,sha256,mode,outcome})=>({path,sha256,mode,outcome}));assert.deepEqual(observations(after),observations(before));
  const inputs=async directory=>(await Promise.all((await readdir(join(directory,"records"))).map(async name=>JSON.parse(await readFile(join(directory,"records",name))).input)))
    .map(({path,sha256,mode,policy_sha256,context_sha256})=>({path,sha256,mode,policy_sha256,context_sha256})).sort((a,b)=>a.path.localeCompare(b.path));
  assert.deepEqual(await inputs(f.directory),await inputs(join(f.root,".git/oracle/reference")));assert(after.report.max_input_reads<=2);assert.equal(after.report.scanned,6);assert.equal(after.report.bridged,0);
});

test("privacy policy binds the explicit native I/O thread configuration",async()=>{
  const original=process.env.UV_THREADPOOL_SIZE;
  try{process.env.UV_THREADPOOL_SIZE="4";const before=await privacyPolicyIdentity([]);
    process.env.UV_THREADPOOL_SIZE="8";const after=await privacyPolicyIdentity([]);
    assert.notEqual(privacyPolicyDigest(before),privacyPolicyDigest(after));
    assert.notEqual(before.environment.UV_THREADPOOL_SIZE,after.environment.UV_THREADPOOL_SIZE);
  }finally{if(original===undefined)delete process.env.UV_THREADPOOL_SIZE;else process.env.UV_THREADPOOL_SIZE=original;}
});

test("bounded parent persistence applies backpressure and drains every write before a command result",async t=>{
  const f=await fixture(t),paths=Array.from({length:10},(_,n)=>join(f.root,n+".txt"));
  for(const path of paths)await writeFile(path,"synthetic safe input");
  let release;globalThis.__privacyWriteGate=new Promise(resolve=>release=resolve);let scans=0;
  const source=await readFile(new URL("../scripts/lib/privacy-coverage.mjs",import.meta.url),"utf8");
  const heldSource=source.replace("await handle.sync();","if(path.includes('/records/')||path.includes('/by-input/'))await globalThis.__privacyWriteGate; await handle.sync();");
  assert.notEqual(source,heldSource);const module=await import("data:text/javascript;base64,"+Buffer.from(heldSource).toString("base64"));
  let finished=false;const pending=module.privacyFileCoverage({root:f.root,directory:f.directory,candidates:paths,policy:{rules:"synthetic-bounded-queue"},concurrency:2,
    scan:async()=>{scans++;return[];}}).then(value=>{finished=true;return value;});
  try{
    for(let n=0;n<200&&scans<4;n++)await new Promise(resolve=>setTimeout(resolve,5));
    await new Promise(resolve=>setTimeout(resolve,20));assert.equal(scans,4);assert.equal(finished,false);
    assert.equal((await readdir(join(f.directory,"runs"))).length,0);
  }finally{release();}
  const result=await pending;delete globalThis.__privacyWriteGate;
  assert.equal(result.report.scanned,10);assert.equal(result.report.max_active_persistence,2);assert.equal(result.report.max_awaiting_persistence,2);
  assert(result.report.max_input_reads<=2);assert.equal(result.report.phases.persistence.calls,10);
  assert.equal((await readdir(join(f.directory,"records"))).length,10);
  assert.equal((await f.run({candidates:paths,policy:{rules:"synthetic-bounded-queue"}})).report.reused,10);
});

test("queued pointer custody failure retains immutable records and never emits a partial pass",async t=>{
  const f=await fixture(t),outside=join(f.root,"outside");await mkdir(outside);let poison;
  await assert.rejects(f.run({concurrency:2,scan:async()=>{
    poison??=(async()=>{await rename(join(f.directory,"by-input"),join(f.directory,"original-input"));await symlink(outside,join(f.directory,"by-input"));})();
    await poison;return[];
  }}),/owned private directory/u);
  assert.deepEqual(await readdir(outside),[]);assert.equal((await readdir(join(f.directory,"runs"))).length,0);
  const originals=await Promise.all((await readdir(join(f.directory,"records"))).map(async name=>({name,bytes:await readFile(join(f.directory,"records",name))})));
  assert.equal(originals.length,3);await rm(join(f.directory,"by-input"));await rename(join(f.directory,"original-input"),join(f.directory,"by-input"));
  const repaired=await f.run({concurrency:2});assert.equal(repaired.report.scanned,3);assert.equal(repaired.report.outcome,"PASSED");
  for(const row of originals)assert.deepEqual(await readFile(join(f.directory,"records",row.name)),row.bytes);
});

test("queued parent records retain large findings and exact coupled input/context semantics",async t=>{
  const f=await fixture(t),source=await readFile(new URL("../scripts/lib/privacy-coverage.mjs",import.meta.url),"utf8");
  const referenceSource=source.replace("await persist(ordinal,path,async()=>{","await (async()=>{").replace("},Buffer.byteLength(raw)>64*1024);","})();");
  assert.notEqual(referenceSource,source);const reference=await import("data:text/javascript;base64,"+Buffer.from(referenceSource).toString("base64"));
  const finding="synthetic finding "+"x".repeat(70000),scan=async path=>path.endsWith("b.txt")?[finding]:[],contextFor=async path=>({exact:path.slice(-5)}),policy={rules:"exact-coupled-equivalence"};
  const prior=await reference.privacyFileCoverage({root:f.root,directory:join(f.root,".git/oracle/prior"),candidates:f.paths,policy,scan,contextFor,concurrency:2});
  const result=await f.run({policy,scan,contextFor,concurrency:2});assert.deepEqual(result.findings,prior.findings);
  assert.deepEqual(result.report.files.map(({path,sha256,mode,outcome})=>({path,sha256,mode,outcome})),prior.report.files.map(({path,sha256,mode,outcome})=>({path,sha256,mode,outcome})));
  const inputs=async directory=>(await Promise.all((await readdir(join(directory,"records"))).map(async name=>JSON.parse(await readFile(join(directory,"records",name))).input)))
    .map(({path,sha256,mode,policy_sha256,context_sha256})=>({path,sha256,mode,policy_sha256,context_sha256})).sort((a,b)=>a.path.localeCompare(b.path));
  assert.deepEqual(await inputs(f.directory),await inputs(join(f.root,".git/oracle/prior")));
  assert.equal(result.report.outcome,"FAILED");assert(result.report.max_active_persistence<=2);assert(result.report.max_awaiting_persistence<=2);
});

async function workerConfiguration(){
  const ruleHashes={},bodies=[];
  for(const name of ["privacy/customer-identifiers.sha256","privacy/approved-binary-assets.sha256","privacy/owned-github-pr-identities.json"]){
    const path=join(projectRoot,name),body=await readFile(path);ruleHashes[path]=createHash("sha256").update(body).digest("hex");bodies.push(body);
  }
  const policy=await privacyPolicyPreview();
  return{policySha256:policy.policy_sha256,ruleHashes,config:{blockedDigests:new Set(bodies[0].toString().split(/\s+/).filter(Boolean)),
    approvedBinaryDigests:new Set(bodies[1].toString().split(/\s+/).filter(Boolean)),githubIdentities:JSON.parse(bodies[2]),
    archiveExecutable:(await privacyPolicyIdentity([])).executables[1].path}};
}

test("real bounded worker scans equal direct policy for Unicode, escaped JSON, binary and archives",async t=>{
  const options=await workerConfiguration(),pool=await createPrivacyScanPool({...options,count:8});t.after(()=>pool.close());
  const address=["someone","production-domain.invalidated"].join("@");
  const values=[{name:"safe.md",body:Buffer.from("synthetic Unicode \u03bb")},
    {name:"escaped.json",body:Buffer.from(JSON.stringify({value:address}))},
    {name:"opaque.bin",body:Buffer.from([0,255,1])},
    {name:"archive.zip",body:createDeterministicZip([{path:"safe.txt",content:Buffer.from("synthetic safe bytes"),mode:0o644}])}];
  const inputs=[...values,...values];
  const results=await Promise.all(inputs.map(value=>pool.run(join(projectRoot,"Vault/tmp",value.name),value.body,{})));
  for(let index=0;index<inputs.length;index++)assert.deepEqual(results[index],await scanPrivacyFile(join(projectRoot,"Vault/tmp",inputs[index].name),inputs[index].body,{},options.config));
  assert(results[1].some(row=>row.includes("non-synthetic email")));assert(results[2].some(row=>row.includes("unreviewed binary")));
  await assert.rejects(pool.run("too-large.bin",Buffer.alloc(8*1024*1024+1),{}),/bound/);
});

test("worker source/rule mismatch and tampered input/context reply fail before observation signing",async t=>{
  const options=await workerConfiguration();
  await assert.rejects(createPrivacyScanPool({...options,policySha256:"0".repeat(64),count:1}),/identity|policy|failed/iu);
  const ruleHashes={...options.ruleHashes};ruleHashes[Object.keys(ruleHashes)[0]]="0".repeat(64);
  await assert.rejects(createPrivacyScanPool({...options,ruleHashes,count:1}),/identity|policy|failed/iu);
  for(const altered of ["path","body","context"]){
    class TamperedWorker extends EventEmitter{
      constructor(_url,options){super();assert.deepEqual(options.execArgv,[]);assert.equal(options.resourceLimits.maxOldGenerationSizeMb,384);this.policy=options.workerData.policySha256;queueMicrotask(()=>this.emit("message",{type:"ready",policySha256:this.policy}));}
      postMessage(request){const hash=value=>createHash("sha256").update(value).digest("hex");
        queueMicrotask(()=>this.emit("message",{type:"result",id:request.id,policySha256:this.policy,
          pathSha256:altered==="path"?"0".repeat(64):hash(request.path),sha256:altered==="body"?"0".repeat(64):hash(Buffer.from(request.body)),
          contextSha256:altered==="context"?"0".repeat(64):hash(JSON.stringify(request.context)),findings:[]}));}
      async terminate(){return 0;}
    }
    const pool=await createPrivacyScanPool({...options,count:1,WorkerClass:TamperedWorker});
    try{await assert.rejects(pool.run("sample.txt",Buffer.from("synthetic bytes"),{}),/identity mismatch/);}finally{await pool.close();}
  }
  await assert.rejects(createPrivacyScanPool({...options,count:9}),/Bounded/);
});
