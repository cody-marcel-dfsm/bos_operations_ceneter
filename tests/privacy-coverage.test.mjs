import assert from "node:assert/strict";
import {mkdtemp, readdir, readFile, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {privacyFileCoverage, privacyPolicyIdentity} from "../scripts/lib/privacy-coverage.mjs";

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
  process.env.CODEX_THREAD_ID = "synthetic-chat-B"; assert.deepEqual(await privacyPolicyIdentity([config]), original);
  await writeFile(config, "changed privacy rules"); assert.notDeepEqual(await privacyPolicyIdentity([config]), original);
});
