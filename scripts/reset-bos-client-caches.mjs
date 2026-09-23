import { lstat, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, stableJson } from "./lib/package-model.mjs";

export const CACHE_RESET_CONFIRMATION = "DELETE BOS CHATGPT AND CLAUDE CACHES";

const marketplace = "bos-education-center";
const products = ["bos", "education-center"];
const pluginRepository = "https://github.com/cody-marcel-dfsm/bos_operations_ceneter";

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

// Claude Desktop's independently-added Git marketplace is fetched and cached
// account-side (server-side), not in a stable local package-cache directory
// like the CLI's `~/.claude/plugins/cache`. The one locally reachable
// artifact is a per-session materialized snapshot of each installed plugin's
// files, regenerated fresh at the start of every new session. Clearing it
// cannot force the account-side marketplace to refetch a newer version — a
// new session simply regenerates the same snapshot from that same source —
// but it is a real BOS-owned artifact on disk and safe to include once each
// candidate is validated against this exact plugin's own metadata.
async function findDesktopSessionPluginSnapshots(sessionsRoot) {
  const targets = [];
  if (!(await pathPresent(sessionsRoot))) return targets;
  const sessionRootStat = await lstat(sessionsRoot);
  if (sessionRootStat.isSymbolicLink() || !sessionRootStat.isDirectory()) return targets;
  for (const account of await readdir(sessionsRoot, { withFileTypes: true })) {
    if (!account.isDirectory()) continue;
    const accountRoot = join(sessionsRoot, account.name);
    for (const session of await readdir(accountRoot, { withFileTypes: true })) {
      if (!session.isDirectory()) continue;
      const rpmRoot = join(accountRoot, session.name, "rpm");
      if (!(await pathPresent(rpmRoot))) continue;
      for (const entry of await readdir(rpmRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith("plugin_")) continue;
        const pluginDir = join(rpmRoot, entry.name);
        const metadataPath = join(pluginDir, ".claude-plugin", "plugin.json");
        if (!(await pathPresent(metadataPath))) continue;
        const metadata = await readJson(metadataPath);
        if (products.includes(metadata.name) && metadata.repository === pluginRepository) {
          targets.push(assertContained(pluginDir, sessionsRoot));
        }
      }
    }
  }
  return targets;
}

// A CLI-registered local-directory marketplace (`claude plugin marketplace
// add <path>` against this checkout, or the equivalent `extraKnownMarketplaces`
// entry in user settings) is a local development artifact, not the customer
// install path documented in README.md — customers add this marketplace from
// its Git URL through Claude Desktop's own "Add marketplace" UI, which is
// account-scoped and never touches these files. When a local-directory
// registration lingers under this exact marketplace name, it collides with a
// correctly git-sourced one and Claude Desktop keeps re-deriving it from
// `~/.claude/settings.json` on every launch, which no amount of editing
// `known_marketplaces.json` alone can fix. Clear the registration from both
// files; only ever remove the entry keyed exactly to this marketplace name,
// and only when present.
async function readJsonIfPresent(path) {
  if (!(await pathPresent(path))) return null;
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Refusing non-file registration target: ${path}`);
  }
  return JSON.parse(await readFile(path, "utf8"));
}

async function planKnownMarketplacesReset(path) {
  const document = await readJsonIfPresent(path);
  if (!document || !(marketplace in document)) return null;
  return { kind: "known_marketplaces", path, marketplace };
}

async function planExtraKnownMarketplacesReset(path) {
  const document = await readJsonIfPresent(path);
  if (!document?.extraKnownMarketplaces || !(marketplace in document.extraKnownMarketplaces)) {
    return null;
  }
  return { kind: "extra_known_marketplaces", path, marketplace };
}

async function applyRegistrationReset(registration) {
  const document = await readJsonIfPresent(registration.path);
  if (!document) return false;
  if (registration.kind === "known_marketplaces") {
    if (!(registration.marketplace in document)) return false;
    delete document[registration.marketplace];
  } else {
    if (!document.extraKnownMarketplaces || !(registration.marketplace in document.extraKnownMarketplaces)) {
      return false;
    }
    delete document.extraKnownMarketplaces[registration.marketplace];
  }
  await writeFile(registration.path, `${JSON.stringify(document, null, 2)}\n`);
  return true;
}

async function registrationStillPresent(registration) {
  const document = await readJsonIfPresent(registration.path);
  if (!document) return false;
  if (registration.kind === "known_marketplaces") return registration.marketplace in document;
  return Boolean(document.extraKnownMarketplaces?.[registration.marketplace]);
}

export async function planBosClientCacheReset({ home = homedir() } = {}) {
  const safeHome = assertSafeHome(home);
  const codexPluginCacheRoot = join(safeHome, ".codex", "plugins", "cache");
  const claudePluginCacheRoot = join(safeHome, ".claude", "plugins", "cache");
  const claudeDesktopSessionsRoot = join(
    safeHome, "Library", "Application Support", "Claude", "local-agent-mode-sessions"
  );
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
  targets.push(...await findDesktopSessionPluginSnapshots(claudeDesktopSessionsRoot));

  const knownMarketplacesPath = join(safeHome, ".claude", "plugins", "known_marketplaces.json");
  const claudeSettingsPath = join(safeHome, ".claude", "settings.json");
  const registrations = (await Promise.all([
    planKnownMarketplacesReset(knownMarketplacesPath),
    planExtraKnownMarketplacesReset(claudeSettingsPath)
  ])).filter(Boolean);

  return {
    schema_version: "1",
    home: safeHome,
    allowed_roots: [
      codexPluginCacheRoot,
      claudePluginCacheRoot,
      claudeDesktopSessionsRoot,
      knownMarketplacesPath,
      claudeSettingsPath
    ],
    targets: [...new Set(targets)].sort(),
    registrations
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
  const actions = [
    ...plan.targets.map((path) => `remove_cache:${path}`),
    ...plan.registrations.map((r) => `remove_local_marketplace_registration:${r.path}`)
  ];
  if (!dryRun) {
    for (const path of plan.targets) await rm(path, { recursive: true, force: true });
    for (const registration of plan.registrations) await applyRegistrationReset(registration);
  }
  const failures = [];
  if (!dryRun) {
    for (const path of plan.targets) {
      if (await pathPresent(path)) failures.push(`Cache artifact remains: ${path}`);
    }
    for (const registration of plan.registrations) {
      if (await registrationStillPresent(registration)) {
        failures.push(`Local marketplace registration remains: ${registration.path}`);
      }
    }
  }
  return {
    schema_version: "1",
    ok: failures.length === 0,
    dry_run: dryRun,
    scope: "local_chatgpt_codex_claude_and_claude_desktop_session_caches_only",
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
