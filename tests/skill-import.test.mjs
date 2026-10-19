import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { parseImportArguments } from "../scripts/import-skill.mjs";
import { importReceiptFile, materializeSkillImport, maxImportFiles, maxImportSkills, readPinnedGitSkills } from "../scripts/lib/skill-import.mjs";
import { checkSkillReleaseHistory, sha256, skillManifestFile } from "../scripts/lib/skill-release.mjs";
import { writeSkillMetadata } from "../scripts/lib/skill-metadata.mjs";
import { stableJson } from "../scripts/lib/package-model.mjs";

const exec = promisify(execFile);
const text = (name, version, requires = {}) => writeSkillMetadata(`---\nname: ${name}\ndescription: Synthetic import fixture for versioned complete skill directories.\n---\n\nRead supporting files.\n`, { version, requires });

async function workspace(t) {
  const base = await mkdtemp(join(tmpdir(), "skill-import-fixture-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  await mkdir(join(base, "source"));
  return base;
}

async function bareRelease(base, { version = "1.0.0", mutate, gitDirectory, parentCommit } = {}) {
  const entries = {
    "package.json": { bytes: Buffer.from(stableJson({ name: "fixture", version: "2.0.0" })), mode: "100644" },
    "source/alpha/SKILL.md": { bytes: Buffer.from(text("alpha", version, { beta: "1.0.0" })), mode: "100644" },
    "source/alpha/scripts/run.sh": { bytes: Buffer.from("#!/bin/sh\nexit 0\n"), mode: "100755" },
    "source/alpha/__proto__": { bytes: Buffer.from("An ordinary named supporting file.\n"), mode: "100644" },
    "source/beta/SKILL.md": { bytes: Buffer.from(text("beta", "1.0.0")), mode: "100644" },
    "source/beta/references/read.md": { bytes: Buffer.from("Synthetic supporting reference.\n"), mode: "100644" }
  };
  const manifest = { package: "fixture", release: "2.0.0", skills: {} };
  for (const name of ["alpha", "beta"]) {
    const files = Object.fromEntries(Object.entries(entries).filter(([path]) => path.startsWith(`source/${name}/`)).map(([path, row]) => [path.slice(`source/${name}/`.length), { sha256: sha256(row.bytes), mode: row.mode === "100755" ? 0o755 : 0o644 }]));
    manifest.skills[name] = { version: name === "alpha" ? version : "1.0.0", requires: name === "alpha" ? { beta: "1.0.0" } : {}, path: `source/${name}`, files, effective: { fixture: "a".repeat(64) } };
  }
  if (mutate) mutate({ manifest, entries });
  entries[skillManifestFile] = { bytes: Buffer.from(stableJson(manifest)), mode: "100644" };
  const directory = gitDirectory ?? await mkdtemp(join(base, "bare-"));
  if (!gitDirectory) await exec("git", ["init", "--bare", directory]);
  async function input(args, bytes) {
    // execFile has no input option; a finite child pipe writes literal bytes.
    const { spawn } = await import("node:child_process");
    return new Promise((resolve, reject) => {
      const child = spawn("git", ["--git-dir", directory, ...args], { env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.test", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.test" } });
      let output = "", error = "";
      child.stdout.on("data", chunk => output += chunk); child.stderr.on("data", chunk => error += chunk);
      child.on("error", reject); child.on("close", code => code ? reject(new Error(error)) : resolve(output.trim()));
      child.stdin.end(bytes);
    });
  }
  const tree = Object.create(null);
  for (const [path, row] of Object.entries(entries)) {
    const parts = path.split("/"); const name = parts.pop(); let node = tree;
    for (const part of parts) node = node[part] ??= Object.create(null);
    node[name] = { mode: row.mode, oid: await input(["hash-object", "-w", "--stdin"], row.bytes) };
  }
  async function makeTree(node) {
    const rows = [];
    for (const [name, row] of Object.entries(node).sort(([a], [b]) => a.localeCompare(b))) rows.push(row.oid ? `${row.mode} blob ${row.oid}\t${name}\0` : `040000 tree ${await makeTree(row)}\t${name}\0`);
    return input(["mktree", "-z"], rows.join(""));
  }
  const commit = await input(["commit-tree", await makeTree(tree), ...(parentCommit ? ["-p", parentCommit] : [])], "Synthetic release fixture\n");
  await exec("git", ["--git-dir", directory, "update-ref", "refs/heads/main", commit]);
  await exec("git", ["--git-dir", directory, "symbolic-ref", "HEAD", "refs/heads/main"]);
  const pin = { repository: "https://example.test/skills.git", commit, release: "2.0.0", skill: "alpha", version };
  return { directory, pin, manifest };
}

test("committed-candidate history rejects same-version support or generated-guidance changes, and permits reuse and bumps", async t => {
  const base = await workspace(t);
  for (const mode of ["support", "guidance", "reuse", "bump"]) {
    const previous = await bareRelease(base);
    const candidate = await bareRelease(base, { gitDirectory: previous.directory, parentCommit: previous.pin.commit, version: mode === "bump" ? "1.0.1" : "1.0.0", mutate: ({ manifest, entries }) => {
      manifest.release = "2.0.1";
      if (mode === "guidance") manifest.skills.alpha.effective.fixture = "b".repeat(64);
      if (mode === "support" || mode === "bump") {
        entries["source/alpha/scripts/run.sh"].bytes = Buffer.from("#!/bin/sh\nexit 1\n");
        manifest.skills.alpha.files["scripts/run.sh"].sha256 = sha256(entries["source/alpha/scripts/run.sh"].bytes);
      }
    } });
    const check = checkSkillReleaseHistory(candidate.manifest, candidate.directory);
    if (["support", "guidance"].includes(mode)) await assert.rejects(check, /strictly newer/);
    else await assert.doesNotReject(check);
  }
});

test("committed history retains retired skill identities and version floors across multiple absent catalogs", async t => {
  const base = await workspace(t);
  for (const mode of ["changed", "downgrade", "reuse", "bump"]) {
    const previous = await bareRelease(base, { version: "1.2.0" });
    let parent = previous;
    for (const release of ["2.0.1", "2.0.2"]) parent = await bareRelease(base, { gitDirectory: previous.directory, parentCommit: parent.pin.commit, mutate: ({ manifest, entries }) => {
      manifest.release = release; delete manifest.skills.alpha;
      for (const path of Object.keys(entries)) if (path.startsWith("source/alpha/")) delete entries[path];
    } });
    const candidate = await bareRelease(base, { gitDirectory: previous.directory, parentCommit: parent.pin.commit, version: mode === "downgrade" ? "1.1.9" : mode === "bump" ? "1.2.1" : "1.2.0", mutate: ({ manifest, entries }) => {
      manifest.release = "2.0.3";
      if (["changed", "bump"].includes(mode)) {
        entries["source/alpha/scripts/run.sh"].bytes = Buffer.from("#!/bin/sh\nexit 1\n");
        manifest.skills.alpha.files["scripts/run.sh"].sha256 = sha256(entries["source/alpha/scripts/run.sh"].bytes);
      }
    } });
    const check = checkSkillReleaseHistory(candidate.manifest, candidate.directory);
    if (["changed", "downgrade"].includes(mode)) await assert.rejects(check, /strictly newer/, mode);
    else await assert.doesNotReject(check, mode);
  }
});

test("committed history retains returning product-specific effective guidance identities", async t => {
  const base = await workspace(t);
  for (const mode of ["changed", "reuse", "bump"]) {
    const previous = await bareRelease(base);
    const absent = await bareRelease(base, { gitDirectory: previous.directory, parentCommit: previous.pin.commit, mutate: ({ manifest }) => {
      manifest.release = "2.0.1"; delete manifest.skills.alpha.effective.fixture;
    } });
    const candidate = await bareRelease(base, { gitDirectory: previous.directory, parentCommit: absent.pin.commit, version: mode === "bump" ? "1.0.1" : "1.0.0", mutate: ({ manifest }) => {
      manifest.release = "2.0.2";
      if (mode !== "reuse") manifest.skills.alpha.effective.fixture = "b".repeat(64);
    } });
    const check = checkSkillReleaseHistory(candidate.manifest, candidate.directory);
    if (mode === "changed") await assert.rejects(check, /strictly newer/);
    else await assert.doesNotReject(check);
  }
});

test("exact Git commit/release import preserves the entire transitive body, support files and executable modes", async t => {
  const base = await workspace(t), fixture = await bareRelease(base);
  const release = await readPinnedGitSkills(fixture.directory, fixture.pin);
  const target = join(base, "source/imports/fixture");
  const result = await materializeSkillImport(release, { repositoryRoot: base, target });
  assert.equal(result.status, "imported");
  assert.deepEqual(Object.keys(result.receipt.skills), ["alpha", "beta"]);
  assert.match(await readFile(join(target, "beta/references/read.md"), "utf8"), /supporting reference/);
  assert.match(await readFile(join(target, "alpha/__proto__"), "utf8"), /ordinary named supporting file/);
  assert.equal((await lstat(join(target, "alpha/scripts/run.sh"))).mode & 0o111, 0o111);
  assert.equal(JSON.parse(await readFile(join(target, importReceiptFile), "utf8")).pin.commit, fixture.pin.commit);
  assert.equal((await materializeSkillImport(release, { repositoryRoot: base, target })).status, "already_current");
  await assert.rejects(readPinnedGitSkills(fixture.directory, { ...fixture.pin, release: "2.0.1" }), /release/);
  await assert.rejects(readPinnedGitSkills(fixture.directory, { ...fixture.pin, commit: "f".repeat(40) }));
});

test("fetched symlinks, traversal, extra, missing and tampered files fail before any destination write", async t => {
  const base = await workspace(t);
  const mutations = [
    ({ entries }) => { entries["source/alpha/scripts/run.sh"].mode = "120000"; },
    ({ manifest }) => { manifest.skills.alpha.path = "source/../outside"; },
    ({ entries }) => { entries["source/alpha/extra.md"] = { bytes: Buffer.from("Extra"), mode: "100644" }; },
    ({ entries }) => { delete entries["source/beta/references/read.md"]; },
    ({ entries }) => { entries["source/alpha/scripts/run.sh"].bytes = Buffer.from("Changed"); },
    ({ manifest }) => { manifest.skills.alpha.requires.beta = "3.0.0"; },
    ({ entries }) => { entries["package.json"].bytes = Buffer.from(stableJson({ name: "fixture", version: "9.0.0" })); }
  ];
  for (const mutate of mutations) {
    const fixture = await bareRelease(base, { mutate });
    await assert.rejects(readPinnedGitSkills(fixture.directory, fixture.pin));
    await assert.rejects(access(join(base, "source/imports")));
  }
});

test("aggregate empty-file inventories and an expired overall deadline are refused before materialization", async t => {
  const base = await workspace(t);
  const fixture = await bareRelease(base, { mutate: ({ manifest }) => {
    for (let index = 0; index < maxImportFiles; index++) manifest.skills.alpha.files[`empty-${index}`] = { sha256: sha256(Buffer.alloc(0)), mode: 0o644 };
  } });
  await assert.rejects(readPinnedGitSkills(fixture.directory, fixture.pin), /aggregate file limit/);
  await assert.rejects(readPinnedGitSkills(fixture.directory, fixture.pin, { deadline: 0 }), /overall deadline/);
  const wide = await bareRelease(base, { mutate: ({ manifest }) => {
    manifest.skills.alpha.requires = {};
    for (let index = 0; index < maxImportSkills; index++) {
      const name = `extra-${index}`;
      manifest.skills.alpha.requires[name] = "1.0.0";
      manifest.skills[name] = { ...structuredClone(manifest.skills.beta), path: `source/${name}` };
    }
  } });
  await assert.rejects(readPinnedGitSkills(wide.directory, wide.pin), /aggregate closure limit/);
  await assert.rejects(access(join(base, "source/imports")));
});

test("source import preserves authored conflicts, rejects same-version changes and rolls back interrupted replacement", async t => {
  const base = await workspace(t), fixture = await bareRelease(base);
  const original = await readPinnedGitSkills(fixture.directory, fixture.pin);
  const target = join(base, "source/imports/fixture");
  await materializeSkillImport(original, { repositoryRoot: base, target });
  const updatedFixture = await bareRelease(base, { version: "1.0.1" });
  const update = await readPinnedGitSkills(updatedFixture.directory, updatedFixture.pin);
  const authored = join(target, "alpha/authored.md"); await writeFile(authored, "Preserve this work.\n");
  await assert.rejects(materializeSkillImport(update, { repositoryRoot: base, target }), /authored changes/);
  assert.equal(await readFile(authored, "utf8"), "Preserve this work.\n"); await rm(authored);
  const sameVersion = structuredClone(update); sameVersion.pin.version = "1.0.0"; sameVersion.skills.alpha.version = "1.0.0";
  await assert.rejects(materializeSkillImport(sameVersion, { repositoryRoot: base, target }), /newer version/);
  let calls = 0;
  await assert.rejects(materializeSkillImport(update, { repositoryRoot: base, target, renamePath: async (...args) => { if (++calls === 2) throw new Error("Synthetic rename interruption"); return rename(...args); } }), /interruption/);
  assert.match(await readFile(join(target, "alpha/SKILL.md"), "utf8"), /version: "1.0.0"/);
  assert.equal((await materializeSkillImport(update, { repositoryRoot: base, target })).status, "imported");
  assert.deepEqual(await readdir(dirname(target)), ["fixture"]);
});

test("imports refuse existing authored roots, symlink destinations, installed paths and mutable pin arguments", async t => {
  const base = await workspace(t), fixture = await bareRelease(base), release = await readPinnedGitSkills(fixture.directory, fixture.pin);
  const target = join(base, "source/authored"); await mkdir(target); await writeFile(join(target, "keep.md"), "Keep");
  await assert.rejects(materializeSkillImport(release, { repositoryRoot: base, target }), /authored/);
  await symlink(target, join(base, "source/link"));
  await assert.rejects(materializeSkillImport(release, { repositoryRoot: base, target: join(base, "source/link/import") }), /Unsafe source destination/);
  await assert.rejects(materializeSkillImport(release, { repositoryRoot: base, target: join(base, ".codex/skills/fixture") }), /source/);
  const args = ["--repository", fixture.pin.repository, "--commit", fixture.pin.commit, "--release", fixture.pin.release, "--skill", "alpha@1.0.0", "--target", "source/imports/fixture"];
  assert.equal(parseImportArguments(args).pin.commit, fixture.pin.commit);
  assert.throws(() => parseImportArguments(args.map(value => value === fixture.pin.commit ? "main" : value)), /immutable/);
  assert.throws(() => parseImportArguments([...args, "--release", "2.0.1"]), /duplicate/);
});

test("global canonical names conflict before source mutation, including exact dependencies in other import targets", async t => {
  const base = await workspace(t), fixture = await bareRelease(base), release = await readPinnedGitSkills(fixture.directory, fixture.pin);
  const existing = join(base, "source/platform/beta");
  await mkdir(existing, { recursive: true });
  const authored = text("beta", "9.0.0");
  await writeFile(join(existing, "SKILL.md"), authored);
  const target = join(base, "source/imports/fixture");
  await assert.rejects(materializeSkillImport(release, { repositoryRoot: base, target }), /Canonical skill name conflict: beta@9.0.0/);
  assert.equal(await readFile(join(existing, "SKILL.md"), "utf8"), authored);
  await assert.rejects(access(target));
  await rm(join(base, "source/platform"), { recursive: true });
  await materializeSkillImport(release, { repositoryRoot: base, target });
  const secondTarget = join(base, "source/imports/second");
  await assert.rejects(materializeSkillImport(release, { repositoryRoot: base, target: secondTarget }), /Canonical skill name conflict: alpha@1.0.0/);
  await assert.rejects(access(secondTarget));
  assert.equal((await materializeSkillImport(release, { repositoryRoot: base, target })).status, "already_current");
});

test("concurrent source replacement after preflight is detected and its authored work survives rollback", async t => {
  const base = await workspace(t), fixture = await bareRelease(base), release = await readPinnedGitSkills(fixture.directory, fixture.pin);
  const target = join(base, "source/imports/fixture");
  await materializeSkillImport(release, { repositoryRoot: base, target });
  const next = await bareRelease(base, { version: "1.0.1" }), update = await readPinnedGitSkills(next.directory, next.pin);
  const displaced = `${target}-concurrent-original`;
  let changed = false;
  await assert.rejects(materializeSkillImport(update, { repositoryRoot: base, target, renamePath: async (...args) => {
    if (!changed) { changed = true; await rename(target, displaced); await mkdir(target); await writeFile(join(target, "authored.md"), "Concurrent work survives.\n"); }
    return rename(...args);
  } }), /authored|concurrently replaced/);
  assert.equal(await readFile(join(target, "authored.md"), "utf8"), "Concurrent work survives.\n");
  assert.match(await readFile(join(displaced, "alpha/SKILL.md"), "utf8"), /version: "1.0.0"/);
});
