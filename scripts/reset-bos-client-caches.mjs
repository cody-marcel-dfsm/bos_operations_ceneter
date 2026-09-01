import { lstat, readFile, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, stableJson } from "./lib/package-model.mjs";

export const CACHE_RESET_CONFIRMATION = "DELETE BOS CHATGPT AND CLAUDE CACHES";

const marketplace = "bos-education-center";
const products = ["bos", "education-center"];
const bosResourceUrl = "https://dfsm.ai/mcp/apps/bos/platform";
const bosCodexAppIds = ["asdk_app_6a932992592081919cdc88c60e4ff2dd"];
const codexCatalogCacheKinds = [
  "codex_app_directory",
  "codex_apps_server_info",
  "codex_apps_tools",
  "remote_plugin_catalog"
];

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

async function validateRemoteWrapper(wrapper) {
  if (!(await pathPresent(wrapper))) return;
  const stat = await lstat(wrapper);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Refusing non-directory remote wrapper cache: ${wrapper}`);
  }
  const appId = bosCodexAppIds[0];
  const metadata = await readJson(join(wrapper, ".codex-remote-plugin-install.json"));
  if (metadata.remote_plugin_id !== `plugin_${appId}`) {
    throw new Error(`Refusing mismatched remote wrapper cache: ${wrapper}`);
  }
}

async function matchingCatalogFiles(cacheDirectory) {
  if (!(await pathPresent(cacheDirectory))) return [];
  const matches = [];
  for (const entry of await readdir(cacheDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(cacheDirectory, entry.name);
    const content = await readFile(path, "utf8");
    if ([bosResourceUrl, ...bosCodexAppIds].some((needle) => content.includes(needle))) {
      matches.push(path);
    }
  }
  return matches.sort();
}

export async function planBosClientCacheReset({ home = homedir() } = {}) {
  const safeHome = assertSafeHome(home);
  const codexPluginCacheRoot = join(safeHome, ".codex", "plugins", "cache");
  const codexCatalogCacheRoot = join(safeHome, ".codex", "cache");
  const claudePluginCacheRoot = join(safeHome, ".claude", "plugins", "cache");
  const appId = bosCodexAppIds[0];
  const suffix = appId.replace(/^asdk_app_/, "");
  const codexPackageCache = assertContained(
    join(codexPluginCacheRoot, marketplace), codexPluginCacheRoot
  );
  const codexRemoteWrapper = assertContained(
    join(codexPluginCacheRoot, "created-by-me-remote", `dev-${suffix}`),
    codexPluginCacheRoot
  );
  const claudePackageCache = assertContained(
    join(claudePluginCacheRoot, marketplace), claudePluginCacheRoot
  );

  await validateProductCache(codexPackageCache);
  await validateProductCache(claudePackageCache, "claude");
  await validateRemoteWrapper(codexRemoteWrapper);

  const targets = [];
  for (const path of [codexPackageCache, codexRemoteWrapper, claudePackageCache]) {
    if (await pathPresent(path)) targets.push(path);
  }
  for (const kind of codexCatalogCacheKinds) {
    const directory = assertContained(join(codexCatalogCacheRoot, kind), codexCatalogCacheRoot);
    for (const path of await matchingCatalogFiles(directory)) {
      targets.push(assertContained(path, directory));
    }
  }
  return {
    schema_version: "1",
    home: safeHome,
    allowed_roots: [
      codexPluginCacheRoot,
      codexCatalogCacheRoot,
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
