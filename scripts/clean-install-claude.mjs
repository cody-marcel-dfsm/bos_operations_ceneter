import { execFile, spawnSync } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installClaudeLocal } from "./install-claude-local.mjs";
import { pathExists, readJson, root, stableJson } from "./lib/package-model.mjs";

const execFileAsync = promisify(execFile);
export const CLAUDE_CLEAN_CONFIRMATION = "DELETE ALL BOS CLAUDE PLUGIN STATE";
const marketplace = "bos-education-center";
const products = ["bos", "education-center"];

async function validateCache(cacheRoot) {
  if (!(await pathExists(cacheRoot))) return;
  for (const product of products) {
    const productRoot = join(cacheRoot, product);
    if (!(await pathExists(productRoot))) continue;
    for (const version of await readdir(productRoot, { withFileTypes: true })) {
      if (!version.isDirectory()) continue;
      const metadata = await readJson(join(productRoot, version.name, ".bos-product.json"));
      if (metadata.name !== product || metadata.client !== "claude") {
        throw new Error(`Refusing to remove mismatched Claude cache: ${productRoot}`);
      }
    }
  }
}

function json(result) {
  const output = typeof result === "string" ? result : result?.stdout;
  return JSON.parse(output ?? "[]");
}

export async function cleanInstallClaude({
  confirmation,
  home = homedir(),
  base = root,
  runCommand = execFileAsync,
  install = (options) => installClaudeLocal({ ...options, run: syncRunner })
} = {}) {
  if (confirmation !== CLAUDE_CLEAN_CONFIRMATION) {
    throw new Error(`Confirmation must equal: ${CLAUDE_CLEAN_CONFIRMATION}`);
  }
  const cacheRoot = join(home, ".claude", "plugins", "cache", marketplace);
  await validateCache(cacheRoot);
  const installed = json(await runCommand("claude", ["plugin", "list", "--json"]));
  const actions = [];
  for (const product of products) {
    const id = `${product}@${marketplace}`;
    if (!installed.some((entry) => entry.id === id)) continue;
    await runCommand("claude", ["plugin", "uninstall", id, "--scope", "user"]);
    actions.push(`uninstalled_plugin:${id}`);
  }
  const marketplaces = json(await runCommand(
    "claude", ["plugin", "marketplace", "list", "--json"]
  ));
  if (marketplaces.some((entry) => entry.name === marketplace)) {
    await runCommand("claude", [
      "plugin", "marketplace", "remove", marketplace, "--scope", "user"
    ]);
    actions.push(`removed_marketplace:${marketplace}`);
  }
  if (await pathExists(cacheRoot)) {
    await rm(cacheRoot, { recursive: true, force: true });
    actions.push(`removed_cache:${cacheRoot}`);
  }
  for (const product of products) {
    await install({ base, product });
    actions.push(`installed_plugin:${product}@${marketplace}`);
  }
  return {
    schema_version: "1",
    ok: true,
    actions,
    next_action: "Restart Claude, start a new task, then run npm run install:verify:claude-runtime."
  };
}

function syncRunner(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options?.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return result.stdout ?? "";
}

async function main() {
  const args = process.argv.slice(2);
  const confirmationIndex = args.indexOf("--confirmation");
  const homeIndex = args.indexOf("--home");
  const report = await cleanInstallClaude({
    confirmation: confirmationIndex >= 0 ? args[confirmationIndex + 1] : undefined,
    home: homeIndex >= 0 ? resolve(args[homeIndex + 1]) : homedir()
  });
  if (args.includes("--json")) process.stdout.write(stableJson(report));
  else for (const action of report.actions) console.log(action);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
