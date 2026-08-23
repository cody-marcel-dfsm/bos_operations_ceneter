#!/usr/bin/env node

import {
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
  symlink
} from "node:fs/promises";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = realpathSync(fileURLToPath(import.meta.url));
export const repositoryRoot = dirname(dirname(scriptPath));
const productNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseArgs(argv) {
  const options = {};
  for (const argument of argv) {
    if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function entryExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function discoverExtensions(base) {
  const extensionsRoot = join(base, "clients", "gemini", "extensions");
  let entries;
  try {
    entries = await readdir(extensionsRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Generated Gemini extensions are missing: ${extensionsRoot}`);
    }
    throw error;
  }

  const extensions = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const source = join(extensionsRoot, entry.name);
    let metadata;
    let plugin;
    try {
      metadata = JSON.parse(await readFile(join(source, ".bos-product.json"), "utf8"));
      plugin = JSON.parse(await readFile(join(source, "plugin.json"), "utf8"));
    } catch (error) {
      throw new Error(`Invalid generated Gemini product at ${source}: ${error.message}`);
    }
    if (
      metadata.client !== "gemini" ||
      metadata.name !== entry.name ||
      plugin.name !== entry.name
    ) {
      throw new Error(`Generated Gemini product identity does not match ${source}`);
    }
    extensions.push({ name: entry.name, source: await realpath(source) });
  }
  if (!extensions.length) {
    throw new Error(`No generated Gemini extensions found in ${extensionsRoot}`);
  }
  return extensions;
}

async function disabledProductNames(base) {
  const path = join(base, "clients", "disabled-products.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  const names = (manifest.products ?? []).map((product) => product.name);
  if (names.some((name) => !productNamePattern.test(name))) {
    throw new Error(`Invalid disabled Gemini product identity in ${path}`);
  }
  return names;
}

async function linkExtension({ name, source, pluginsRoot }) {
  const target = join(pluginsRoot, name);
  let state = "linked";

  if (await entryExists(target)) {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink()) {
      const current = resolve(dirname(target), await readlink(target));
      if (await entryExists(current) && await realpath(current) === source) {
        state = "current";
      }
    }
    if (state !== "current") await rm(target, { recursive: true, force: true });
  }

  if (state === "linked") await symlink(source, target, "dir");

  const linkedSource = await realpath(target);
  const plugin = JSON.parse(await readFile(join(target, "plugin.json"), "utf8"));
  if (linkedSource !== source || plugin.name !== name) {
    throw new Error(`Antigravity plugin link verification failed: ${target}`);
  }
  return { name, state, source, target, verified: true };
}

export async function installAntigravity(rawOptions = {}) {
  const base = rawOptions.base ? await realpath(rawOptions.base) : repositoryRoot;
  const pluginsRoot = resolve(
    rawOptions.pluginsRoot ?? join(homedir(), ".gemini", "config", "plugins")
  );
  const extensions = await discoverExtensions(base);
  await mkdir(pluginsRoot, { recursive: true });

  const activeNames = new Set(extensions.map(({ name }) => name));
  const removed = [];
  for (const name of await disabledProductNames(base)) {
    if (activeNames.has(name)) continue;
    const target = join(pluginsRoot, name);
    if (!(await entryExists(target))) continue;
    await rm(target, { recursive: true, force: true });
    removed.push({ name, target });
  }

  const results = [];
  for (const extension of extensions) {
    results.push(await linkExtension({
      ...extension,
      pluginsRoot
    }));
  }
  return { repositoryRoot: base, pluginsRoot, removed, results };
}

function printResult(result) {
  console.log("Clean Antigravity install completed; conflicting prior BOS entries were deleted.");
  console.log(`Antigravity plugins now use ${result.repositoryRoot}`);
  for (const item of result.removed) {
    console.log(`Removed disabled product: ${item.target}`);
  }
  for (const item of result.results) {
    const label = item.state === "current" ? "Already linked" : "Linked";
    console.log(`${label}: ${item.target} -> ${item.source}`);
    console.log(`Verified plugin manifest through symlink: ${item.name}`);
  }
  console.log("Restart Antigravity to load the current repository source.");
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === scriptPath;
  } catch {
    return false;
  }
}

if (isMain()) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: install-antigravity.mjs");
    console.log("Clean install: existing BOS product entries are deleted without backups.");
  } else {
    installAntigravity(options).then(printResult).catch((error) => {
      console.error(`Antigravity installation failed: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
