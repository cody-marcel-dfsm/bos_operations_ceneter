import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { publicPackagePath, stableJson } from "./package-model.mjs";
import { assertVersion, compareText, compareVersions, readSkillMetadata, skillNamePattern } from "./skill-metadata.mjs";
import { assertFileInventory, regularFiles, safeSkillPath, sha256, skillManifestFile, validateSkillManifest } from "./skill-release.mjs";

const exec = promisify(execFile);
export const importReceiptFile = ".skill-import.json";
const commitPattern = /^[a-f0-9]{40}$/;
const maxBytes = 100 * 1024 * 1024;
export const maxImportFiles = 1000;
export const maxImportSkills = 100;
const importTimeoutMs = 180000;

function remaining(deadline) {
  if (!Number.isFinite(deadline)) throw new Error("Invalid finite skill import deadline");
  const value = deadline - Date.now();
  if (value <= 0) throw new Error("Skill import overall deadline exceeded");
  return Math.min(value, 120000);
}

export function validateImportPin({ repository, commit, release, skill, version }) {
  let url;
  try { url = new URL(repository); } catch { throw new Error("Import repository must be an HTTPS Git URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Import repository must be a credential-free HTTPS Git URL");
  if (!commitPattern.test(commit ?? "")) throw new Error("Import requires an exact full immutable Git commit");
  assertVersion(release); assertVersion(version);
  if (!skillNamePattern.test(skill ?? "")) throw new Error("Invalid import skill name");
}

export function resolveSkillClosure(manifest, name, version) {
  validateSkillManifest(manifest);
  const selected = new Map(), pending = [[name, assertVersion(version)]];
  while (pending.length) {
    const [current, pin] = pending.shift();
    if (selected.has(current)) {
      if (selected.get(current).version !== pin) throw new Error(`Conflicting exact skill requirement: ${current}`);
      continue;
    }
    const row = manifest.skills[current];
    if (!row || row.version !== pin) throw new Error(`Unavailable exact skill ${current}@${pin}`);
    selected.set(current, row);
    pending.push(...Object.entries(row.requires).sort(([a], [b]) => compareText(a, b)));
  }
  return Object.fromEntries([...selected].sort(([a], [b]) => compareText(a, b)));
}

async function git(directory, args, options = {}) {
  return exec("git", ["-c", "core.hooksPath=/dev/null", "--git-dir", directory, ...args], {
    timeout: 120000, maxBuffer: maxBytes, encoding: "buffer",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" }, ...options
  });
}

// Read blobs from a bare object database. Fetched scripts are never executed;
// symlinks/submodules are rejected before any destination is materialized.
export async function readPinnedGitSkills(directory, pin, { deadline = Date.now() + importTimeoutMs } = {}) {
  validateImportPin(pin);
  const readGit = args => git(directory, args, { timeout: remaining(deadline) });
  const actual = (await readGit(["rev-parse", "--verify", `${pin.commit}^{commit}`])).stdout.toString().trim();
  if (actual !== pin.commit) throw new Error("Git commit does not match the immutable import pin");
  async function rootJson(path) {
    const record = (await readGit(["ls-tree", "-z", pin.commit, "--", path])).stdout.toString("utf8");
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(record);
    if (!match || match[3] !== path) throw new Error(`Expected regular release metadata: ${path}`);
    const bytes = (await readGit(["cat-file", "blob", match[2]])).stdout;
    if (bytes.length > 10 * 1024 * 1024) throw new Error("Release metadata exceeds size limit");
    return bytes;
  }
  const manifestBytes = await rootJson(skillManifestFile);
  if (manifestBytes.length > 10 * 1024 * 1024) throw new Error("Skill manifest exceeds size limit");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (stableJson(manifest) !== manifestBytes.toString("utf8")) throw new Error("Skill manifest must use canonical JSON with unique keys");
  validateSkillManifest(manifest);
  if (manifest.release !== pin.release) throw new Error("Repository release does not match the exact requested release");
  const repositoryPackage = JSON.parse((await rootJson("package.json")).toString("utf8"));
  if (repositoryPackage.name !== manifest.package || repositoryPackage.version !== pin.release) throw new Error("Skill manifest does not match repository package release metadata");
  const selected = resolveSkillClosure(manifest, pin.skill, pin.version);
  if (Object.keys(selected).length > maxImportSkills) throw new Error("Skill import exceeds aggregate closure limit");
  if (Object.values(selected).reduce((count, row) => count + Object.keys(row.files).length, 0) > maxImportFiles) throw new Error("Skill import exceeds aggregate file limit");
  const files = Object.create(null), skills = Object.create(null);
  let size = 0;
  for (const [name, row] of Object.entries(selected)) {
    const raw = (await readGit(["ls-tree", "-rz", "--full-tree", pin.commit, "--", `${row.path}/`])).stdout;
    const observed = Object.create(null);
    for (const entry of raw.toString("utf8").split("\0").filter(Boolean)) {
      const match = /^(\d{6}) (\w+) ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);
      if (!match || !["100644", "100755"].includes(match[1]) || match[2] !== "blob") throw new Error(`Nonregular Git skill entry: ${name}`);
      const path = safeSkillPath(match[4]);
      if (!path.startsWith(`${row.path}/`)) throw new Error("Git skill path escaped its manifest directory");
      const file = safeSkillPath(path.slice(row.path.length + 1));
      if (!Object.hasOwn(row.files, file) || Object.hasOwn(observed, file)) throw new Error(`Unexpected skill file: ${path}`);
      const bytes = (await readGit(["cat-file", "blob", match[3]])).stdout;
      size += bytes.length;
      if (size > maxBytes) throw new Error("Skill import exceeds bounded content size");
      const mode = match[1] === "100755" ? 0o755 : 0o644;
      if (sha256(bytes) !== row.files[file].sha256 || mode !== row.files[file].mode) throw new Error(`Skill content integrity failure: ${path}`);
      observed[file] = row.files[file];
      files[`${name}/${file}`] = { bytes, mode };
    }
    if (Object.keys(observed).sort().join("\0") !== Object.keys(row.files).sort().join("\0")) throw new Error(`Incomplete skill import: ${name}`);
    const metadata = readSkillMetadata(files[`${name}/SKILL.md`].bytes.toString("utf8"));
    if (metadata.name !== name || metadata.version !== row.version || stableJson(metadata.requires) !== stableJson(row.requires)) throw new Error(`Skill metadata does not match release manifest: ${name}`);
    skills[name] = { version: row.version, requires: row.requires, files: row.files };
  }
  return { pin, package: manifest.package, skills, files, deadline };
}

export async function fetchPinnedGitSkills(pin, { temporaryRoot = tmpdir() } = {}) {
  validateImportPin(pin);
  const deadline = Date.now() + importTimeoutMs;
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(join(temporaryRoot, "skill-import-objects-"));
  try {
    await exec("git", ["init", "--bare", directory], { maxBuffer: 1024 * 1024, timeout: remaining(deadline) });
    await git(directory, ["-c", "protocol.file.allow=never", "-c", "protocol.ext.allow=never", "-c", "credential.helper=", "fetch", "--no-tags", "--depth=1", pin.repository, pin.commit], { timeout: remaining(deadline) });
    const resolved = (await git(directory, ["rev-parse", "FETCH_HEAD^{commit}"], { timeout: remaining(deadline) })).stdout.toString().trim();
    if (resolved !== pin.commit) throw new Error("Fetched commit differs from the requested immutable pin");
    return await readPinnedGitSkills(directory, pin, { deadline });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

async function optionalStat(path) {
  try { return await lstat(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function assertSourceDestination(repositoryRoot, target) {
  repositoryRoot = resolve(repositoryRoot); target = resolve(target);
  const path = relative(repositoryRoot, target).split("\\").join("/");
  safeSkillPath(path);
  if (!path.startsWith("source/") || path.split("/").some(part => [".agents", ".codex", ".claude", "clients"].includes(part))) throw new Error("Skill imports must target repository-owned source/, outside installed packages");
  let current = repositoryRoot;
  const identities = [];
  for (const part of ["", ...path.split("/")]) {
    if (part) current = join(current, part);
    const info = await optionalStat(current);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`Unsafe source destination: ${current}`);
    if (info) identities.push({ path: current, ino: info.ino, dev: info.dev });
  }
  return identities;
}

function assertAncestorsUnchanged(before, after, target) {
  for (const row of before.filter(row => row.path !== target)) {
    const current = after.find(value => value.path === row.path);
    if (!current || row.ino !== current.ino || row.dev !== current.dev) throw new Error("Source destination parent changed during import; preserved existing source");
  }
}

function importedInventory(release) {
  return Object.fromEntries(Object.entries(release.files).sort(([a], [b]) => compareText(a, b)).map(([path, row]) => [path, { sha256: sha256(row.bytes), mode: row.mode }]));
}

async function destinationSnapshot(target) {
  if (!await optionalStat(target)) return null;
  const actual = await regularFiles(target);
  let receipt;
  try { receipt = JSON.parse(await readFile(join(target, importReceiptFile), "utf8")); } catch { throw new Error("Existing source is authored or has no valid import receipt; preserved unchanged"); }
  if (!receipt || !receipt.files || !receipt.pin) throw new Error("Invalid existing import receipt");
  validateImportPin(receipt.pin);
  assertFileInventory(receipt.files);
  if (!receipt.skills || !receipt.skills[receipt.pin.skill] || receipt.skills[receipt.pin.skill].version !== receipt.pin.version) throw new Error("Invalid existing import skill receipt");
  const payload = { ...actual }; delete payload[importReceiptFile];
  if (stableJson(payload) !== stableJson(receipt.files)) throw new Error("Existing imported source has authored changes; preserved unchanged");
  const info = await lstat(target);
  return { actual, receipt, identity: { ino: info.ino, dev: info.dev } };
}

// Canonical discovery owns one directory per skill name. Refuse a second copy,
// including an identical dependency, rather than silently producing source that
// the receiving builder cannot consume or changing relative support-file paths.
async function assertCanonicalNamesAvailable(repositoryRoot, target, skills, deadline) {
  let directories = 0;
  async function visit(directory) {
    remaining(deadline);
    if (++directories > 5000) throw new Error("Canonical skill conflict scan exceeds directory limit");
    const info = await optionalStat(directory);
    if (!info) return;
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Unsafe canonical source directory: ${directory}`);
    if (directory === target) return;
    const skillPath = join(directory, "SKILL.md"), skillInfo = await optionalStat(skillPath);
    if (skillInfo) {
      if (!skillInfo.isFile() || skillInfo.isSymbolicLink() || skillInfo.size > 10 * 1024 * 1024) throw new Error(`Invalid canonical skill metadata: ${skillPath}`);
      const row = readSkillMetadata(await readFile(skillPath, "utf8"), skillPath);
      if (Object.hasOwn(skills, row.name)) throw new Error(`Canonical skill name conflict: ${row.name}@${row.version} already exists at ${directory}; preserved source`);
      if (target.startsWith(`${directory}/`)) throw new Error(`Import target is inside canonical skill ${row.name}; preserved source`);
      return;
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (!publicPackagePath(child)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Unsafe canonical source directory: ${child}`);
      if (entry.isDirectory()) await visit(child);
    }
  }
  await visit(join(resolve(repositoryRoot), "source"));
}

export async function materializeSkillImport(release, { repositoryRoot, target, renamePath = rename }) {
  validateImportPin(release.pin);
  const deadline = release.deadline ?? Date.now() + importTimeoutMs;
  remaining(deadline);
  target = resolve(target);
  const parents = await assertSourceDestination(repositoryRoot, target);
  const before = await destinationSnapshot(target);
  await assertCanonicalNamesAvailable(repositoryRoot, target, release.skills, deadline);
  const files = importedInventory(release);
  for (const path of Object.keys(files)) safeSkillPath(path);
  if (before) {
    const previous = before.receipt;
    if (previous.pin.repository !== release.pin.repository || previous.pin.skill !== release.pin.skill) throw new Error("Existing import belongs to a different source or root skill");
    if (compareVersions(release.pin.version, previous.pin.version) < 0) throw new Error("Skill import updates require a newer version");
    for (const [name, row] of Object.entries(release.skills)) {
      const old = previous.skills?.[name];
      if (!old) continue;
      const order = compareVersions(row.version, old.version);
      if (order < 0 || (order === 0 && stableJson(row.files) !== stableJson(old.files))) throw new Error(`Changed imported skill requires a newer version: ${name}`);
    }
  }
  const receipt = { pin: release.pin, package: release.package, skills: release.skills, files };
  if (before && stableJson(receipt) === await readFile(join(target, importReceiptFile), "utf8")) return { status: "already_current", target, receipt };
  // All fetched content and existing authored-work checks finish before writes.
  await mkdir(dirname(target), { recursive: true });
  const stagingRoot = join(resolve(repositoryRoot), "Vault/tmp/skill-import/staging");
  // Keep staging/backup outside mutable source parents, on the same repository
  // filesystem. Source-parent replacement cannot redirect staged file writes.
  await mkdir(stagingRoot, { recursive: true });
  const stage = await mkdtemp(join(stagingRoot, "import-"));
  const backup = `${stage}-previous`;
  let moved = false;
  try {
    for (const [path, row] of Object.entries(release.files)) {
      remaining(deadline);
      const output = join(stage, safeSkillPath(path));
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, row.bytes); await chmod(output, row.mode);
    }
    await writeFile(join(stage, importReceiptFile), stableJson(receipt));
    remaining(deadline);
    assertAncestorsUnchanged(parents, await assertSourceDestination(repositoryRoot, target), target);
    const current = await destinationSnapshot(target);
    if (stableJson(current ?? null) !== stableJson(before ?? null)) throw new Error("Source destination changed during import; preserved unchanged");
    await assertCanonicalNamesAvailable(repositoryRoot, target, release.skills, deadline);
    if (before) { await renamePath(target, backup); moved = true; }
    try {
      if (before) {
        const movedSource = await destinationSnapshot(backup);
        if (stableJson(movedSource) !== stableJson(before)) throw new Error("Source destination was concurrently replaced; preserved current source");
      }
      assertAncestorsUnchanged(parents, await assertSourceDestination(repositoryRoot, target), target);
      await renamePath(stage, target);
    }
    catch (error) { if (moved) { await rename(backup, target); moved = false; } throw error; }
    if (moved) { await rm(backup, { recursive: true }); moved = false; }
    return { status: "imported", target, receipt };
  } finally { await rm(stage, { recursive: true, force: true }); }
}
