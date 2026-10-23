import assert from "node:assert/strict";
import {copyFile, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createHmac} from "node:crypto";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {privacyFileCoverage, privacyPolicyIdentity, privacyPolicyDigest, privacyCoveragePartition, privacyTransitionProof} from "../scripts/lib/privacy-coverage.mjs";
const exec = promisify(execFile);

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "boc-privacy-coverage-"));
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
  const resumed = await f.run({policy}); assert.equal(resumed.report.reused, 1); assert.equal(resumed.report.scanned, 2);
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
  const outside = await mkdtemp(join(tmpdir(), "boc-privacy-outside-"));
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
  for (const directory of ["scripts/lib", "privacy", "Vault/tmp"]) await mkdir(join(f.root, directory), {recursive: true});
  for (const name of ["scripts/check-customer-data.mjs", "scripts/lib/privacy-coverage.mjs",
    "privacy/customer-identifiers.sha256", "privacy/approved-binary-assets.sha256",
    "privacy/owned-github-pr-identities.json", "privacy/owned-native-probe-identities.json"])
    await copyFile(new URL("../" + name, import.meta.url), join(f.root, name));
  for (const args of [["init", "-q"], ["config", "user.name", "Synthetic Privacy"],
    ["config", "user.email", "fixture@example.invalid"], ["add", "scripts", "privacy"], ["commit", "-qm", "baseline"]])
    await exec("git", args, {cwd: f.root});
  const entry = "const m=await import('./scripts/check-customer-data.mjs');const findings=await m.privacyFailures();console.log(JSON.stringify({findings,report:m.lastPrivacyCoverage}));";
  const invoke = async () => JSON.parse((await exec(process.execPath, ["--input-type=module", "-e", entry], {cwd: f.root})).stdout);
  const cold = await invoke(); assert.deepEqual(cold.findings, []); assert.ok(cold.report.scanned >= 9);
  const warm = await invoke(); assert.equal(warm.report.scanned, 0); assert.equal(warm.report.reused, cold.report.scanned);
  const artifact = join(f.root, "Vault/tmp/new.log"); await writeFile(artifact, "synthetic private validation artifact");
  const added = await invoke(); assert.equal(added.report.scanned, 1); assert.equal(added.report.files.length, cold.report.files.length + 1);
  await rm(artifact); const removed = await invoke();
  assert.equal(removed.report.scanned, 0); assert.equal(removed.report.files.length, cold.report.files.length);
  assert.notEqual(removed.report.membership_sha256, added.report.membership_sha256);
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
