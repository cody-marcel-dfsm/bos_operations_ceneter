import { execFile } from "node:child_process";
import { lstat, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  planCodexCleanup,
  removeBosToolsFromGlobalState
} from "./clean-install-codex.mjs";
import { readJson, stableJson } from "./lib/package-model.mjs";

const execFileAsync = promisify(execFile);
export const ALL_CLIENTS_UNINSTALL_CONFIRMATION =
  "DELETE ALL BOS CLIENT PLUGIN STATE AND CACHES";

const marketplace = "bos-education-center";
const products = ["bos", "education-center"];
const bosPlatformUrl = "https://dfsm.ai/mcp/apps/bos/platform";

function output(result) {
  return typeof result === "string" ? result : result?.stdout ?? "";
}

function parseJson(result, fallback) {
  const value = output(result).trim();
  return value ? JSON.parse(value) : fallback;
}

function isMissingCommand(error) {
  return error?.code === "ENOENT";
}

async function pathPresent(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function validatedBosProductPath(path, expectedProduct, expectedClient) {
  if (!(await pathPresent(path))) return false;
  const metadataPath = join(path, ".bos-product.json");
  if (!(await pathPresent(metadataPath))) {
    throw new Error(`Refusing to remove an unverified product path: ${path}`);
  }
  const metadata = await readJson(metadataPath);
  if (metadata.name !== expectedProduct ||
      (expectedClient && metadata.client !== expectedClient)) {
    throw new Error(`Refusing to remove a mismatched product path: ${path}`);
  }
  return true;
}

async function preflightClaudeCache(home) {
  const root = join(home, ".claude", "plugins", "cache", marketplace);
  if (!(await pathPresent(root))) return null;
  for (const product of products) {
    const productRoot = join(root, product);
    if (!(await pathPresent(productRoot))) continue;
    for (const version of await readdir(productRoot, { withFileTypes: true })) {
      if (!version.isDirectory()) continue;
      await validatedBosProductPath(join(productRoot, version.name), product, "claude");
    }
  }
  return root;
}

async function inspectNativeClients(runCommand) {
  const state = { codex: null, claude: null };
  try {
    state.codex = {
      plugins: parseJson(await runCommand("codex", ["plugin", "list", "--json"]), {}),
      marketplaces: parseJson(await runCommand(
        "codex", ["plugin", "marketplace", "list", "--json"]
      ), {})
    };
  } catch (error) {
    if (!isMissingCommand(error)) throw error;
  }
  try {
    state.claude = {
      plugins: parseJson(await runCommand("claude", ["plugin", "list", "--json"]), []),
      marketplaces: parseJson(await runCommand(
        "claude", ["plugin", "marketplace", "list", "--json"]
      ), [])
    };
  } catch (error) {
    if (!isMissingCommand(error)) throw error;
  }
  return state;
}

function codexInstalled(listing, selector) {
  return (listing?.installed ?? []).some((entry) => entry.pluginId === selector);
}

function codexMarketplaceInstalled(listing) {
  const entries = Array.isArray(listing) ? listing : listing?.marketplaces ?? [];
  return entries.some((entry) =>
    entry?.name === marketplace || entry?.marketplaceName === marketplace
  );
}

function claudeInstalled(listing, selector) {
  return (Array.isArray(listing) ? listing : []).some((entry) => entry.id === selector);
}

function claudeMarketplaceInstalled(listing) {
  return (Array.isArray(listing) ? listing : []).some((entry) => entry.name === marketplace);
}

async function removePath(path, actions, dryRun) {
  if (!path || !(await pathPresent(path))) return;
  actions.push(`remove:${path}`);
  if (!dryRun) await rm(path, { recursive: true, force: true });
}

async function removeCodexGlobalState(plan, actions, dryRun) {
  if (!plan.global_state) return;
  const state = await readJson(plan.global_state);
  const removed = removeBosToolsFromGlobalState(state, plan.app_id);
  if (removed === 0) return;
  actions.push(`remove_codex_catalog_tools:${removed}`);
  if (dryRun) return;
  const temporary = `${plan.global_state}.tmp-${process.pid}`;
  await writeFile(temporary, stableJson(state));
  await rename(temporary, plan.global_state);
}

async function removeCopilotRoot(target, actions, dryRun) {
  for (const relativePath of [join(".github", "mcp.json"), join(".vscode", "mcp.json")]) {
    const path = join(target, relativePath);
    if (!(await pathPresent(path))) continue;
    const config = await readJson(path);
    const collectionName = config.servers ? "servers" : config.mcpServers ? "mcpServers" : null;
    if (!collectionName) continue;
    const servers = config[collectionName];
    const removedNames = Object.entries(servers).filter(([, server]) =>
      server?.url === bosPlatformUrl
    ).map(([name]) => name);
    if (!removedNames.length) continue;
    for (const name of removedNames) delete servers[name];
    actions.push(`remove_copilot_mcp:${path}:${removedNames.join(",")}`);
    if (!dryRun) {
      const temporary = `${path}.tmp-${process.pid}`;
      await writeFile(temporary, stableJson(config));
      await rename(temporary, path);
    }
  }

  const statePaths = [];
  for (const product of products) {
    for (const rootName of [join(".github", "plugins"), join(".agents", "plugins")]) {
      const productRoot = join(target, rootName, product);
      if (await validatedBosProductPath(productRoot, product, "copilot")) {
        await removePath(productRoot, actions, dryRun);
      }
    }
  }
  // Copilot skills can be shared with unrelated installations. Remove a skill
  // only when a BOS package state file explicitly records it as managed.
  for (const candidate of [
    join(target, ".github", ".bos-package-state.json"),
    join(target, ".agents", ".bos-package-state.json")
  ]) {
    if (await pathPresent(candidate)) statePaths.push(candidate);
  }
  for (const statePath of statePaths) {
    const state = await readJson(statePath);
    for (const managedPath of state.managed_paths ?? []) {
      const normalized = String(managedPath).replaceAll("\\", "/");
      if (!normalized.includes("skills/")) continue;
      const absolute = resolve(dirname(statePath), managedPath);
      if (!absolute.startsWith(`${resolve(target)}/`)) {
        throw new Error(`Unsafe Copilot managed path: ${managedPath}`);
      }
      await removePath(absolute, actions, dryRun);
    }
    await removePath(statePath, actions, dryRun);
  }
}

export async function uninstallBosAllClients({
  confirmation,
  home = homedir(),
  copilotRoots = [],
  dryRun = false,
  runCommand = execFileAsync
} = {}) {
  if (!dryRun && confirmation !== ALL_CLIENTS_UNINSTALL_CONFIRMATION) {
    throw new Error(`Confirmation must equal: ${ALL_CLIENTS_UNINSTALL_CONFIRMATION}`);
  }

  const nativeBefore = await inspectNativeClients(runCommand);
  const codexPlan = await planCodexCleanup({ home });
  const claudeCache = await preflightClaudeCache(home);
  const actions = [];

  if (nativeBefore.codex) {
    for (const product of products) {
      const selector = `${product}@${marketplace}`;
      if (!codexInstalled(nativeBefore.codex.plugins, selector)) continue;
      actions.push(`unregister_codex_plugin:${selector}`);
      if (!dryRun) await runCommand("codex", ["plugin", "remove", selector, "--json"]);
    }
    if (codexMarketplaceInstalled(nativeBefore.codex.marketplaces)) {
      actions.push(`unregister_codex_marketplace:${marketplace}`);
      if (!dryRun) await runCommand(
        "codex", ["plugin", "marketplace", "remove", marketplace, "--json"]
      );
    }
  }

  if (nativeBefore.claude) {
    for (const product of products) {
      const selector = `${product}@${marketplace}`;
      if (!claudeInstalled(nativeBefore.claude.plugins, selector)) continue;
      actions.push(`unregister_claude_plugin:${selector}`);
      if (!dryRun) await runCommand(
        "claude", ["plugin", "uninstall", selector, "--scope", "user"]
      );
    }
    if (claudeMarketplaceInstalled(nativeBefore.claude.marketplaces)) {
      actions.push(`unregister_claude_marketplace:${marketplace}`);
      if (!dryRun) await runCommand(
        "claude", ["plugin", "marketplace", "remove", marketplace, "--scope", "user"]
      );
    }
  }

  await removeCodexGlobalState(codexPlan, actions, dryRun);
  for (const path of [
    codexPlan.package_cache,
    codexPlan.registered_app_wrapper,
    ...codexPlan.cache_files,
    join(home, ".codex", "bos-clean-install-backups"),
    claudeCache,
    join(home, ".claude", "plugins", ".install-manifests", `bos@${marketplace}.json`),
    join(home, ".claude", "plugins", ".install-manifests", `education-center@${marketplace}.json`),
    join(home, ".claude", "plugins", "marketplaces", marketplace),
    join(home, ".gemini", "extensions", "bos"),
    join(home, ".gemini", "extensions", "education-center"),
    join(home, ".gemini", "config", "plugins", "bos"),
    join(home, ".gemini", "config", "plugins", "education-center"),
    join(home, "Library", "Caches", "ai.dfsm.bos"),
    join(home, ".cache", "ai.dfsm.bos")
  ]) await removePath(path, actions, dryRun);

  for (const target of copilotRoots.map(resolve)) {
    await removeCopilotRoot(target, actions, dryRun);
  }

  if (dryRun) return { schema_version: "1", ok: true, dry_run: true, actions };

  const nativeAfter = await inspectNativeClients(runCommand);
  const failures = [];
  if (nativeAfter.codex) {
    for (const product of products) {
      const selector = `${product}@${marketplace}`;
      if (codexInstalled(nativeAfter.codex.plugins, selector)) failures.push(`Codex plugin remains: ${selector}`);
    }
    if (codexMarketplaceInstalled(nativeAfter.codex.marketplaces)) {
      failures.push(`Codex marketplace remains: ${marketplace}`);
    }
  }
  if (nativeAfter.claude) {
    for (const product of products) {
      const selector = `${product}@${marketplace}`;
      if (claudeInstalled(nativeAfter.claude.plugins, selector)) failures.push(`Claude plugin remains: ${selector}`);
    }
    if (claudeMarketplaceInstalled(nativeAfter.claude.marketplaces)) {
      failures.push(`Claude marketplace remains: ${marketplace}`);
    }
  }
  for (const action of actions.filter((entry) => entry.startsWith("remove:"))) {
    const path = action.slice("remove:".length);
    if (await pathPresent(path)) failures.push(`Filesystem artifact remains: ${path}`);
  }
  if (codexPlan.global_state &&
      (await readFile(codexPlan.global_state, "utf8")).includes(codexPlan.app_id)) {
    failures.push(`Codex global state still references ${codexPlan.app_id}`);
  }
  return {
    schema_version: "1",
    ok: failures.length === 0,
    dry_run: false,
    actions,
    failures,
    clients: {
      codex: nativeAfter.codex ? "verified_absent" : "not_installed",
      claude: nativeAfter.claude ? "verified_absent" : "not_installed",
      gemini_antigravity: "verified_absent",
      copilot: copilotRoots.length ? "verified_absent" : "no_registered_roots"
    },
    next_action: "Quit and reopen any running AI clients so their in-memory tool catalogs are discarded."
  };
}

function parseArgs(argv) {
  const options = { home: homedir(), copilotRoots: [], dryRun: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--confirmation") options.confirmation = argv[++index];
    else if (argument === "--home") options.home = resolve(argv[++index]);
    else if (argument === "--copilot-root") options.copilotRoots.push(resolve(argv[++index]));
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await uninstallBosAllClients(options);
  if (options.json) process.stdout.write(stableJson(report));
  else {
    console.log(report.dry_run ? "BOS all-client uninstall dry run:" : "BOS all-client uninstall:");
    for (const action of report.actions) console.log(`- ${action}`);
    for (const failure of report.failures ?? []) console.error(`- failure:${failure}`);
    if (report.next_action) console.log(report.next_action);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
