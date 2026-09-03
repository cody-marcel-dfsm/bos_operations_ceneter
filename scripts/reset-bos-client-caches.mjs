import { lstat, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, stableJson } from "./lib/package-model.mjs";

export const CACHE_RESET_CONFIRMATION = "DELETE BOS CHATGPT AND CLAUDE CACHES";

const marketplace = "bos-education-center";
const products = ["bos", "education-center"];

async function pathPresent(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function assertSafeHome(home) {
  if (!isAbsolute(home)) throw new Error(`Home must be absolute: ${home}`);
  const resolved = resolve(home);
  if (resolved === "/") throw new Error("Refusing to use the filesystem root as home");
  return resolved;
}

function assertContained(path, allowedRoot) {
  const target = resolve(path);
  const root = resolve(allowedRoot);
  const offset = relative(root, target);
  if (offset === "" || (!offset.startsWith("..") && !isAbsolute(offset))) return target;
  throw new Error(`Refusing cache target outside ${root}: ${target}`);
}

async function validateProductCache(cacheRoot, expectedClient) {
  if (!(await pathPresent(cacheRoot))) return;
  const rootStat = await lstat(cacheRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`Refusing non-directory cache root: ${cacheRoot}`);
  }
  const rootEntries = await readdir(cacheRoot, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!products.includes(entry.name) || !entry.isDirectory()) {
      throw new Error(`Refusing unexpected package-cache entry: ${join(cacheRoot, entry.name)}`);
    }
  }
  for (const product of products) {
    const productRoot = join(cacheRoot, product);
    if (!(await pathPresent(productRoot))) continue;
    for (const version of await readdir(productRoot, { withFileTypes: true })) {
      if (!version.isDirectory()) {
        throw new Error(`Refusing unexpected product-cache entry: ${join(productRoot, version.name)}`);
      }
      const versionRoot = join(productRoot, version.name);
      const metadataPath = join(versionRoot, ".bos-product.json");
      if (!(await pathPresent(metadataPath))) {
        throw new Error(`Refusing unverified package cache: ${versionRoot}`);
      }
      const metadata = await readJson(metadataPath);
      if (metadata.name !== product ||
          (expectedClient && metadata.client !== expectedClient)) {
        throw new Error(`Refusing mismatched package cache: ${versionRoot}`);
      }
    }
  }
}

export async function planBosClientCacheReset({ home = homedir() } = {}) {
  const safeHome = assertSafeHome(home);
  const codexPluginCacheRoot = join(safeHome, ".codex", "plugins", "cache");
  const claudePluginCacheRoot = join(safeHome, ".claude", "plugins", "cache");
  const codexPackageCache = assertContained(
    join(codexPluginCacheRoot, marketplace), codexPluginCacheRoot
  );
  const claudePackageCache = assertContained(
    join(claudePluginCacheRoot, marketplace), claudePluginCacheRoot
  );

  await validateProductCache(codexPackageCache);
  await validateProductCache(claudePackageCache, "claude");
  const targets = [];
  for (const path of [codexPackageCache, claudePackageCache]) {
    if (await pathPresent(path)) targets.push(path);
  }
  return {
    schema_version: "1",
    home: safeHome,
    allowed_roots: [
      codexPluginCacheRoot,
      claudePluginCacheRoot
    ],
    targets: [...new Set(targets)].sort()
  };
}

export async function resetBosClientCaches({
  confirmation,
  home = homedir(),
  dryRun = false
} = {}) {
  if (!dryRun && confirmation !== CACHE_RESET_CONFIRMATION) {
    throw new Error(`Confirmation must equal: ${CACHE_RESET_CONFIRMATION}`);
  }
  const plan = await planBosClientCacheReset({ home });
  const actions = plan.targets.map((path) => `remove_cache:${path}`);
  if (!dryRun) {
    for (const path of plan.targets) await rm(path, { recursive: true, force: true });
  }
  const failures = [];
  if (!dryRun) {
    for (const path of plan.targets) {
      if (await pathPresent(path)) failures.push(`Cache artifact remains: ${path}`);
    }
  }
  return {
    schema_version: "1",
    ok: failures.length === 0,
    dry_run: dryRun,
    scope: "local_chatgpt_codex_and_claude_caches_only",
    allowed_roots: plan.allowed_roots,
    actions,
    failures
  };
}

function parseArgs(argv) {
  const options = { home: homedir(), dryRun: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--confirmation") options.confirmation = argv[++index];
    else if (argument === "--home") options.home = resolve(argv[++index]);
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await resetBosClientCaches(options);
  if (options.json) process.stdout.write(stableJson(report));
  else {
    console.log(report.dry_run ? "BOS client cache reset dry run:" : "BOS client cache reset:");
    for (const action of report.actions) console.log(`- ${action}`);
    for (const failure of report.failures) console.error(`- failure:${failure}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
