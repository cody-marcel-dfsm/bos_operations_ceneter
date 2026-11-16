// Test-only child environment. Production Git routing never imports this module.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, lstat, mkdtemp, open, readdir, readlink, realpath, rmdir, symlink, unlink } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const hash = value => createHash("sha256").update(value).digest("hex");
const encoded = value => JSON.stringify(value, Object.keys(value).sort());
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const metadata = stat => ({ dev: String(stat.dev), ino: String(stat.ino), uid: Number(stat.uid),
  mode: Number(stat.mode) & 0o7777, size: String(stat.size), mtime_ns: String(stat.mtimeNs), ctime_ns: String(stat.ctimeNs) });

async function command(command, args, environment) {
  const result = await execute(command, args, { env: environment, encoding: "utf8", timeout: 5000, maxBuffer: 65536 });
  if (result.stderr || result.stdout.includes("\0")) throw new Error("Malformed native tool output");
  return result.stdout.trimEnd();
}

async function selected(name, environment) {
  for (const directory of (environment.PATH ?? "/usr/bin:/bin").split(delimiter)) {
    const candidate = resolve(directory || ".", name);
    try { await access(candidate, constants.X_OK); if ((await lstat(candidate)).isDirectory()) continue; return candidate; }
    catch (error) { if (!["ENOENT", "ENOTDIR", "EACCES"].includes(error.code)) throw error; }
  }
  throw new Error(`Original ${name} executable is unavailable`);
}

async function executable(path, system = false) {
  const link = await lstat(path, { bigint: true });
  const target = await realpath(path);
  const kind = link.isSymbolicLink() ? "symlink" : link.isFile() ? "file" : "other";
  if (system && (kind !== "file" || Number(link.uid) !== 0 || (Number(link.mode) & 0o022)))
    throw new Error("Native executable requires a system-owned regular file");
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || !(Number(before.mode) & 0o111)) throw new Error("Executable custody is unavailable");
    const digest = createHash("sha256");
    const buffer = Buffer.alloc(65536);
    for (;;) { const { bytesRead } = await file.read(buffer, 0, buffer.length, null); if (!bytesRead) break; digest.update(buffer.subarray(0, bytesRead)); }
    assert.deepEqual(metadata(await file.stat({ bigint: true })), metadata(before), "Executable changed during capture");
    assert.deepEqual(metadata(await lstat(path, { bigint: true })), metadata(link), "Executable path changed during capture");
    return { path, realpath: target, kind, link: kind === "symlink" ? await readlink(path) : null,
      entry: metadata(link), target: metadata(before), sha256: digest.digest("hex") };
  } finally { await file.close(); }
}

// Pure decisions also exercise negative platforms and malformed equivalence facts.
export function nativeGitEligible(platform, path, fact) {
  return platform === "darwin" && path === "/usr/bin/git" && fact?.kind === "file" &&
    fact.entry?.uid === 0 && Number.isInteger(fact.entry?.mode) &&
    Boolean(fact.entry.mode & 0o111) && !(fact.entry.mode & 0o022);
}

export function assertNativeGitEquivalent(shim, direct) {
  if (!shim || !direct || typeof shim.version !== "string" ||
    !/^git version [\x20-\x7e]+$/u.test(shim.version) || shim.version.length > 4096 || shim.version !== direct.version ||
    typeof shim.exec_path !== "string" || !isAbsolute(shim.exec_path) ||
    /[\r\n\0]/u.test(shim.exec_path) || shim.exec_path !== direct.exec_path)
    throw new Error("Native Git version and exec-path equivalence required");
}

export async function prepareNativeValidationGit({ parentDirectory, environment = process.env }) {
  if (!isAbsolute(parentDirectory) || Object.values(environment).some(value => typeof value !== "string"))
    throw new Error("Absolute private parent and string environment required");
  const original = Object.freeze({ ...environment });
  const originalHash = hash(encoded(original));
  const paths = { git: await selected("git", original), python: await selected("python3", original), node: await selected("node", original) };
  const captured = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await executable(path)])));
  captured.running_node = await executable(process.execPath);
  const python = JSON.parse(await command(paths.python, ["-c", "import json,sys;print(json.dumps({'executable':sys.executable,'version':sys.version}))"], original));
  if (!isAbsolute(python.executable) || typeof python.version !== "string") throw new Error("Original absolute Python identity required");
  captured.python_runtime = await executable(python.executable);
  const parent = await lstat(parentDirectory, { bigint: true });
  if (!parent.isDirectory() || parent.isSymbolicLink() || Number(parent.uid) !== process.getuid())
    throw new Error("Private resource parent custody required");
  let directory;
  let directoryIdentity;
  let linkIdentity;
  let direct;
  let utility;
  let child = original;
  let disposed = false;
  const provenance = { mode: "original", platform: process.platform, original_environment_sha256: originalHash,
    original_tools: captured, python, node: process.execPath };
  async function equivalent() {
    const shim = { version: await command(paths.git, ["--version"], original), exec_path: await command(paths.git, ["--exec-path"], original) };
    const native = { version: await command(direct.path, ["--version"], original), exec_path: await command(direct.path, ["--exec-path"], original) };
    assertNativeGitEquivalent(shim, native);
    return { shim, direct: native };
  }
  async function verifyDirectory(cleanup = false) {
    const current = await lstat(directory, { bigint: true });
    assert.ok(current.isDirectory() && !current.isSymbolicLink(), "Private Git directory type changed");
    for (const key of ["dev", "ino", "uid", "mode"]) assert.equal(metadata(current)[key], directoryIdentity[key], "Private Git directory custody changed");
    assert.deepEqual(await readdir(directory), ["git"], "Private Git directory must contain only its owned link");
    const link = await lstat(join(directory, "git"), { bigint: true });
    assert.ok(link.isSymbolicLink(), "Private Git link type changed");
    if (cleanup) {
      for (const key of ["dev", "ino", "uid", "mode"]) assert.equal(metadata(link)[key], linkIdentity[key], "Private Git link ownership changed");
    } else assert.deepEqual(metadata(link), linkIdentity, "Private Git link identity changed");
    assert.equal(await readlink(join(directory, "git")), direct.path, "Private Git link target changed");
  }
  async function dispose() {
    if (disposed) return;
    if (directory) {
      await verifyDirectory(true);
      await unlink(join(directory, "git"));
      await rmdir(directory);
    }
    disposed = true;
  }
  try {
    if (nativeGitEligible(process.platform, paths.git, captured.git)) {
      utility = await executable("/usr/bin/xcrun", true);
      const found = await command(utility.path, ["--find", "git"], original);
      if (!isAbsolute(found) || /[\r\n\0]/u.test(found) || found === paths.git) throw new Error("Selected native Git path required");
      direct = await executable(found, true);
      provenance.equivalence = await equivalent();
      directory = await mkdtemp(join(parentDirectory, "native-validation-git-"));
      await chmod(directory, 0o700);
      directoryIdentity = metadata(await lstat(directory, { bigint: true }));
      await symlink(direct.path, join(directory, "git"));
      linkIdentity = metadata(await lstat(join(directory, "git"), { bigint: true }));
      child = Object.freeze({ ...original, PATH: directory + delimiter + (original.PATH ?? "/usr/bin:/bin") });
      Object.assign(provenance, { mode: "direct-system-darwin-git", direct, utility,
        private_directory: directory, private_directory_identity: directoryIdentity, private_link_identity: linkIdentity });
    }
    provenance.child_environment_sha256 = hash(encoded(child));
    async function verify() {
      if (disposed) throw new Error("Native Git resource already disposed");
      assert.equal(hash(encoded(original)), originalHash, "Original environment changed");
      assert.equal(hash(encoded(child)), provenance.child_environment_sha256, "Child environment changed");
      for (const [name, path] of Object.entries(paths)) {
        assert.equal(await selected(name === "python" ? "python3" : name, original), path, "Original tool routing changed");
        assert.deepEqual(await executable(path), captured[name], "Original tool executable changed");
        assert.equal(await selected(name === "python" ? "python3" : name, child), name === "git" && directory ? join(directory, "git") : path,
          "Child tool routing changed");
      }
      assert.deepEqual(await executable(process.execPath), captured.running_node, "Running Node changed");
      assert.deepEqual(await executable(python.executable), captured.python_runtime, "Python runtime changed");
      assert.deepEqual(JSON.parse(await command(paths.python, ["-c", "import json,sys;print(json.dumps({'executable':sys.executable,'version':sys.version}))"], child)), python,
        "Original Python selection changed");
      if (directory) {
        await verifyDirectory();
        assert.deepEqual(await executable(utility.path, true), utility, "Native developer utility changed");
        assert.equal(await command(utility.path, ["--find", "git"], original), direct.path, "Selected developer Git changed");
        assert.deepEqual(await executable(direct.path, true), direct, "Native Git executable changed");
        assert.deepEqual(await equivalent(), provenance.equivalence, "Native Git equivalence changed");
      }
      return true;
    }
    await verify();
    return Object.freeze({ environment: child, python: python.executable, node: process.execPath,
      provenance: freeze(provenance), verify, dispose });
  } catch (error) {
    if (directory && !linkIdentity) {
      // Preparation owns this unpublished, empty directory; never recurse.
      try { await rmdir(directory); } catch (cleanup) { error.cleanup = cleanup.message; }
    } else {
      try { await dispose(); } catch (cleanup) { error.cleanup = cleanup.message; }
    }
    throw error;
  }
}
