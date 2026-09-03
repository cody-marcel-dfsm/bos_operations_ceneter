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

async function currentDirectSource(sourcePath, product) {
  if (!sourcePath || !(await pathExists(sourcePath))) return null;
  try {
    const metadata = await readJson(join(sourcePath, ".bos-product.json"));
    return metadata.name === product.name &&
      metadata.client === "codex" &&
      metadata.version === product.version
      ? sourcePath
      : null;
  } catch {
    return null;
  }
}

async function inspectInstalledMcpBinding(home, marketplace, product, versions, sourcePath) {
  const packageRoot = sourcePath ?? (versions.length === 1
    ? join(home, ".codex", "plugins", "cache", marketplace, product.name, versions[0])
    : null);
  const path = packageRoot ? join(packageRoot, ".mcp.json") : null;
  const pluginPath = packageRoot ? join(packageRoot, ".codex-plugin", "plugin.json") : null;
  const appPath = packageRoot ? join(packageRoot, ".app.json") : null;
  if (
    !path ||
    !pluginPath ||
    !(await pathExists(path)) ||
    !(await pathExists(pluginPath))
  ) {
    return { state: "missing", path, plugin_path: pluginPath };
  }
  const manifest = await readJson(path);
  const plugin = await readJson(pluginPath);
  const entries = Object.entries(manifest.mcpServers ?? {});
  const [name, server] = entries[0] ?? [];
  const current = entries.length === 1 && name === product.mcp_group_name &&
    plugin.mcpServers === "./.mcp.json" &&
    !("apps" in plugin) &&
    !(await pathExists(appPath)) &&
    server?.type === "http" &&
    server?.url === product.mcp_resource_url &&
    server?.oauth_resource === product.mcp_resource_url &&
    server?.required === true &&
    server?.startup_timeout_sec === product.codex_mcp_startup_timeout_sec &&
    JSON.stringify(Object.keys(server ?? {}).sort()) ===
      JSON.stringify(["oauth_resource", "required", "startup_timeout_sec", "type", "url"]);
  return {
    state: current ? "current" : "invalid",
    path,
    plugin_path: pluginPath,
    server: current ? server : null
  };
}

function publicToolNames(catalog) {
  return new Set(
    (catalog?.tools ?? [])
      .map((entry) => entry?.name ?? entry?.tool?.name)
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
  if (!bos?.runtime) throw new Error("Active BOS product has no runtime declaration");

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
  const packageRoots = {};
  for (const product of activeProducts) {
    const pluginId = `${product.name}@${options.marketplace}`;
    const entry = installedById.get(pluginId);
    const sourcePath = typeof entry?.source?.path === "string" ? entry.source.path : null;
    installedProducts[product.name] = {
      plugin_id: pluginId,
      state: entry?.installed && entry?.enabled ? "current" : "missing",
      version: entry?.version ?? null,
      source_path: sourcePath
    };
    cacheVersions[product.name] = await installedCacheVersions(
      options.home,
      options.marketplace,
      product.name
    );
    packageRoots[product.name] = await currentDirectSource(sourcePath, product);
  }

  const marketplaceCurrent = marketplaceEntries(marketplaceListing).some((entry) =>
    entry?.name === options.marketplace || entry?.marketplaceName === options.marketplace
  );
  const mcpBinding = await inspectInstalledMcpBinding(
    options.home,
    options.marketplace,
    bos,
    cacheVersions[bos.name],
    packageRoots[bos.name]
  );
  const catalogPath = options.catalogPath ?? await newestJsonContaining(
    join(options.home, ".codex", "cache", "codex_apps_tools"),
    bos.mcp_resource_url
  );
  const catalog = catalogPath ? await readJson(catalogPath) : null;
  const discovered = publicToolNames(catalog);
  const requiredTools = [...new Set(activeProducts.flatMap(
    (product) => product.runtime_verification_tools ?? []
  ))].sort();
  const missingTools = requiredTools.filter((tool) => !discovered.has(tool));
  const packageFailures = activeProducts.flatMap((product) => {
    const versions = cacheVersions[product.name];
    const entry = installedProducts[product.name];
    const directSourceCurrent = packageRoots[product.name] && entry.version === product.version;
    return directSourceCurrent || (versions.length === 1 && versions[0] === product.version)
      ? []
      : [`${product.name} package version=${entry.version ?? "missing"}; cache versions=${versions.join(",") || "missing"}`];
  });
  const registryFailures = Object.values(installedProducts)
    .filter((entry) => entry.state !== "current")
    .map((entry) => `${entry.plugin_id} is not installed and enabled`);
  const failures = [
    ...registryFailures,
    ...(marketplaceCurrent ? [] : [`${options.marketplace} marketplace is not registered`]),
    ...packageFailures,
    ...(mcpBinding.state === "current" ? [] : ["package-owned BOS MCP binding is missing or invalid"]),
    ...(catalogPath ? [] : ["Codex static BOS tool catalog is missing"]),
    ...missingTools.map((tool) => `static catalog operation is missing: ${tool}`)
  ];

  return {
    schema_version: "1",
    ok: failures.length === 0,
    resource_url: bos.mcp_resource_url,
    marketplace: {
      name: options.marketplace,
      state: marketplaceCurrent ? "current" : "missing"
    },
    installed_products: installedProducts,
    cache_versions: cacheVersions,
    package_roots: packageRoots,
    mcp_binding: mcpBinding,
    callable_catalog: {
      path: catalogPath,
      semantics: "operation_schema_only",
      authorization_source: "tools_call_server_result",
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
