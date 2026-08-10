import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
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
import { promisify } from "node:util";
import { validateExtensionManifest } from "../source/platform/manage-customer-extension/scripts/manage-extension.mjs";
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
const execFileAsync = promisify(execFile);
const retiredBosBrokerPaths = new Set([
  "scripts/bos_mcp_broker.py",
  "tests/test_bos_mcp_broker.py",
  "tests/test_bos_mcp_broker_live.py"
]);

function isRetiredBosBrokerPath(path) {
  return retiredBosBrokerPaths.has(path) ||
    /^tests\/__pycache__\/test_bos_mcp_broker(?:_live)?\..+\.pyc$/.test(path);
}

async function isRetiredBosBrokerConfig(path) {
  try {
    const config = await readJson(path);
    const server = config?.mcpServers?.bos;
    return server?.command === "python3" &&
      Array.isArray(server.args) &&
      server.args.some((argument) =>
        typeof argument === "string" && argument.endsWith("bos_mcp_broker.py")
      );
  } catch {
    return false;
  }
}

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
    else if (arg === "--settings") options.settingsPath = resolve(rest[++index]);
    else if (arg === "--marketplace") {
      options.marketplace = resolve(rest[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

export function codexBosMcpRegistration(applicationName, mcpGroupName) {
  const stableName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!stableName.test(applicationName ?? "") ||
      !stableName.test(mcpGroupName ?? "")) {
    throw new Error("Application and MCP group names must be kebab-case strings");
  }
  const url = `https://dfsm.ai/mcp/apps/${applicationName}/${mcpGroupName}`;
  return {
    name: mcpGroupName,
    url,
    bearer_token_env_var: "BOS_API_KEY",
    args: [
      "mcp", "add", mcpGroupName, "--url", url,
      "--bearer-token-env-var", "BOS_API_KEY"
    ]
  };
}

export async function codexHostBearerState(runCommand = execFileAsync) {
  if (process.platform !== "darwin") {
    return {
      state: "verification_required",
      reason: "codex_host_inspection_unsupported"
    };
  }
  try {
    const processes = await runCommand("ps", ["-axo", "pid=,command="]);
    const line = String(processes?.stdout ?? processes ?? "")
      .split("\n")
      .find((candidate) =>
        candidate.includes("/Applications/ChatGPT.app/Contents/Resources/codex") &&
        candidate.includes("app-server")
      );
    if (!line) {
      return { state: "configuration_required", reason: "codex_host_not_running" };
    }
    const pid = Number(line.trim().split(/\s+/, 1)[0]);
    const environment = await runCommand("ps", ["eww", "-p", String(pid), "-o", "command="]);
    const command = String(environment?.stdout ?? environment ?? "");
    if (!/(?:^|\s)BOS_API_KEY=\S+/.test(command)) {
      return {
        state: "configuration_required",
        reason: "codex_host_bos_api_key_missing",
        pid
      };
    }
    return { state: "current", pid };
  } catch {
    return {
      state: "verification_required",
      reason: "codex_host_inspection_failed"
    };
  }
}

async function configureCodexBosMcp(options, paths) {
  const runtimePath = join(paths.target, ".mcp.json");
  if (!(await pathExists(runtimePath))) return { state: "not_applicable" };
  const runtime = await readJson(runtimePath);
  const runtimeServer = Object.values(runtime.mcpServers ?? {})[0];
  if (!runtimeServer) return { state: "not_applicable" };
  const metadata = await readJson(join(paths.target, ".bos-product.json"));
  const registration = codexBosMcpRegistration(
    metadata.application_name,
    metadata.mcp_group_name
  );
  if (runtimeServer.url !== registration.url) {
    throw new Error("Packaged MCP resource-group URL does not match product metadata");
  }
  const runCommand = options.runCommand ?? execFileAsync;
  await runCommand("codex", registration.args);
  const verification = await runCommand("codex", ["mcp", "get", registration.name]);
  const output = String(verification?.stdout ?? verification ?? "");
  if (!output.includes(`url: ${registration.url}`) ||
      !output.includes(`bearer_token_env_var: ${registration.bearer_token_env_var}`)) {
    throw new Error("Codex BOS MCP registration verification failed");
  }
  const host = await (options.inspectCodexHost ?? codexHostBearerState)();
  if (host.state !== "current") {
    return {
      ...host,
      url: registration.url,
      bearer_token_env_var: registration.bearer_token_env_var
    };
  }
  return {
    state: "current",
    name: registration.name,
    url: registration.url,
    bearer_token_env_var: registration.bearer_token_env_var,
    host_pid: host.pid
  };
}

export function validateCustomerSettings(settings) {
  const failures = [];
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return ["settings must be a JSON object"];
  }
  if (settings.schema_version !== "1") failures.push('schema_version must be "1"');
  const allowedTopLevel = new Set([
    "schema_version", "organization_display_name", "location_display_name",
    "timezone", "mailboxes", "billing"
  ]);
  for (const field of Object.keys(settings)) {
    if (!allowedTopLevel.has(field)) failures.push(`unknown settings field: ${field}`);
  }
  for (const field of ["organization_display_name", "location_display_name", "timezone"]) {
    if (typeof settings[field] !== "string" || !settings[field].trim()) {
      failures.push(`${field} must be a non-empty string`);
    }
  }
  if (typeof settings.timezone === "string" && settings.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone });
    } catch {
      failures.push("timezone must be a valid IANA timezone");
    }
  }
  const mailbox = settings.mailboxes?.care_com;
  if (settings.mailboxes !== undefined &&
      (!settings.mailboxes || typeof settings.mailboxes !== "object" || Array.isArray(settings.mailboxes))) {
    failures.push("mailboxes must be an object");
  } else {
    for (const field of Object.keys(settings.mailboxes ?? {})) {
      if (field !== "care_com") failures.push(`unknown mailboxes field: ${field}`);
    }
  }
  if (mailbox !== undefined && mailbox !== "" &&
      (typeof mailbox !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox))) {
    failures.push("mailboxes.care_com must be empty or a valid email address");
  }
  const rate = settings.billing?.bright_horizons_rate_per_child_day;
  const allowedBilling = new Set([
    "center_name", "address", "billing_contact_name", "phone_number",
    "invoice_reference_prefix", "bright_horizons_rate_per_child_day"
  ]);
  if (settings.billing !== undefined &&
      (!settings.billing || typeof settings.billing !== "object" || Array.isArray(settings.billing))) {
    failures.push("billing must be an object");
  } else {
    for (const field of Object.keys(settings.billing ?? {})) {
      if (!allowedBilling.has(field)) failures.push(`unknown billing field: ${field}`);
    }
  }
  if (rate !== undefined && rate !== null &&
      (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0)) {
    failures.push("billing.bright_horizons_rate_per_child_day must be null or a non-negative number");
  }
  return failures;
}

export function deriveInitialCustomerSettings(template, clientContext = {}) {
  const settings = structuredClone(template);
  const sources = {};
  const candidates = {
    organization_display_name: clientContext.organization_display_name,
    location_display_name: clientContext.location_display_name,
    timezone:
      clientContext.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      ""
  };
  for (const [field, value] of Object.entries(candidates)) {
    if (typeof value === "string" && value.trim()) {
      settings[field] = value.trim();
      sources[field] = field === "timezone" && !clientContext.timezone
        ? "client_system_timezone"
        : "client_context";
    }
  }
  if (typeof clientContext.care_com_mailbox === "string" && clientContext.care_com_mailbox.trim()) {
    settings.mailboxes.care_com = clientContext.care_com_mailbox.trim();
    sources["mailboxes.care_com"] = "client_connected_account_metadata";
  }
  settings._initialization = {
    status: "initializing",
    derived_sources: sources
  };
  return settings;
}

async function configuredSettings(options, paths) {
  const configPath = join(paths.target, "config", "customer-settings.json");
  if (!(await pathExists(configPath))) {
    const draftPath = join(paths.target, "config", "customer-settings.initialization.json");
    return {
      state: (await pathExists(draftPath)) ? "initializing" : "missing",
      path: configPath,
      draft_path: draftPath
    };
  }
  try {
    const settings = await readJson(configPath);
    const failures = validateCustomerSettings(settings);
    return { state: failures.length ? "invalid" : "current", path: configPath, failures };
  } catch {
    return { state: "invalid", path: configPath, failures: ["invalid JSON"] };
  }
}

async function applyCustomerSettings(options, paths) {
  let settings = options.settings;
  if (!settings && options.settingsPath) settings = await readJson(options.settingsPath);
  if (!settings) return;
  const failures = validateCustomerSettings(settings);
  if (failures.length) throw new Error(`Invalid customer settings: ${failures.join("; ")}`);
  const configPath = join(paths.target, "config", "customer-settings.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeJson(configPath, settings);
  await chmod(configPath, 0o600);
  await rm(join(paths.target, "config", "customer-settings.initialization.json"), {
    force: true
  });
}

async function initializeCustomerSettings(options, paths) {
  const configRoot = join(paths.target, "config");
  const configPath = join(configRoot, "customer-settings.json");
  const draftPath = join(configRoot, "customer-settings.initialization.json");
  const templatePath = join(configRoot, "customer-settings.template.json");
  if ((await pathExists(configPath)) || (await pathExists(draftPath)) ||
      !(await pathExists(templatePath))) return;
  const template = await readJson(templatePath);
  const draft = deriveInitialCustomerSettings(template, options.clientContext);
  await writeJson(draftPath, draft);
  await chmod(draftPath, 0o600);
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
      `Built product is missing: ${paths.desired}. Run npm run build:packages first.`
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
  const retiredBrokerPresent = Object.keys(currentFiles).some(
    isRetiredBosBrokerPath
  );

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
    else if (!hasState && path === ".mcp.json" && retiredBrokerPresent &&
      await isRetiredBosBrokerConfig(join(paths.target, path))) {
      update.push(path);
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
  if (retiredBrokerPresent) {
    for (const path of Object.keys(currentFiles).filter(isRetiredBosBrokerPath)) {
      if (!remove.includes(path)) remove.push(path);
    }
    preserve = preserve.filter((path) => !isRetiredBosBrokerPath(path));
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
        tested_version: extension.tested_version,
        schema_version: manifest.schema_version,
        tenant: manifest.tenant?.key
      };
      items.push(item);
      const baseMissing =
        manifest.ownership !== "customer" ||
        extension.product !== desiredManifest.name ||
        typeof extension.skill !== "string" ||
        !(await pathExists(join(skillsRoot, extension.skill, "SKILL.md")));
      const schemaFailures = manifest.schema_version === "2"
        ? validateExtensionManifest(manifest, {
            product: desiredManifest.name,
            baseSkill: extension.skill,
            tenant: manifest.tenant?.key
          })
        : manifest.schema_version === "1" ? [] : ["unsupported schema_version"];
      if (baseMissing || schemaFailures.length) {
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
  const settings = await configuredSettings(options, paths);
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
    settings,
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
  await initializeCustomerSettings(options, paths);
  await applyCustomerSettings(options, paths);
  const runtime = await configureCodexBosMcp(options, paths);
  const result = await inspectInstallation({ ...options, command: "verify" });
  result.runtime = runtime;
  return result;
}

export async function verifyInstallation(options = {}) {
  const report = await inspectInstallation({ ...options, command: "verify" });
  report.runtime = await configureCodexBosMcp(options, report.paths);
  report.ok =
    report.state === "managed-current" && report.marketplace === "current" &&
    ["current", "not_applicable"].includes(report.runtime.state);
  return report;
}

function printReport(report, asJson) {
  if (asJson) process.stdout.write(stableJson(report));
  else {
    console.log(
      `${report.product}: ${report.state}; marketplace=${report.marketplace}; settings=${report.settings.state}`
    );
    if (report.settings.state === "initializing") {
      console.log(
        "Continue with icode-customer-initialization: derive safe client values and ask the user once for unresolved settings."
      );
    }
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
