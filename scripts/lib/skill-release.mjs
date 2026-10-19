import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { listProducts, publicPackagePath, root, stableJson, transformProductSkillGuidance } from "./package-model.mjs";
import { assertVersion, compareText, compareVersions, readSkillMetadata, skillNamePattern, sortedObject, validateRequirements } from "./skill-metadata.mjs";

const exec = promisify(execFile);
export const skillManifestFile = "skill-release-manifest.json";
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function safeSkillPath(value) {
  if (typeof value !== "string" || !value || /[\\\x00-\x1f\x7f]/.test(value) || value.startsWith("/") ||
      value.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) throw new Error(`Unsafe skill path: ${value}`);
  return value;
}

export async function regularFiles(directory, { publishable = false } = {}) {
  const files = Object.create(null);
  async function visit(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => compareText(a.name, b.name))) {
      const path = join(current, entry.name);
      const name = safeSkillPath(relative(directory, path).split("\\").join("/"));
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`Skill tree contains a symlink: ${path}`);
      if (publishable && !publicPackagePath(path)) continue;
      if (info.isDirectory()) await visit(path);
      else if (info.isFile()) files[name] = { sha256: sha256(await readFile(path)), mode: info.mode & 0o111 ? 0o755 : 0o644 };
      else throw new Error(`Skill tree contains a nonregular entry: ${path}`);
    }
  }
  if (!(await lstat(directory)).isDirectory()) throw new Error(`Expected regular skill directory: ${directory}`);
  await visit(directory);
  assertFileInventory(files);
  return sortedObject(files);
}

export function assertFileInventory(files) {
  if (!files || typeof files !== "object" || Array.isArray(files) || Object.keys(files).length > 5000) throw new Error("Invalid skill file inventory");
  const folded = new Set();
  for (const [name, row] of Object.entries(files)) {
    safeSkillPath(name);
    const fold = name.normalize("NFC").toLowerCase();
    if (folded.has(fold)) throw new Error(`Colliding skill paths: ${name}`);
    folded.add(fold);
    if (!row || Object.keys(row).sort().join(",") !== "mode,sha256" || !/^[a-f0-9]{64}$/.test(row.sha256) || ![0o644, 0o755].includes(row.mode)) throw new Error(`Invalid skill file record: ${name}`);
  }
  for (const name of Object.keys(files)) {
    const parts = name.split("/");
    while (parts.pop()) if (folded.has(parts.join("/").normalize("NFC").toLowerCase())) throw new Error(`Overlapping skill file paths: ${name}`);
  }
}

export async function canonicalSkillRecords(base = root) {
  const records = [];
  const sourceInfo = await lstat(join(base, "source"));
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) throw new Error("Canonical source must be a regular directory");
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Skill source contains a symlink: ${child}`);
      if (entry.isDirectory() && publicPackagePath(child)) {
        try {
          const skillPath = join(child, "SKILL.md");
          const info = await lstat(skillPath);
          if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Canonical SKILL.md must be regular: ${skillPath}`);
          const text = await readFile(skillPath, "utf8");
          const metadata = readSkillMetadata(text, join(child, "SKILL.md"));
          records.push({ ...metadata, text, sourcePath: child, path: relative(base, child).split("\\").join("/"), files: await regularFiles(child, { publishable: true }) });
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          await visit(child);
        }
      }
    }
  }
  await visit(join(base, "source"));
  records.sort((a, b) => compareText(a.name, b.name));
  if (new Set(records.map(row => row.name)).size !== records.length) throw new Error("Duplicate canonical skill name");
  return records;
}

export async function buildSkillManifest(base = root) {
  const repository = JSON.parse(await readFile(join(base, "package.json"), "utf8"));
  assertVersion(repository.version);
  const products = (await listProducts(base)).map(row => row.manifest).filter(row => row.release_status !== "disabled");
  const records = await canonicalSkillRecords(base);
  const skills = {};
  for (const skill of records) {
    const effective = {};
    for (const product of products.filter(row => row.includes.includes(skill.path.slice("source/".length)))) {
      effective[product.name] = sha256(transformProductSkillGuidance(product, skill.name, skill.text));
    }
    skills[skill.name] = { version: skill.version, requires: skill.requires, path: skill.path, files: skill.files, effective: sortedObject(effective) };
  }
  const manifest = { package: repository.name, release: repository.version, skills };
  validateSkillManifest(manifest);
  return manifest;
}

export function validateSkillManifest(manifest) {
  if (!manifest || Object.keys(manifest).sort().join(",") !== "package,release,skills" || !skillNamePattern.test(manifest.package ?? "")) throw new Error("Invalid skill release manifest");
  assertVersion(manifest.release);
  if (!manifest.skills || typeof manifest.skills !== "object" || Array.isArray(manifest.skills) || !Object.keys(manifest.skills).length || Object.keys(manifest.skills).length > 500) throw new Error("Invalid release skill catalog");
  const paths = [];
  for (const [name, row] of Object.entries(manifest.skills)) {
    if (!skillNamePattern.test(name) || !row || Object.keys(row).sort().join(",") !== "effective,files,path,requires,version") throw new Error(`Invalid released skill: ${name}`);
    assertVersion(row.version); validateRequirements(row.requires); safeSkillPath(row.path);
    if (!row.path.startsWith("source/")) throw new Error(`Skill source path must be under source/: ${name}`);
    if (Object.hasOwn(row.requires, name)) throw new Error(`Self requirement: ${name}`);
    assertFileInventory(row.files);
    if (!Object.hasOwn(row.files, "SKILL.md")) throw new Error(`Missing SKILL.md: ${name}`);
    if (!row.effective || typeof row.effective !== "object" || Array.isArray(row.effective) || Object.entries(row.effective).some(([key, hash]) => !skillNamePattern.test(key) || !/^[a-f0-9]{64}$/.test(hash))) throw new Error(`Invalid effective guidance hashes: ${name}`);
    paths.push(row.path);
    for (const [dependency, version] of Object.entries(row.requires)) if (manifest.skills[dependency]?.version !== version) throw new Error(`${name} requires unavailable exact skill ${dependency}@${version}`);
  }
  const pathSet = new Set(paths);
  if (pathSet.size !== paths.length) throw new Error("Overlapping canonical skill paths");
  for (const path of paths) {
    const parts = path.split("/");
    while (parts.pop()) if (pathSet.has(parts.join("/"))) throw new Error("Overlapping canonical skill paths");
  }
  return manifest;
}

export function assertSkillVersionTransition(current, previous) {
  if (!previous) return;
  validateSkillManifest(previous);
  for (const [name, row] of Object.entries(current.skills)) {
    const old = previous.skills[name];
    if (!old) continue;
    const order = compareVersions(row.version, old.version);
    const changed = stableJson(row.files) !== stableJson(old.files) || stableJson(row.requires) !== stableJson(old.requires) ||
      Object.keys(old.effective).some(product => row.effective[product] !== undefined && row.effective[product] !== old.effective[product]);
    if (order < 0 || (changed && order === 0)) throw new Error(`${name}: released skill ${old.version} requires a strictly newer version for changed content or guidance`);
  }
}

// Check live changes and committed CI candidates against every earlier identity.
// A removed skill or product variant retains its historical version floor and
// fingerprint when it returns, even after multiple intervening catalogs.
export async function checkSkillReleaseHistory(manifest, base = root) {
  const shallow = await exec("git", ["rev-parse", "--is-shallow-repository"], { cwd: base });
  if (shallow.stdout.trim() !== "false") throw new Error("Skill version verification requires complete Git history");
  const { stdout } = await exec("git", ["log", "--format=%H", "HEAD", "--", skillManifestFile], { cwd: base, maxBuffer: 16 * 1024 * 1024 });
  for (const commit of stdout.trim().split("\n").filter(Boolean)) {
    const { stdout: bytes } = await exec("git", ["show", `${commit}:${skillManifestFile}`], { cwd: base, maxBuffer: 16 * 1024 * 1024 });
    if (bytes !== stableJson(manifest)) assertSkillVersionTransition(manifest, JSON.parse(bytes));
  }
}
