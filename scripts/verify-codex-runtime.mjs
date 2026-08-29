import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { listProducts, pathExists, readJson, root, stableJson } from "./lib/package-model.mjs";

const execFileAsync = promisify(execFile);
const defaultMarketplace = "bos-education-center";

function marketplaceEntries(value) {
  return Array.isArray(value) ? value : value?.marketplaces ?? [];
}

function parseArgs(argv) {
  const options = { home: homedir(), json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--home") options.home = resolve(argv[++index]);
    else if (argument === "--catalog") options.catalogPath = resolve(argv[++index]);
    else if (argument === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function parseCommandJson(result, label) {
  const output = typeof result === "string" ? result : result?.stdout;
  try {
    return JSON.parse(output ?? "");
  } catch {
    throw new Error(`${label} did not return valid JSON`);
  }
}

async function newestJsonContaining(directory, needle) {
  if (!(await pathExists(directory))) return null;
  const candidates = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const path = join(directory, entry.name);
    const content = await readFile(path, "utf8");
    if (!content.includes(needle)) continue;
    candidates.push({ path, modified: (await stat(path)).mtimeMs });
  }
  candidates.sort((left, right) => right.modified - left.modified);
  return candidates[0]?.path ?? null;
}

async function installedCacheVersions(home, marketplace, product) {
  const productRoot = join(home, ".codex", "plugins", "cache", marketplace, product);
  if (!(await pathExists(productRoot))) return [];
  return (await readdir(productRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function inspectRegisteredAppWrapper(home, appId) {
  const suffix = appId.replace(/^asdk_app_/, "");
  const wrapperRoot = join(
    home,
    ".codex",
    "plugins",
    "cache",
    "created-by-me-remote",
    `dev-${suffix}`
  );
  const installPath = join(wrapperRoot, ".codex-remote-plugin-install.json");
  if (!(await pathExists(installPath))) {
    return { state: "missing", path: wrapperRoot };
  }
  const install = await readJson(installPath);
  const versions = (await readdir(wrapperRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const validIdentity = install.remote_plugin_id === `plugin_${appId}`;
  return {
    state: validIdentity && versions.length === 1 ? "current" : "invalid",
    path: wrapperRoot,
    remote_plugin_id: install.remote_plugin_id,
    versions
  };
}

function publicToolNames(catalog) {
  return new Set(
    (catalog?.tools ?? [])
      .map((tool) => tool?.name)
      .filter((name) => typeof name === "string")
      .map((name) => name.split(".").at(-1))
  );
}

export async function inspectCodexRuntime(rawOptions = {}) {
  const options = {
    home: homedir(),
    runCommand: execFileAsync,
    marketplace: defaultMarketplace,
    ...rawOptions
  };
  const activeProducts = (await listProducts())
    .map(({ manifest }) => manifest)
    .filter((manifest) => manifest.release_status === "active" && manifest.clients.includes("codex"));
  const bos = activeProducts.find((product) => product.name === "bos");
  if (!bos?.codex_app_id) throw new Error("Active BOS product has no Codex app ID");

  const pluginListing = parseCommandJson(
    await options.runCommand("codex", ["plugin", "list", "--json"]),
    "codex plugin list"
  );
  const marketplaceListing = parseCommandJson(
    await options.runCommand("codex", ["plugin", "marketplace", "list", "--json"]),
    "codex plugin marketplace list"
  );
  const installedById = new Map(
    (pluginListing.installed ?? []).map((entry) => [entry.pluginId, entry])
  );
  const installedProducts = {};
  const cacheVersions = {};
  for (const product of activeProducts) {
    const pluginId = `${product.name}@${options.marketplace}`;
    const entry = installedById.get(pluginId);
    installedProducts[product.name] = {
      plugin_id: pluginId,
      state: entry?.installed && entry?.enabled ? "current" : "missing",
      version: entry?.version ?? null
    };
    cacheVersions[product.name] = await installedCacheVersions(
      options.home,
      options.marketplace,
      product.name
    );
  }

  const marketplaceCurrent = marketplaceEntries(marketplaceListing).some((entry) =>
    entry?.name === options.marketplace || entry?.marketplaceName === options.marketplace
  );
  const wrapper = await inspectRegisteredAppWrapper(options.home, bos.codex_app_id);
  const catalogPath = options.catalogPath ?? await newestJsonContaining(
    join(options.home, ".codex", "cache", "codex_apps_tools"),
    bos.codex_app_id
  );
  const catalog = catalogPath ? await readJson(catalogPath) : null;
  const discovered = publicToolNames(catalog);
  const requiredTools = [...new Set(activeProducts.flatMap(
    (product) => product.runtime_verification_tools ?? []
  ))].sort();
  const missingTools = requiredTools.filter((tool) => !discovered.has(tool));
  const packageFailures = activeProducts.flatMap((product) => {
    const versions = cacheVersions[product.name];
    return versions.length === 1 && versions[0] === product.version
      ? []
      : [`${product.name} cache versions=${versions.join(",") || "missing"}`];
  });
  const registryFailures = Object.values(installedProducts)
    .filter((entry) => entry.state !== "current")
    .map((entry) => `${entry.plugin_id} is not installed and enabled`);
  const failures = [
    ...registryFailures,
    ...(marketplaceCurrent ? [] : [`${options.marketplace} marketplace is not registered`]),
    ...packageFailures,
    ...(wrapper.state === "current" ? [] : ["registered BOS app wrapper is missing or invalid"]),
    ...(catalogPath ? [] : ["Codex callable-tool catalog is missing"]),
    ...missingTools.map((tool) => `callable tool is missing: ${tool}`)
  ];

  return {
    schema_version: "1",
    ok: failures.length === 0,
    app_id: bos.codex_app_id,
    marketplace: {
      name: options.marketplace,
      state: marketplaceCurrent ? "current" : "missing"
    },
    installed_products: installedProducts,
    cache_versions: cacheVersions,
    registered_app_wrapper: wrapper,
    callable_catalog: {
      path: catalogPath,
      discovered_tool_count: discovered.size,
      required_tools: requiredTools,
      missing_tools: missingTools
    },
    failures
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await inspectCodexRuntime(options);
  if (options.json) process.stdout.write(stableJson(report));
  else {
    console.log(`Codex BOS runtime: ${report.ok ? "ready" : "incomplete"}`);
    for (const failure of report.failures) console.log(`failure: ${failure}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
