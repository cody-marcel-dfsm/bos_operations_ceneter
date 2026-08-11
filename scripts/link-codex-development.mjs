import {
  lstat,
  mkdir,
  readlink,
  readdir,
  rename,
  symlink
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  listProducts,
  pathExists,
  resolveProductSkills,
  safeInside,
  stableJson
} from "./lib/package-model.mjs";

function parseArgs(argv) {
  const options = {
    cacheRoot: join(homedir(), ".codex", "plugins", "cache", "bos-education-center"),
    backupRoot: join(
      homedir(),
      ".agents",
      "bos-backups",
      "developer-links"
    ),
    products: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--cache-root") {
      options.cacheRoot = resolve(argv[++index]);
    } else if (argument === "--backup-root") {
      options.backupRoot = resolve(argv[++index]);
    } else if (argument === "--product") {
      options.products.push(argv[++index]);
    } else if (argument === "--version") {
      options.version = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function latestInstalledVersion(cacheRoot, product) {
  const productRoot = join(cacheRoot, product);
  if (!(await pathExists(productRoot))) {
    throw new Error(`Codex cache product is missing: ${productRoot}`);
  }
  const versions = (await readdir(productRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true })
    );
  if (!versions.length) {
    throw new Error(`Codex cache has no installed versions for ${product}`);
  }
  return versions.at(-1);
}

async function linkOne({ target, source, backup }) {
  if (!safeInside(dirname(target), target)) {
    throw new Error(`Unsafe Codex development-link target: ${target}`);
  }
  if (await pathExists(target)) {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink()) {
      const current = resolve(dirname(target), await readlink(target));
      if (current === source) return "current";
    }
    await mkdir(dirname(backup), { recursive: true });
    await rename(target, backup);
  }
  try {
    await symlink(source, target, "dir");
  } catch (error) {
    if (await pathExists(backup)) await rename(backup, target);
    throw error;
  }
  return "linked";
}

export async function linkCodexDevelopment(rawOptions = {}) {
  const options = {
    cacheRoot: join(homedir(), ".codex", "plugins", "cache", "bos-education-center"),
    backupRoot: join(
      homedir(),
      ".agents",
      "bos-backups",
      "developer-links"
    ),
    products: [],
    ...rawOptions
  };
  const declared = await listProducts();
  const selected = options.products.length
    ? declared.filter(({ manifest }) =>
        options.products.includes(manifest.name)
      )
    : declared;
  if (selected.length !== (options.products.length || declared.length)) {
    throw new Error("One or more requested products are not declared");
  }

  const runId = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const results = [];
  for (const { manifest } of selected) {
    const version =
      options.version ??
      (await latestInstalledVersion(options.cacheRoot, manifest.name));
    const skillsRoot = join(
      options.cacheRoot,
      manifest.name,
      version,
      "skills"
    );
    if (!(await pathExists(skillsRoot))) {
      throw new Error(`Codex skill cache is missing: ${skillsRoot}`);
    }
    for (const skill of await resolveProductSkills(manifest)) {
      const target = join(skillsRoot, skill.name);
      const backup = join(
        options.backupRoot,
        runId,
        manifest.name,
        version,
        "skills",
        skill.name
      );
      const state = await linkOne({
        target,
        source: skill.sourcePath,
        backup
      });
      results.push({
        product: manifest.name,
        version,
        skill: skill.name,
        state,
        target,
        source: skill.sourcePath,
        backup: state === "linked" ? backup : null
      });
    }
  }
  return {
    schema_version: "1",
    mode: "machine-local-codex-development",
    results
  };
}

async function main() {
  const result = await linkCodexDevelopment(parseArgs(process.argv.slice(2)));
  process.stdout.write(stableJson(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
