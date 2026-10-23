import {constants} from "node:fs";
import {access, link, lstat, mkdir, open, readFile, rename, unlink} from "node:fs/promises";
import {createHash, createHmac, randomBytes, randomUUID} from "node:crypto";
import {dirname, join, relative, resolve} from "node:path";

const hash = value => createHash("sha256").update(value).digest("hex");
const encode = value => JSON.stringify(value) + "\n";
const sign = (key, value) => createHmac("sha256", key).update(encode(value)).digest("hex");

async function privateDirectory(path) {
  await mkdir(path, {recursive: true, mode: 0o700});
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || process.getuid && info.uid !== process.getuid())
    throw new Error("Privacy coverage requires its owned private directory");
}

async function privateRead(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (info.nlink !== 1) throw Object.assign(new Error("Privacy coverage record custody changed"), {code: "PRIVACY_LINKED"});
    if (!info.isFile() || info.mode & 0o077 || process.getuid && info.uid !== process.getuid())
      throw new Error("Privacy coverage record custody changed");
    return await handle.readFile();
  } finally { await handle.close(); }
}

async function writeRecord(path, body, immutable = false) {
  await privateDirectory(dirname(path));
  const temporary = join(dirname(path), ".publish-" + randomUUID());
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
  try {
    if (immutable) await link(temporary, path);
    else await rename(temporary, path);
  } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}

async function issuerKey(directory) {
  const path = join(directory, "issuer.key");
  const readKey = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const key = await privateRead(path);
        if (key.length !== 32) throw new Error("Privacy coverage issuer identity changed");
        return key;
      } catch (error) {
        if (error.code !== "PRIVACY_LINKED" || attempt >= 4) throw error;
        await new Promise(done => setTimeout(done, 5));
      }
    }
  };
  try {
    return await readKey();
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  try { await writeRecord(path, randomBytes(32), true); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  return readKey();
}

export async function executableIdentity(name) {
  const choices = name.includes("/") ? [name] : (process.env.PATH || "").split(":").map(path => join(path, name));
  for (const path of choices) {
    try { await access(path, constants.X_OK); return {path: resolve(path), sha256: hash(await readFile(path))}; }
    catch (error) { if (!["ENOENT", "EACCES", "EISDIR"].includes(error.code)) throw error; }
  }
  throw new Error("Privacy validation executable is unavailable: " + name);
}

export async function privacyPolicyIdentity(files, context = {}) {
  const sources = {};
  for (const item of files) {
    const path = typeof item === "string" ? item : item.path;
    sources[resolve(path)] = hash(typeof item === "string" ? await readFile(path) : item.body);
  }
  sources[resolve(new URL(import.meta.url).pathname)] = hash(await readFile(new URL(import.meta.url)));
  const environment = {};
  for (const name of ["NODE_OPTIONS", "NODE_ENV", "LANG", "LC_ALL", "TZ"])
    environment[name] = process.env[name] === undefined ? null : hash(process.env[name]);
  return {kind: "boc-privacy-policy-v1", sources, context, environment,
    execution: [privacyFileCoverage, privateDirectory, privateRead, writeRecord, issuerKey, executableIdentity]
      .map(value => value.toString()),
    executables: [await executableIdentity(process.execPath), await executableIdentity("unzip")],
    runtime: {node: process.version, platform: process.platform, architecture: process.arch},
    provenance: {environment_sha256: hash(encode(Object.fromEntries(Object.entries(process.env).sort()))),
      working_directory_sha256: hash(process.cwd())}};
}

// Every candidate remains in the current scope. Only matching original results
// are reused; both successful and failing observations retain their outcome.
export async function privacyFileCoverage({root, directory, candidates, policy, contextFor, scan, source = {}}) {
  root = resolve(root); directory = resolve(directory);
  // Check every existing metadata ancestor, so mkdir cannot follow a link.
  let cursor = root;
  const parts = relative(root, directory).split("/");
  if (parts.some(part => part === "..")) throw new Error("Privacy coverage must remain owner-local");
  for (const part of parts) { cursor = join(cursor, part); await privateDirectory(cursor); }
  const key = await issuerKey(directory);
  for (const name of ["by-input", "records", "runs"]) await privateDirectory(join(directory, name));
  const {provenance, ...applicability} = policy;
  const policyHash = hash(encode(applicability)), issuer = hash(key);
  source = {...source, ...(provenance ? {policy_provenance: provenance} : {})};
  const manifest = [], findings = [];
  let reused = 0, scanned = 0, invalidated = 0;
  for (const path of [...new Set(candidates.map(path => resolve(path)))].sort()) {
    let body, mode;
    try {
      const handle = await open(path, "r");
      try { body = await handle.readFile(); mode = (await handle.stat()).mode; }
      finally { await handle.close(); }
    } catch (error) { throw new Error("Required privacy input became unavailable: " + relative(root, path), {cause: error}); }
    const context = contextFor ? await contextFor(path) : {};
    const input = {path: relative(root, path), sha256: hash(body), mode,
      policy_sha256: policyHash, context_sha256: hash(encode(context)), issuer};
    const identity = hash(encode(input));
    const index = join(directory, "by-input", identity + ".json");
    let result;
    try {
      const pointer = JSON.parse(await privateRead(index));
      const pointerBody = {identity: pointer.identity, record: pointer.record, sha256: pointer.sha256};
      if (pointer.identity !== identity || pointer.signature !== sign(key, pointerBody)
          || !/^[0-9a-f-]+\.json$/u.test(pointer.record)) throw new Error("Privacy coverage pointer changed");
      const raw = await privateRead(join(directory, "records", pointer.record));
      const record = JSON.parse(raw);
      const payload = {kind: record.kind, input: record.input, source: record.source, findings: record.findings};
      if (hash(raw) !== pointer.sha256 || encode(record) !== raw.toString() || record.signature !== sign(key, payload)
          || record.kind !== "boc-privacy-file-result-v1" || encode(record.input) !== encode(input)
          || !Array.isArray(record.findings) || record.findings.some(item => typeof item !== "string"))
        throw new Error("Privacy coverage original result changed");
      result = record.findings; reused++;
    } catch (error) {
      if (error.code !== "ENOENT") invalidated++;
    }
    if (result === undefined) {
      result = await scan(path, body, context); scanned++;
      if (!Array.isArray(result) || result.some(item => typeof item !== "string")) throw new Error("Privacy scan returned no result");
      const payload = {kind: "boc-privacy-file-result-v1", input, source, findings: result};
      const record = {...payload, signature: sign(key, payload)};
      const raw = encode(record), name = hash(raw) + "-" + randomUUID() + ".json";
      await writeRecord(join(directory, "records", name), raw, true);
      const pointer = {identity, record: name, sha256: hash(raw)};
      await writeRecord(index, encode({...pointer, signature: sign(key, pointer)}));
    }
    manifest.push({path: input.path, identity, outcome: result.length ? "FAILED" : "PASSED"});
    findings.push(...result);
  }
  const payload = {kind: "boc-privacy-command-coverage-v1", source, policy_sha256: policyHash,
    membership_sha256: hash(encode(manifest)), files: manifest, reused, scanned, invalidated,
    outcome: findings.length ? "FAILED" : "PASSED"};
  await writeRecord(join(directory, "runs", randomUUID() + ".json"), encode({...payload, signature: sign(key, payload)}), true);
  return {findings: [...new Set(findings)].sort(), report: payload};
}
