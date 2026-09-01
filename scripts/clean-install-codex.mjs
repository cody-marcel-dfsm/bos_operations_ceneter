import { execFile, spawn } from "node:child_process";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { pathExists, readJson, root, stableJson } from "./lib/package-model.mjs";

const execFileAsync = promisify(execFile);
export const CODEX_CLEAN_CONFIRMATION = "DELETE ALL BOS CODEX PLUGIN STATE";
const marketplace = "bos-education-center";
const products = ["education-center", "bos"];
const bosResourceUrl = "https://dfsm.ai/mcp/apps/bos/platform";
const bosCodexAppIds = [
  "plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91",
  "asdk_app_6a95a014a0a08191a9e6d16453a8b831",
  "asdk_app_6a932992592081919cdc88c60e4ff2dd"
];

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
  const globalStateContent = (await pathExists(globalState))
    ? await readFile(globalState, "utf8")
    : "";
  return {
    schema_version: "1",
    app_id: appId,
    package_cache: (await pathExists(packageCache)) ? packageCache : null,
    registered_app_wrappers: registeredAppWrappers,
    cache_files: [...new Set(cacheFiles)].sort(),
    global_state: [bosResourceUrl, ...bosCodexAppIds].some((needle) =>
      globalStateContent.includes(needle)
    ) ? globalState : null
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
        actions: deferredClients.map((client) => `clean_install_scheduled:${client}`),
        next_action: "The clean install will close ChatGPT, reinstall BOS while it is stopped, and reopen ChatGPT automatically."
      };
    }
  }
  const plan = await planCodexCleanup(options);
  const actions = [];
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
    const removed = removeBosToolsFromGlobalState(state, plan.app_id);
    const temporary = `${plan.global_state}.tmp-${process.pid}`;
    await writeFile(temporary, stableJson(state));
    await rename(temporary, plan.global_state);
    actions.push(`removed_global_catalog_tools:${removed}`);
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

  await commandJson(
    options.runCommand,
    ["plugin", "marketplace", "add", options.source, "--json"]
  );
  actions.push(`added_marketplace:${options.source}`);
  for (const product of ["bos", "education-center"]) {
    const selector = `${product}@${marketplace}`;
    await commandJson(options.runCommand, ["plugin", "add", selector, "--json"]);
    actions.push(`installed_plugin:${selector}`);
  }
  return {
    schema_version: "1",
    ok: true,
    actions,
    next_action: "The package installation is complete. The host will present BOS sign-in during OAuth discovery."
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await cleanInstallCodex(options);
  if (options.json) process.stdout.write(stableJson(report));
  else {
    console.log("BOS Codex clean install completed.");
    console.log(report.next_action);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
