import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { activeClientProducts, verifyInstalledMetadata } from "./lib/client-runtime-verification.mjs";
import { pathExists, stableJson } from "./lib/package-model.mjs";

const execFileAsync = promisify(execFile);
const marketplace = "bos-education-center";

function outputJson(result, label) {
  const output = typeof result === "string" ? result : result?.stdout;
  try { return JSON.parse(output ?? ""); }
  catch { throw new Error(`${label} did not return valid JSON`); }
}

export async function inspectClaudeRuntime({
  home = homedir(),
  runCommand = execFileAsync
} = {}) {
  const products = await activeClientProducts("claude");
  const installed = outputJson(
    await runCommand("claude", ["plugin", "list", "--json"]),
    "claude plugin list"
  );
  const marketplaces = outputJson(
    await runCommand("claude", ["plugin", "marketplace", "list", "--json"]),
    "claude marketplace list"
  );
  const failures = [];
  const states = {};
  const retainedVersions = {};
  for (const product of products) {
    const id = `${product.name}@${marketplace}`;
    const entry = installed.find((candidate) => candidate.id === id && candidate.scope === "user");
    const entryFailures = [];
    if (!entry) entryFailures.push(`${id} is not installed at user scope`);
    else {
      if (!entry.enabled) entryFailures.push(`${id} is disabled`);
      if (entry.version !== product.version) {
        entryFailures.push(`${id} active version=${entry.version ?? "missing"}; expected ${product.version}`);
      }
      if (!entry.installPath) entryFailures.push(`${id} has no active installPath`);
      else entryFailures.push(...await verifyInstalledMetadata(
        join(entry.installPath, ".bos-product.json"),
        { name: product.name, version: product.version, client: "claude" }
      ));
    }
    states[product.name] = {
      id,
      state: entryFailures.length === 0 ? "current" : "incomplete",
      version: entry?.version ?? null,
      install_path: entry?.installPath ?? null
    };
    failures.push(...entryFailures);
    const cacheRoot = join(home, ".claude", "plugins", "cache", marketplace, product.name);
    retainedVersions[product.name] = await pathExists(cacheRoot)
      ? (await readdir(cacheRoot, { withFileTypes: true }))
        .filter((candidate) => candidate.isDirectory())
        .map((candidate) => candidate.name).sort()
      : [];
  }
  const marketplaceCurrent = marketplaces.some((entry) => entry.name === marketplace);
  if (!marketplaceCurrent) failures.push(`${marketplace} marketplace is not registered`);
  return {
    schema_version: "1",
    ok: failures.length === 0,
    marketplace: { name: marketplace, state: marketplaceCurrent ? "current" : "missing" },
    installed_products: states,
    retained_cache_versions: retainedVersions,
    retained_cache_policy: "Claude may retain inactive versions for seven days; only plugin-list installPath is active.",
    failures
  };
}

async function main() {
  const args = process.argv.slice(2);
  const homeIndex = args.indexOf("--home");
  const home = homeIndex >= 0 ? resolve(args[homeIndex + 1]) : homedir();
  const report = await inspectClaudeRuntime({ home });
  if (args.includes("--json")) process.stdout.write(stableJson(report));
  else {
    console.log(`Claude BOS runtime: ${report.ok ? "ready" : "incomplete"}`);
    for (const failure of report.failures) console.log(`failure: ${failure}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
