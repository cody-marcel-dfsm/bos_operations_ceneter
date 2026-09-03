#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { pathExists, readJson, stableJson } from "./lib/package-model.mjs";

const execFileAsync = promisify(execFile);
export const CODEX_CLEAN_CONFIRMATION = "DELETE ALL BOS CODEX PLUGIN STATE";
const marketplace = "bos-education-center";
const products = ["education-center", "bos"];

function parseArgs(argv) {
  const options = { home: homedir(), json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--home") options.home = resolve(argv[++index]);
    else if (argv[index] === "--confirmation") options.confirmation = argv[++index];
    else if (argv[index] === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

async function validatePackageCache(path) {
  if (!(await pathExists(path))) return;
  for (const product of products) {
    const productRoot = join(path, product);
    if (!(await pathExists(productRoot))) continue;
    for (const version of await readdir(productRoot, { withFileTypes: true })) {
      if (!version.isDirectory()) continue;
      const metadata = await readJson(join(productRoot, version.name, ".bos-product.json"));
      if (metadata.name !== product || metadata.client !== "codex") {
        throw new Error(`Refusing to remove mismatched plugin cache: ${productRoot}`);
      }
    }
  }
}

export async function planCodexCleanup({ home = homedir() } = {}) {
  const packageCache = join(resolve(home), ".codex", "plugins", "cache", marketplace);
  await validatePackageCache(packageCache);
  return { schema_version: "1", package_cache: await pathExists(packageCache) ? packageCache : null };
}

async function commandJson(runCommand, args) {
  const result = await runCommand("codex", args);
  const output = typeof result === "string" ? result : result?.stdout;
  return output ? JSON.parse(output) : null;
}

export async function cleanInstallCodex(rawOptions = {}) {
  const options = { home: homedir(), runCommand: execFileAsync, ...rawOptions };
  if (options.confirmation !== CODEX_CLEAN_CONFIRMATION) {
    throw new Error(`Confirmation must equal: ${CODEX_CLEAN_CONFIRMATION}`);
  }
  const plan = await planCodexCleanup(options);
  const actions = [];
  const listing = await commandJson(options.runCommand, ["plugin", "list", "--json"]);
  const installed = new Set((listing?.installed ?? []).map(({ pluginId }) => pluginId));
  for (const product of products) {
    const selector = `${product}@${marketplace}`;
    if (!installed.has(selector)) continue;
    await commandJson(options.runCommand, ["plugin", "remove", selector, "--json"]);
    actions.push(`removed_plugin:${selector}`);
  }
  if (plan.package_cache) {
    await rm(plan.package_cache, { recursive: true, force: true });
    actions.push(`removed_cache:${plan.package_cache}`);
  }
  return {
    schema_version: "1",
    ok: true,
    actions,
    next_action: "Reinstall BOS from the existing local marketplace, then start a new task."
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await cleanInstallCodex(options);
  if (options.json) process.stdout.write(stableJson(report));
  else console.log(report.next_action);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
