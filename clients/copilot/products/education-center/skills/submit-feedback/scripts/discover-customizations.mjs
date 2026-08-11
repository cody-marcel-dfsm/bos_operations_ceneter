#!/usr/bin/env node

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function argumentsFor(argv) {
  const result = { extensionRoots: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${flag}`);
    if (flag === "--product-root") result.productRoot = value;
    else if (flag === "--base-skill") result.baseSkill = value;
    else if (flag === "--tenant") result.tenant = value;
    else if (flag === "--extension-root") result.extensionRoots.push(value);
    else throw new Error(`unknown argument: ${flag}`);
    index += 1;
  }
  if (!result.productRoot) throw new Error("--product-root is required");
  if (!result.baseSkill) throw new Error("--base-skill is required");
  if (!NAME_PATTERN.test(result.baseSkill)) throw new Error("--base-skill must use lowercase kebab-case");
  if (!result.tenant) throw new Error("--tenant is required");
  if (!NAME_PATTERN.test(result.tenant)) throw new Error("--tenant must use lowercase kebab-case");
  return result;
}

async function directories(root) {
  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return [];
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => join(root, entry.name));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function validateManifest(manifest) {
  if (manifest?.schema_version !== "2" || manifest?.ownership !== "customer") return false;
  if (typeof manifest?.extends?.product !== "string") return false;
  if (typeof manifest?.extends?.skill !== "string") return false;
  if (!manifest.overrides || typeof manifest.overrides !== "object") return false;
  return true;
}

async function main() {
  const args = argumentsFor(process.argv.slice(2));
  const productRoot = await realpath(resolve(args.productRoot));
  const metadata = JSON.parse(await readFile(join(productRoot, ".bos-product.json"), "utf8"));
  const roots = [
    join(homedir(), ".agents", "skills"),
    join(homedir(), ".claude", "skills"),
    join(productRoot, "skills"),
    ...args.extensionRoots.map((root) => resolve(root))
  ];
  const uniqueRoots = [...new Set(roots)];
  const matches = [];
  for (const root of uniqueRoots) {
    for (const directory of await directories(root)) {
      try {
        const manifest = JSON.parse(await readFile(join(directory, ".bos-extension.json"), "utf8"));
        if (!validateManifest(manifest)) continue;
        if (manifest.extends.product !== metadata.name || manifest.extends.skill !== args.baseSkill) continue;
        if (manifest.tenant?.key !== args.tenant) continue;
        const overrides = {};
        for (const category of ["terminology", "defaults", "policies", "exceptions"]) {
          const values = manifest.overrides[category];
          if (values && typeof values === "object" && !Array.isArray(values)) overrides[category] = values;
          else overrides[category] = {};
        }
        matches.push({
          base_skill: manifest.extends.skill,
          tested_version: manifest.extends.tested_version,
          overrides,
          legacy_instructions_present: Boolean(manifest.legacy_instructions)
        });
      } catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      }
    }
  }
  process.stdout.write(`${JSON.stringify({ product: metadata.name, base_skill: args.baseSkill, customizations: matches }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
