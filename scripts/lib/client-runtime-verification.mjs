import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { listProducts, pathExists, readJson } from "./package-model.mjs";

export async function activeClientProducts(client) {
  return (await listProducts())
    .map(({ manifest }) => manifest)
    .filter((product) =>
      product.release_status === "active" && product.clients.includes(client)
    );
}

export async function verifyInstalledMetadata(path, expected) {
  if (!(await pathExists(path))) return [`missing metadata: ${path}`];
  let actual;
  try {
    actual = await readJson(path);
  } catch (error) {
    return [`invalid metadata ${path}: ${error.message}`];
  }
  return Object.entries(expected).flatMap(([field, value]) =>
    actual[field] === value
      ? []
      : [`${path}: expected ${field}=${value}, found ${actual[field] ?? "missing"}`]
  );
}

async function filesUnder(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, path));
    else if (entry.isFile()) files.push(relative(root, path));
  }
  return files.sort();
}

export async function compareTrees(source, target, { ignore = [] } = {}) {
  if (!(await pathExists(target))) return [`missing installed directory: ${target}`];
  const ignored = new Set(ignore);
  const sourceFiles = (await filesUnder(source)).filter((path) => !ignored.has(path));
  const targetFiles = (await filesUnder(target)).filter((path) => !ignored.has(path));
  const failures = [];
  for (const path of sourceFiles) {
    if (!targetFiles.includes(path)) {
      failures.push(`missing installed file: ${join(target, path)}`);
      continue;
    }
    const [sourceContent, targetContent] = await Promise.all([
      readFile(join(source, path)),
      readFile(join(target, path))
    ]);
    const sourceHash = createHash("sha256").update(sourceContent).digest("hex");
    const targetHash = createHash("sha256").update(targetContent).digest("hex");
    if (sourceHash !== targetHash) failures.push(`stale installed file: ${join(target, path)}`);
  }
  return failures;
}

export async function verifyExactSymlink(target, source) {
  try {
    const details = await lstat(target);
    if (!details.isSymbolicLink()) return [`installed path is not a symlink: ${target}`];
    const [actual, expected] = await Promise.all([realpath(target), realpath(source)]);
    return actual === expected
      ? []
      : [`symlink target mismatch: ${target} -> ${actual}; expected ${expected}`];
  } catch (error) {
    return [`missing or invalid symlink ${target}: ${error.message}`];
  }
}
