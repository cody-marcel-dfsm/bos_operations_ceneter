import {constants} from "node:fs";
import {open, lstat, mkdir, rename, rm, link} from "node:fs/promises";
import {resolve, dirname, parse, join} from "node:path";
import {createHash, randomUUID} from "node:crypto";

export class NotificationHostError extends Error {
  constructor(reason = "unavailable") {
    super("The protected notification host is unavailable; retain pending work."); this.name = "NotificationHostError";
    this.reason = ["unavailable", "source", "task", "credential"].includes(reason) ? reason : "unavailable";
  }
}
export const fail = () => { throw new NotificationHostError(); };
export const hash = bytes => createHash("sha256").update(bytes).digest("hex");
export const exact = (value, fields) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
export const opaque = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value);
export const fileIdentity = info => [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs, info.mode, info.uid, info.nlink].join(":");

// Ancestors are checked too: O_NOFOLLOW protects only the final component.
export async function safeAncestors(path) {
  if (typeof path !== "string" || !path.startsWith("/") || resolve(path) !== path) fail();
  let current = parse(path).root;
  for (const part of dirname(path).slice(current.length).split("/").filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) fail();
  }
}

export async function privateDirectory(path, {create = false} = {}) {
  try {
    await safeAncestors(path);
    if (create) { try { await mkdir(path, {mode: 0o700}); } catch (error) { if (error.code !== "EEXIST") throw error; } }
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700) fail();
    return path;
  } catch { fail(); }
}

export async function protectedRead(path, {maximum = 65536, mode = 0o600} = {}) {
  let file;
  try {
    await safeAncestors(path);
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await file.stat();
    if (!before.isFile() || before.uid !== process.getuid() || before.nlink !== 1 ||
        (before.mode & 0o777) !== mode || before.size < 1 || before.size > maximum) fail();
    const bytes = Buffer.alloc(maximum + 1);
    let used = 0, count;
    do { ({bytesRead: count} = await file.read(bytes, used, bytes.length - used, null)); used += count; }
    while (count && used < bytes.length);
    const after = await file.stat(), named = await lstat(path);
    if (used > maximum || named.isSymbolicLink() || fileIdentity(before) !== fileIdentity(after) ||
        fileIdentity(after) !== fileIdentity(named)) fail();
    await safeAncestors(path);
    return {bytes: bytes.subarray(0, used), identity: fileIdentity(after)};
  } catch (error) {
    const safe = new NotificationHostError();
    if (error.code === "ENOENT") safe.code = "ENOENT";
    throw safe;
  } finally { await file?.close(); }
}

export async function atomicPrivateJson(path, value, {replace = true} = {}) {
  const parent = dirname(path), temporary = join(parent, `.${randomUUID()}.tmp`);
  let file;
  try {
    await privateDirectory(parent);
    try {
      const old = await lstat(path);
      if (!replace || !old.isFile() || old.isSymbolicLink() || old.uid !== process.getuid() || (old.mode & 0o777) !== 0o600) fail();
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    file = await open(temporary, "wx", 0o600);
    await file.writeFile(JSON.stringify(value)); await file.sync(); await file.close(); file = null;
    if (replace) await rename(temporary, path);
    else { await link(temporary, path); await rm(temporary); }
    const folder = await open(parent, "r"); try { await folder.sync(); } finally { await folder.close(); }
  } catch { fail(); } finally { await file?.close(); await rm(temporary, {force: true}); }
}
