import { execFile, spawn } from "node:child_process";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createCodexAccountPluginClient } from "./lib/codex-account-plugin-client.mjs";
import {
  codexConnectorContract,
  pathExists,
  readJson,
  root,
  stableJson
} from "./lib/package-model.mjs";

const execFileAsync = promisify(execFile);
export const CODEX_CLEAN_CONFIRMATION = "DELETE ALL BOS CODEX PLUGIN STATE";
const marketplace = "bos-education-center";
const products = ["education-center", "bos"];
const bosProduct = await readJson(join(root, "products", "bos", "product.json"));
const bosConnector = codexConnectorContract(bosProduct);
const bosResourceUrl = bosProduct.mcp_resource_url;
const bosCodexAppIds = [bosConnector.id, ...bosConnector.retired_ids];
const retiredRawBosCodexAppIds = new Set(bosConnector.retired_ids.map(codexAppRecordId));

function codexAppRecordId(id) {
  return id.replace(/^plugin_/, "");
}

function codexAppWrapperSuffix(id) {
  return codexAppRecordId(id).replace(/^asdk_app_/, "");
}

function codexRemotePluginId(id) {
  return id.startsWith("plugin_") ? id : `plugin_${id}`;
}
const cacheKinds = [
  "codex_app_directory",
  "codex_apps_server_info",
  "codex_apps_tools",
  "remote_plugin_catalog"
];

async function deferCodexDesktopInstall({ home, source, runCommand }) {
  if (process.platform !== "darwin") return [];
  const result = await runCommand("ps", ["-axo", "pid=,args="]);
  const processLine = String(result?.stdout ?? result ?? "").split("\n").find((line) =>
    line.includes("/Applications/ChatGPT.app/Contents/MacOS/ChatGPT")
  );
  if (!processLine) return [];
  const pid = Number(processLine.trim().split(/\s+/, 1)[0]);
  if (!Number.isSafeInteger(pid) || pid <= 1) {
    throw new Error("Could not resolve the running ChatGPT process ID");
  }
  const helper = join(dirname(fileURLToPath(import.meta.url)), "deferred-clean-install-codex.mjs");
  const child = spawn(process.execPath, [
    helper,
    "--delay-ms", "45000",
    "--pid", String(pid),
    "--home", home,
    "--source", source
  ], { detached: true, stdio: "ignore" });
  child.unref();
  return ["ChatGPT"];
}

function marketplaceEntries(value) {
  return Array.isArray(value) ? value : value?.marketplaces ?? [];
}

function parseArgs(argv) {
  const options = { home: homedir(), source: join(root, "clients", "codex"), json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--home") options.home = resolve(argv[++index]);
    else if (argument === "--source") options.source = resolve(argv[++index]);
    else if (argument === "--confirmation") options.confirmation = argv[++index];
    else if (argument === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function filesContaining(directory, needle) {
  if (!(await pathExists(directory))) return [];
  const matches = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(directory, entry.name);
    if ((await readFile(path, "utf8")).includes(needle)) matches.push(path);
  }
  return matches.sort();
}

async function validatePackageCache(path) {
  if (!(await pathExists(path))) return;
  for (const product of products) {
    const productRoot = join(path, product);
    if (!(await pathExists(productRoot))) continue;
    for (const version of await readdir(productRoot, { withFileTypes: true })) {
      if (!version.isDirectory()) continue;
      const metadata = await readJson(join(productRoot, version.name, ".bos-product.json"));
      if (metadata.name !== product) {
        throw new Error(`Refusing to remove mismatched plugin cache: ${productRoot}`);
      }
    }
  }
}

export async function planCodexCleanup(rawOptions = {}) {
  const options = { home: homedir(), ...rawOptions };
  const appId = bosCodexAppIds[0];
  const packageCache = join(options.home, ".codex", "plugins", "cache", marketplace);
  await validatePackageCache(packageCache);
  const registeredAppWrappers = [];
  for (const knownAppId of bosCodexAppIds) {
    const suffix = codexAppWrapperSuffix(knownAppId);
    const wrapper = join(
      options.home,
      ".codex",
      "plugins",
      "cache",
      "created-by-me-remote",
      `dev-${suffix}`
    );
    if (await pathExists(wrapper)) {
      const wrapperInstall = await readJson(join(wrapper, ".codex-remote-plugin-install.json"));
      if (wrapperInstall.remote_plugin_id !== codexRemotePluginId(knownAppId)) {
        throw new Error(`Refusing to remove mismatched registered-app wrapper: ${wrapper}`);
      }
      registeredAppWrappers.push(wrapper);
    }
  }
  const cacheFiles = [];
  for (const kind of cacheKinds) {
    for (const needle of [bosResourceUrl, ...bosCodexAppIds]) {
      cacheFiles.push(...await filesContaining(
        join(options.home, ".codex", "cache", kind),
        needle
      ));
    }
  }
  const globalState = join(options.home, ".codex", ".codex-global-state.json");
  const globalStateValue = (await pathExists(globalState))
    ? await readJson(globalState)
    : null;
  return {
    schema_version: "1",
    app_id: appId,
    package_cache: (await pathExists(packageCache)) ? packageCache : null,
    registered_app_wrappers: registeredAppWrappers,
    cache_files: [...new Set(cacheFiles)].sort(),
    global_state: globalStateValue && hasBosPluginState(globalStateValue)
      ? globalState
      : null
  };
}

export function removeBosToolsFromGlobalState(state, appId = bosCodexAppIds[0]) {
  const catalog = state?.["electron-persisted-atom-state"]
    ?.["mcp-extension-sidebar-catalog"]?.catalog;
  if (!Array.isArray(catalog)) return 0;
  let removed = 0;
  for (const entry of catalog) {
    if (!Array.isArray(entry?.tools)) continue;
    const before = entry.tools.length;
    entry.tools = entry.tools.filter((tool) => {
      const connector = tool?._meta?.connector_id;
      const resource = tool?._meta?._codex_apps?.resource_uri;
      return connector !== appId &&
        !bosCodexAppIds.includes(connector) &&
        !(typeof resource === "string" && resource.includes(bosResourceUrl)) &&
        !(typeof resource === "string" && resource.includes(`/${appId}/`));
    });
    removed += before - entry.tools.length;
  }
  return removed;
}

function containsBosIdentity(value) {
  const content = JSON.stringify(value);
  return [bosResourceUrl, ...bosCodexAppIds].some((needle) =>
    content.includes(needle)
  );
}

function bosOauthResumeEntries(state) {
  const resume = state?.["electron-persisted-atom-state"]
    ?.["app-connect-oauth-plugin-install-resume-by-state-v1"];
  if (!resume || typeof resume !== "object" || Array.isArray(resume)) return [];
  return Object.entries(resume).filter(([, value]) => containsBosIdentity(value));
}

export function removeBosPluginStateFromGlobalState(state) {
  let removed = removeBosToolsFromGlobalState(state);
  const resume = state?.["electron-persisted-atom-state"]
    ?.["app-connect-oauth-plugin-install-resume-by-state-v1"];
  for (const [key] of bosOauthResumeEntries(state)) {
    delete resume[key];
    removed += 1;
  }
  return removed;
}

function hasBosPluginState(state) {
  const copy = structuredClone(state);
  return removeBosPluginStateFromGlobalState(copy) > 0;
}

async function commandJson(runCommand, args) {
  const result = await runCommand("codex", args);
  const output = typeof result === "string" ? result : result?.stdout;
  return output ? JSON.parse(output) : null;
}

export async function cleanInstallCodex(rawOptions = {}) {
  const options = {
    home: homedir(),
    source: join(root, "clients", "codex"),
    runCommand: execFileAsync,
    deferWhileRunning: true,
    deferRunningInstall: deferCodexDesktopInstall,
    ...rawOptions
  };
  if (options.confirmation !== CODEX_CLEAN_CONFIRMATION) {
    throw new Error(`Confirmation must equal: ${CODEX_CLEAN_CONFIRMATION}`);
  }
  if (options.deferWhileRunning) {
    const deferredClients = await options.deferRunningInstall(options);
    if (deferredClients.length > 0) {
      return {
        schema_version: "1",
        ok: true,
        actions: deferredClients.map((client) => `clean_removal_scheduled:${client}`),
        next_action: "The cleanup will close ChatGPT, remove BOS plugin state while it is stopped, and reopen ChatGPT automatically. Nothing will be reinstalled."
      };
    }
  }
  const plan = await planCodexCleanup(options);
  const actions = [];
  const codexAccount = options.codexAccount ?? createCodexAccountPluginClient({
    debug: process.env.BOS_HTTP_DEBUG !== "0"
  });
  // Cleanup preserves the permanent product record. Only explicitly retired
  // accidental records from product.json are eligible for account deletion.
  for (const appId of retiredRawBosCodexAppIds) {
    const inspection = await codexAccount.inspectConnector(appId);
    if (inspection.http_status === 404) continue;
    if (!inspection.ok) {
      throw new Error(
        `BOS account app inspection failed for ${appId}: HTTP ${inspection.http_status}`
      );
    }
    const deletion = await codexAccount.remove(appId);
    actions.push(deletion.alreadyAbsent
      ? `account_app_already_absent:${appId}`
      : `removed_account_app:${appId}`);
  }
  const listing = await commandJson(options.runCommand, ["plugin", "list", "--json"]);
  const installedIds = new Set((listing?.installed ?? []).map((entry) => entry.pluginId));
  for (const product of products) {
    const selector = `${product}@${marketplace}`;
    if (!installedIds.has(selector)) continue;
    await commandJson(options.runCommand, ["plugin", "remove", selector, "--json"]);
    actions.push(`removed_plugin:${selector}`);
  }
  const marketplaces = await commandJson(
    options.runCommand,
    ["plugin", "marketplace", "list", "--json"]
  );
  if (marketplaceEntries(marketplaces).some((entry) =>
    entry?.name === marketplace || entry?.marketplaceName === marketplace
  )) {
    await commandJson(
      options.runCommand,
      ["plugin", "marketplace", "remove", marketplace, "--json"]
    );
    actions.push(`removed_marketplace:${marketplace}`);
  }

  if (plan.global_state) {
    const backup = join(
      options.home,
      ".codex",
      "bos-clean-install-backups",
      `${Date.now()}-codex-global-state.json`
    );
    await mkdir(dirname(backup), { recursive: true });
    await cp(plan.global_state, backup);
    const state = await readJson(plan.global_state);
    const removed = removeBosPluginStateFromGlobalState(state);
    const temporary = `${plan.global_state}.tmp-${process.pid}`;
    await writeFile(temporary, stableJson(state));
    await rename(temporary, plan.global_state);
    actions.push(`removed_global_plugin_state:${removed}`);
    actions.push(`global_state_backup:${backup}`);
  }
  for (const path of [
    plan.package_cache,
    ...plan.registered_app_wrappers,
    ...plan.cache_files
  ].filter(Boolean)) {
    await rm(path, { recursive: true, force: true });
    actions.push(`removed_cache:${path}`);
  }

  for (const appId of retiredRawBosCodexAppIds) {
    const inspection = await codexAccount.inspectConnector(appId);
    if (inspection.http_status !== 404) {
      throw new Error(`BOS account app cleanup failed for ${appId}`);
    }
  }
  actions.push("verified_accidental_account_apps_absent");

  const listingAfter = await commandJson(options.runCommand, ["plugin", "list", "--json"]);
  const installedAfter = new Set(
    (listingAfter?.installed ?? []).map((entry) => entry.pluginId)
  );
  const remainingProducts = products
    .map((product) => `${product}@${marketplace}`)
    .filter((selector) => installedAfter.has(selector));
  if (remainingProducts.length) {
    throw new Error(`BOS plugin cleanup failed: ${remainingProducts.join(", ")}`);
  }
  actions.push("verified_plugins_absent");

  const marketplacesAfter = await commandJson(
    options.runCommand,
    ["plugin", "marketplace", "list", "--json"]
  );
  if (marketplaceEntries(marketplacesAfter).some((entry) =>
    entry?.name === marketplace || entry?.marketplaceName === marketplace
  )) {
    throw new Error(`BOS marketplace cleanup failed: ${marketplace}`);
  }
  actions.push("verified_marketplace_absent");

  const remainingPaths = [];
  for (const path of [
    plan.package_cache,
    ...plan.registered_app_wrappers,
    ...plan.cache_files
  ].filter(Boolean)) {
    if (await pathExists(path)) remainingPaths.push(path);
  }
  if (remainingPaths.length) {
    throw new Error(`BOS local artifact cleanup failed: ${remainingPaths.join(", ")}`);
  }
  actions.push("verified_local_artifacts_absent");

  const globalState = join(options.home, ".codex", ".codex-global-state.json");
  if ((await pathExists(globalState)) && hasBosPluginState(await readJson(globalState))) {
    throw new Error("BOS global plugin state cleanup failed");
  }
  actions.push("verified_global_plugin_state_absent");

  return {
    schema_version: "1",
    ok: true,
    actions,
    next_action: "All retired accidental BOS account apps and all BOS plugin, marketplace, and local artifacts were removed. The permanent product record was preserved. Nothing was reinstalled."
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await cleanInstallCodex(options);
  if (options.json) process.stdout.write(stableJson(report));
  else {
    console.log("BOS Codex cleanup completed.");
    console.log(report.next_action);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
