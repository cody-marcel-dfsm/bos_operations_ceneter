import { randomUUID } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hashFile,
  hashTree,
  marketplaceEntry,
  pathExists,
  readJson,
  root,
  safeInside,
  stableJson,
  writeJson
} from "./lib/package-model.mjs";

const stateFileName = ".bos-package-state.json";

function parseArgs(argv) {
  const [command = "inspect", ...rest] = argv;
  const options = {
    command,
    client: "codex",
    product: "bos",
    home: homedir(),
    json: false
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--client") options.client = rest[++index];
    else if (arg === "--product") options.product = rest[++index];
    else if (arg === "--home") options.home = resolve(rest[++index]);
    else if (arg === "--target") options.target = resolve(rest[++index]);
    else if (arg === "--marketplace") {
      options.marketplace = resolve(rest[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function pathsFor(options) {
  if (options.client !== "codex") {
    throw new Error("Installer currently supports --client codex");
  }
  const desired = join(
    root,
    "clients",
    "codex",
    "plugins",
    options.product
  );
  const target =
    options.target ?? join(options.home, "plugins", options.product);
  const marketplace =
    options.marketplace ??
    join(options.home, ".agents", "plugins", "marketplace.json");
  const pluginRoot = join(options.home, "plugins");
  if (!safeInside(pluginRoot, target)) {
    throw new Error(`Target must remain inside ${pluginRoot}`);
  }
  return { desired, target, marketplace };
}

async function desiredState(options, paths) {
  if (!(await pathExists(paths.desired))) {
    throw new Error(
      `Built product is missing: ${paths.desired}. Run npm run build first.`
    );
  }
  const manifest = await readJson(
    join(paths.desired, ".codex-plugin", "plugin.json")
  );
  if (manifest.name !== options.product) {
    throw new Error("Built plugin manifest does not match requested product");
  }
  const hashes = await hashTree(paths.desired, new Set([stateFileName]));
  return { manifest, hashes };
}

async function marketplaceStatus(options, paths, desiredManifest) {
  if (!(await pathExists(paths.marketplace))) {
    return { state: "missing", entry: null };
  }
  const marketplace = await readJson(paths.marketplace);
  if (!Array.isArray(marketplace.plugins)) {
    return { state: "invalid", entry: null };
  }
  const entries = marketplace.plugins.filter(
    (entry) => entry.name === options.product
  );
  if (entries.length > 1) return { state: "conflict", entry: null };
  if (entries.length === 0) return { state: "missing", entry: null };
  const expectedPath = `./plugins/${desiredManifest.name}`;
  if (
    entries[0].source?.source !== "local" ||
    entries[0].source?.path !== expectedPath
  ) {
    return { state: "conflict", entry: entries[0] };
  }
  return { state: "current", entry: entries[0] };
}

async function inspectTarget(paths, desired) {
  if (!(await pathExists(paths.target))) {
    return {
      state: "missing",
      create: Object.keys(desired.hashes),
      update: [],
      replace: [],
      remove: [],
      preserve: [],
      conflicts: []
    };
  }

  const statePath = join(paths.target, stateFileName);
  const hasState = await pathExists(statePath);
  const currentFiles = await hashTree(paths.target, new Set([stateFileName]));
  const create = [];
  const update = [];
  const replace = [];
  const conflicts = [];
  let preserve = Object.keys(currentFiles).filter(
    (path) => !(path in desired.hashes)
  );
  const remove = [];

  let previousState = null;
  if (hasState) {
    try {
      previousState = await readJson(statePath);
    } catch {
      return {
        state: "invalid",
        create,
        update,
        replace,
        remove,
        preserve,
        conflicts: [stateFileName]
      };
    }
    if (
      previousState.schema_version !== "1" ||
      !previousState.managed_hashes ||
      !Array.isArray(previousState.managed_paths)
    ) {
      return {
        state: "invalid",
        create,
        update,
        replace,
        remove,
        preserve,
        conflicts: [stateFileName]
      };
    }
  }

  for (const [path, desiredHash] of Object.entries(desired.hashes)) {
    const currentHash = currentFiles[path];
    if (!currentHash) {
      create.push(path);
      continue;
    }
    if (currentHash === desiredHash) continue;
    const priorHash = previousState?.managed_hashes?.[path];
    if (priorHash && priorHash === currentHash) update.push(path);
    else if (hasState && previousState.managed_paths.includes(path)) {
      replace.push(path);
    }
    else if (!hasState && path === ".codex-plugin/plugin.json") {
      try {
        const currentManifest = await readJson(
          join(paths.target, ".codex-plugin", "plugin.json")
        );
        if (currentManifest.name === desired.manifest.name) update.push(path);
        else conflicts.push(path);
      } catch {
        conflicts.push(path);
      }
    }
    else conflicts.push(path);
  }

  if (previousState) {
    for (const path of previousState.managed_paths) {
      if (path in desired.hashes || !(path in currentFiles)) continue;
      remove.push(path);
    }
    preserve = preserve.filter((path) => !remove.includes(path));
  }

  if (conflicts.length) {
    return {
      state: "conflict",
      create,
      update,
      replace,
      remove,
      preserve,
      conflicts
    };
  }
  if (!hasState) {
    return {
      state:
        create.length || update.length ? "partial" : "compatible-unmanaged",
      create,
      update,
      replace,
      remove,
      preserve,
      conflicts
    };
  }
  if (create.length) {
    return {
      state: "partial",
      create,
      update,
      replace,
      remove,
      preserve,
      conflicts
    };
  }
  if (replace.length) {
    return {
      state: "managed-modified",
      create,
      update,
      replace,
      remove,
      preserve,
      conflicts
    };
  }
  if (update.length || remove.length) {
    return {
      state: "managed-stale",
      create,
      update,
      replace,
      remove,
      preserve,
      conflicts
    };
  }
  return {
    state: "managed-current",
    create,
    update,
    replace,
    remove,
    preserve,
    conflicts
  };
}

async function inspectCustomerExtensions(paths, desiredManifest) {
  const skillsRoot = join(paths.target, "skills");
  if (!(await pathExists(skillsRoot))) return { items: [], warnings: [] };
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const items = [];
  const warnings = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const manifestPath = join(skillsRoot, entry.name, ".bos-extension.json");
    if (!(await pathExists(manifestPath))) continue;
    try {
      const manifest = await readJson(manifestPath);
      const extension = manifest.extends ?? {};
      const item = {
        name: entry.name,
        product: extension.product,
        skill: extension.skill,
        tested_version: extension.tested_version
      };
      items.push(item);
      if (
        manifest.schema_version !== "1" ||
        manifest.ownership !== "customer" ||
        extension.product !== desiredManifest.name ||
        typeof extension.skill !== "string" ||
        !(await pathExists(join(skillsRoot, extension.skill, "SKILL.md")))
      ) {
        warnings.push(`${entry.name}: invalid or missing base skill reference`);
      } else if (extension.tested_version !== desiredManifest.version) {
        warnings.push(
          `${entry.name}: tested with ${extension.tested_version}; installing ${desiredManifest.version}`
        );
      }
    } catch {
      warnings.push(`${entry.name}: invalid .bos-extension.json`);
    }
  }
  return {
    items: items.sort((left, right) => left.name.localeCompare(right.name)),
    warnings: warnings.sort()
  };
}

export async function inspectInstallation(rawOptions = {}) {
  const options = {
    client: "codex",
    product: "bos",
    home: homedir(),
    ...rawOptions
  };
  const paths = pathsFor(options);
  const desired = await desiredState(options, paths);
  const target = await inspectTarget(paths, desired);
  const extensions = await inspectCustomerExtensions(paths, desired.manifest);
  const marketplace = await marketplaceStatus(
    options,
    paths,
    desired.manifest
  );
  if (["conflict", "invalid"].includes(marketplace.state)) {
    target.state = marketplace.state;
    target.conflicts.push(relative(options.home, paths.marketplace));
  }
  return {
    schema_version: "1",
    command: rawOptions.command ?? "inspect",
    product: options.product,
    client: options.client,
    desired_version: desired.manifest.version,
    paths,
    state: target.state,
    marketplace: marketplace.state,
    extensions: extensions.items,
    warnings: extensions.warnings,
    actions: {
      create: target.create,
      update: target.update,
      replace: target.replace,
      remove: target.remove,
      preserve: target.preserve,
      conflicts: target.conflicts
    }
  };
}

async function mergeMarketplace(options, paths, desiredManifest) {
  let marketplace;
  if (await pathExists(paths.marketplace)) {
    marketplace = await readJson(paths.marketplace);
  } else {
    marketplace = {
      name: "bos-icode",
      interface: { displayName: "BOS + iCode" },
      plugins: []
    };
  }
  const entry = marketplaceEntry({
    name: options.product,
    authentication: "ON_USE",
    category: desiredManifest.interface?.category ?? "Productivity"
  });
  const index = marketplace.plugins.findIndex(
    (candidate) => candidate.name === options.product
  );
  if (index === -1) marketplace.plugins.push(entry);
  else {
    entry.policy.authentication =
      marketplace.plugins[index].policy?.authentication ?? "ON_USE";
    marketplace.plugins[index] = entry;
  }
  await mkdir(dirname(paths.marketplace), { recursive: true });
  const temporary = `${paths.marketplace}.tmp-${process.pid}`;
  await writeFile(temporary, stableJson(marketplace));
  await rename(temporary, paths.marketplace);
}

export async function applyInstallation(rawOptions = {}) {
  const options = {
    client: "codex",
    product: "bos",
    home: homedir(),
    ...rawOptions
  };
  const report = await inspectInstallation({ ...options, command: "apply" });
  if (["conflict", "invalid"].includes(report.state)) {
    const error = new Error(`Installation state is ${report.state}`);
    error.report = report;
    throw error;
  }

  const paths = report.paths;
  const desired = await desiredState(options, paths);
  if (report.state !== "managed-current" || report.marketplace !== "current") {
    const stagingRoot = join(
      options.home,
      ".agents",
      "tmp",
      `bos-install-${randomUUID()}`
    );
    const stagedPlugin = join(stagingRoot, options.product);
    await mkdir(stagingRoot, { recursive: true });
    if (await pathExists(paths.target)) {
      await cp(paths.target, stagedPlugin, { recursive: true });
    } else {
      await mkdir(stagedPlugin, { recursive: true });
    }
    await cp(paths.desired, stagedPlugin, { recursive: true, force: true });
    for (const managedPath of report.actions.remove) {
      const removal = join(stagedPlugin, managedPath);
      if (!safeInside(stagedPlugin, removal)) {
        throw new Error(`Unsafe managed removal: ${managedPath}`);
      }
      await rm(removal, { recursive: true, force: true });
    }
    const managedHashes = await hashTree(
      paths.desired,
      new Set([stateFileName])
    );
    for (const managedPath of Object.keys(managedHashes)) {
      await chmod(join(stagedPlugin, managedPath), 0o444);
    }
    await writeJson(join(stagedPlugin, stateFileName), {
      schema_version: "1",
      package: "bos-operations-center",
      product: options.product,
      client: options.client,
      installed_version: desired.manifest.version,
      installed_at: new Date().toISOString(),
      managed_paths: Object.keys(managedHashes),
      managed_hashes: managedHashes
    });

    const backupRoot = join(
      options.home,
      ".agents",
      "bos-backups",
      `${options.product}-${Date.now()}`
    );
    await mkdir(dirname(paths.target), { recursive: true });
    if (await pathExists(paths.target)) {
      await mkdir(dirname(backupRoot), { recursive: true });
      await rename(paths.target, backupRoot);
    }
    try {
      await rename(stagedPlugin, paths.target);
    } catch (error) {
      if (await pathExists(backupRoot)) await rename(backupRoot, paths.target);
      throw error;
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }
    await mergeMarketplace(options, paths, desired.manifest);
  }
  return inspectInstallation({ ...options, command: "verify" });
}

export async function verifyInstallation(options = {}) {
  const report = await inspectInstallation({ ...options, command: "verify" });
  report.ok =
    report.state === "managed-current" && report.marketplace === "current";
  return report;
}

function printReport(report, asJson) {
  if (asJson) process.stdout.write(stableJson(report));
  else {
    console.log(
      `${report.product}: ${report.state}; marketplace=${report.marketplace}`
    );
    for (const [key, values] of Object.entries(report.actions)) {
      if (values.length) console.log(`${key}: ${values.join(", ")}`);
    }
    for (const warning of report.warnings) console.log(`warning: ${warning}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let report;
  if (["inspect", "plan"].includes(options.command)) {
    report = await inspectInstallation(options);
  } else if (options.command === "apply") {
    report = await applyInstallation(options);
  } else if (options.command === "verify") {
    report = await verifyInstallation(options);
    if (!report.ok) process.exitCode = 1;
  } else {
    throw new Error(`Unknown command: ${options.command}`);
  }
  printReport(report, options.json);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (error.report) printReport(error.report, true);
    console.error(error.message);
    process.exitCode = 1;
  });
}
