import { execFile, spawn } from "node:child_process";
import { lstat, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  planCodexCleanup,
  removeBosToolsFromGlobalState
} from "./clean-install-codex.mjs";
import { createCodexAccountPluginClient } from "./lib/codex-account-plugin-client.mjs";
import { readJson, stableJson } from "./lib/package-model.mjs";

const execFileAsync = promisify(execFile);
export const ALL_CLIENTS_UNINSTALL_CONFIRMATION =
  "DELETE ALL BOS CLIENT PLUGIN STATE AND CACHES";

const marketplace = "bos-education-center";
const products = ["bos", "education-center"];
const legacyPersonalSkills = [
  ["bos-visual-output", "bos-visual-output"],
  ["camp-capacity-planning", "camp-capacity-planning"],
  ["codex-token-usage-analysis", "codex-token-usage-analysis"],
  ["collision-call-audit-email", "collision-call-audit-email"],
  ["collision-repair-proposal-builder", "collision-repair-proposal-builder"],
  ["corporate-counsel-cody", "corporate-counsel-cody"],
  ["email-account-routing", "email-account-routing"],
  ["hvac-marketing-sales", "campaign-offer-marketing-sales"],
  ["landing-page-copywriting", "landing-page-copywriting"],
  ["local-school-market-research", "local-school-market-research"],
  ["marketing-analysis", "marketing-analysis"],
  ["meta-ads-conversion-optimization", "meta-ads-conversion-optimization"],
  ["partnership-proposal-builder", "partnership-proposal-builder"],
  ["sendgrid-campaigns", "sendgrid-campaigns"],
  ["seo-improvement-loop", "seo-improvement-loop"]
];
const bosPlatformUrl = "https://dfsm.ai/mcp/apps/bos/platform";

async function scheduleCodexDesktopRestart({ dryRun, runCommand }) {
  if (process.platform !== "darwin") return [];
  const result = await runCommand("ps", ["-axo", "pid=,args="]);
  const processLine = output(result).split("\n").find((line) =>
    line.includes("/Applications/ChatGPT.app/Contents/MacOS/ChatGPT")
  );
  if (!processLine) return [];
  const pid = Number(processLine.trim().split(/\s+/, 1)[0]);
  if (!Number.isSafeInteger(pid) || pid <= 1) {
    throw new Error("Could not resolve the running ChatGPT process ID");
  }
  if (!dryRun) {
    const helper = join(dirname(fileURLToPath(import.meta.url)), "restart-running-ai-clients.mjs");
    const child = spawn(process.execPath, [
      helper, "--delay-ms", "45000", "--pid", String(pid), "ChatGPT"
    ], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
  }
  return ["ChatGPT"];
}

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
  if (!actions.includes(`remove:${path}`)) actions.push(`remove:${path}`);
  if (!dryRun) await rm(path, { recursive: true, force: true });
}

async function removeRepositoryMarketplaceManifest(path, actions, dryRun) {
  if (!(await pathPresent(path))) return;
  const manifest = await readJson(path);
  const names = (manifest.plugins ?? []).map((entry) => entry?.name).filter(Boolean);
  if (manifest.name !== marketplace ||
      names.some((name) => !products.includes(name))) {
    throw new Error(`Refusing to remove a non-BOS repository marketplace: ${path}`);
  }
  await removePath(path, actions, dryRun);
}

async function removeLegacyPersonalSkills(home, actions, dryRun) {
  for (const [folder, expectedName] of legacyPersonalSkills) {
    const path = join(home, ".codex", "skills", folder);
    if (!(await pathPresent(path))) continue;
    const skillFile = join(path, "SKILL.md");
    if (!(await pathPresent(skillFile))) {
      throw new Error(`Refusing to remove personal skill without SKILL.md: ${path}`);
    }
    const text = await readFile(skillFile, "utf8");
    if (!new RegExp(`^name:\\s*${expectedName.replaceAll("-", "\\-")}\\s*$`, "m").test(text)) {
      throw new Error(`Refusing to remove mismatched personal skill: ${path}`);
    }
    await removePath(path, actions, dryRun);
  }
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
  sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  copilotRoots = [],
  dryRun = false,
  runCommand = execFileAsync,
  codexAccount = createCodexAccountPluginClient(),
  restartRunningClients = scheduleCodexDesktopRestart
} = {}) {
  if (!dryRun && confirmation !== ALL_CLIENTS_UNINSTALL_CONFIRMATION) {
    throw new Error(`Confirmation must equal: ${ALL_CLIENTS_UNINSTALL_CONFIRMATION}`);
  }

  const nativeBefore = await inspectNativeClients(runCommand);
  const codexPlan = await planCodexCleanup({ home });
  const claudeCache = await preflightClaudeCache(home);
  const actions = [];
  for (const manifestPath of [
    join(sourceRoot, ".agents", "plugins", "marketplace.json"),
    join(sourceRoot, ".claude-plugin", "marketplace.json")
  ]) {
    await removeRepositoryMarketplaceManifest(manifestPath, actions, dryRun);
  }
  await removeLegacyPersonalSkills(home, actions, dryRun);
  const accountApps = await codexAccount.inspect(codexPlan.app_id);
  if (accountApps.length) {
    actions.push(`delete_codex_account_app:${codexPlan.app_id}`);
    if (!dryRun) await codexAccount.remove(codexPlan.app_id);
  }

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

  if (dryRun) {
    const clientsToRestart = await restartRunningClients({ dryRun: true, runCommand });
    for (const client of clientsToRestart) actions.push(`restart_running_client:${client}`);
    return {
    schema_version: "1",
    ok: true,
    dry_run: true,
    actions,
    blockers: [],
    visibility: {
      account_app: accountApps.length ? "scheduled_for_automatic_deletion" : "absent",
      repository_marketplace_cards: "scheduled_for_removal"
    }
    };
  }

  const nativeAfter = await inspectNativeClients(runCommand);
  const failures = [];
  const accountAppsAfter = await codexAccount.inspect(codexPlan.app_id);
  if (accountAppsAfter.length) {
    failures.push(`Codex account app remains: ${accountAppsAfter.map((entry) => entry.id).join(", ")}`);
  }
  // Fresh account verification necessarily refreshes the remote catalog cache.
  // Purge that verification artifact last so a successful run ends cache-free.
  for (const path of codexPlan.cache_files) await removePath(path, actions, false);
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
  for (const manifestPath of [
    join(sourceRoot, ".agents", "plugins", "marketplace.json"),
    join(sourceRoot, ".claude-plugin", "marketplace.json")
  ]) {
    if (await pathPresent(manifestPath)) {
      failures.push(`Repository marketplace remains: ${manifestPath}`);
    }
  }
  const clientsToRestart = failures.length
    ? []
    : await restartRunningClients({ dryRun: false, runCommand });
  for (const client of clientsToRestart) actions.push(`restart_running_client:${client}`);
  return {
    schema_version: "1",
    ok: failures.length === 0,
    dry_run: false,
    actions,
    failures,
    clients: {
      codex: nativeAfter.codex ? "verified_absent_including_account_app" : "not_installed",
      claude: nativeAfter.claude ? "verified_absent" : "not_installed",
      gemini_antigravity: "verified_absent",
      copilot: copilotRoots.length ? "verified_absent" : "no_registered_roots"
    },
    visibility: {
      account_app: accountAppsAfter.length ? "present" : "verified_absent",
      repository_marketplace_cards: "verified_absent"
    },
    runtime_refresh: clientsToRestart.length
      ? { status: "scheduled", clients: clientsToRestart, delay_seconds: 45 }
      : { status: "no_running_desktop_clients" }
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
    for (const blocker of report.blockers ?? []) console.error(`- blocker:${blocker}`);
    for (const failure of report.failures ?? []) console.error(`- failure:${failure}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
