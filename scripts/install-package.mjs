import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { validateExtensionManifest } from "../source/platform/manage-customer-extension/scripts/manage-extension.mjs";
import {
  codexMarketplaceManifest,
  codexProductRoot,
  legacyCodexProductRoot,
  marketplaceRootFromManifest
} from "./lib/codex-layout.mjs";
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
const codexMarketplaceIdentity = Object.freeze({
  name: "bos-education-center",
  displayName: "BOS + Education Center"
});
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

async function isLegacyCodexOAuthConfig(path, expectedName, expectedUrl) {
  try {
    const config = await readJson(path);
    const entries = Object.entries(config?.mcpServers ?? {});
    if (entries.length !== 1) return false;
    const [name, server] = entries[0];
    return name === expectedName &&
      server?.type === "http" &&
      server.url === expectedUrl &&
      !("headers" in server) &&
      !("bearer_token_env_var" in server);
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

export function codexBosMcpRegistration(
  applicationName,
  mcpGroupName,
  credentialEnvVar
) {
  const stableName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!stableName.test(applicationName ?? "") ||
      !stableName.test(mcpGroupName ?? "")) {
    throw new Error("Application and MCP group names must be kebab-case strings");
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(credentialEnvVar ?? "")) {
    throw new Error("Credential environment binding must be an uppercase identifier");
  }
  const url = `https://dfsm.ai/mcp/apps/${applicationName}/${mcpGroupName}`;
  return {
    name: mcpGroupName,
    url,
    bearer_token_env_var: credentialEnvVar,
    args: [
      "mcp", "add", mcpGroupName, "--url", url,
      "--bearer-token-env-var", credentialEnvVar
    ]
  };
}

function sameSecret(left, right) {
  const digest = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(left), digest(right));
}

function parseMcpPayload(text) {
  const candidates = String(text ?? "")
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());
  for (const candidate of candidates.length ? candidates : [String(text ?? "").trim()]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue until a complete JSON or SSE data payload is found.
    }
  }
  return undefined;
}

const namedMcpRequiredTools = new Map([
  ["leaddirector/education-center", [
    "bos_get_context",
    "education_center_get_email_thread",
    "education_center_list_enrollments",
    "education_center_search_calendar_events",
    "education_center_search_email_evidence",
    "education_center_search_leads",
    "education_center_search_students"
  ]],
  ["leaddirector/video-ads", [
    "bos_get_context",
    "video_ads_get_readiness",
    "video_ads_list_options",
    "video_ads_start_generation",
    "video_ads_get_generation",
    "video_ads_list_generations",
    "video_ads_retry_transfer"
  ]]
]);

const namedMcpApplicationCodes = new Map([
  ["leaddirector", "lead_director"]
]);

function requiredNamedMcpTools(applicationName, mcpGroupName) {
  return namedMcpRequiredTools.get(`${applicationName}/${mcpGroupName}`);
}

export async function verifyNamedMcpBearer({
  apiKey,
  endpoint,
  applicationName,
  mcpGroupName,
  fetchImpl = fetch
}) {
  if (!apiKey) {
    return { state: "configuration_required", reason: "bos_api_key_missing" };
  }
  let sessionId;
  const post = async (body) => {
    const headers = {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-03-26"
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      redirect: "error"
    });
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    return {
      status: response.status,
      payload: parseMcpPayload(await response.text())
    };
  };
  try {
    const initialize = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "bos-install-verifier", version: "1" }
      }
    });
    if (initialize.status !== 200 || initialize.payload?.error ||
        initialize.payload?.result?.protocolVersion !== "2025-03-26") {
      return {
        state: "configuration_required",
        reason: "named_mcp_initialize_rejected"
      };
    }
    const initialized = await post({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    });
    if (initialized.status < 200 || initialized.status >= 300 ||
        initialized.payload?.error) {
      return {
        state: "configuration_required",
        reason: "named_mcp_initialization_failed"
      };
    }
    const listed = await post({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    });
    const names = listed.payload?.result?.tools
      ?.map((tool) => tool?.name)
      .filter(Boolean) ?? [];
    const requiredTools = requiredNamedMcpTools(applicationName, mcpGroupName);
    if (!requiredTools) {
      return {
        state: "configuration_required",
        reason: "named_mcp_tool_contract_missing"
      };
    }
    const missingTools = requiredTools.filter((name) => !names.includes(name));
    if (listed.status !== 200 || listed.payload?.error || missingTools.length) {
      return {
        state: "configuration_required",
        reason: "named_mcp_resource_group_unavailable"
      };
    }
    const contextCall = await post({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "bos_get_context", arguments: {} }
    });
    const result = contextCall.payload?.result;
    const context = result?.structuredContent?.result;
    const apps = Array.isArray(context?.apps) ? context.apps : [];
    const roles = new Set(
      apps.map((app) => app?.delegated_role_id).filter(Boolean)
    );
    const expectedApplicationCode = namedMcpApplicationCodes.get(applicationName);
    if (contextCall.status !== 200 || contextCall.payload?.error ||
        result?.isError !== false || !context?.installation_id ||
        !context?.org_id || apps.length !== 1 || roles.size !== 1 ||
        apps[0]?.app_code !== expectedApplicationCode) {
      return {
        state: "configuration_required",
        reason: "named_mcp_context_invalid"
      };
    }
    return { state: "current", tool_count: names.length };
  } catch {
    return {
      state: "verification_required",
      reason: "named_mcp_live_check_failed"
    };
  }
}

export async function codexHostBearerState(
  runCommand = execFileAsync,
  { credentialEnvVar, expectedApiKey, verifyBearer } = {}
) {
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
    if (!/^[A-Z][A-Z0-9_]*$/.test(credentialEnvVar ?? "")) {
      return {
        state: "configuration_required",
        reason: "codex_host_credential_binding_invalid",
        pid
      };
    }
    const match = command.match(
      new RegExp(`(?:^|\\s)${credentialEnvVar}=(\\S+)`)
    );
    if (!match) {
      return {
        state: "configuration_required",
        reason: "codex_host_product_api_key_missing",
        pid
      };
    }
    const activeApiKey = match[1];
    if (expectedApiKey && !sameSecret(activeApiKey, expectedApiKey)) {
      return {
        state: "configuration_required",
        reason: "codex_host_product_api_key_mismatch",
        pid
      };
    }
    if (verifyBearer) {
      const live = await verifyBearer(activeApiKey);
      if (live.state !== "current") return { ...live, pid };
      return { state: "current", pid, tool_count: live.tool_count };
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
  const metadata = await readJson(join(paths.target, ".bos-product.json"));
  if (metadata.authentication === "oauth_2_1") {
    const appPath = join(paths.target, ".app.json");
    const runtimePath = join(paths.target, ".mcp.json");
    if (!(await pathExists(appPath)) || await pathExists(runtimePath)) {
      throw new Error("Packaged Codex app binding is invalid");
    }
    const appManifest = await readJson(appPath);
    const appEntries = Object.entries(appManifest.apps ?? {});
    const [appName, app] = appEntries[0] ?? [];
    const expectedUrl =
      `https://dfsm.ai/mcp/apps/${metadata.application_name}/${metadata.mcp_group_name}`;
    if (appEntries.length !== 1 || appName !== metadata.name ||
        app?.id !== metadata.codex_app_id || app?.required !== true ||
        !/^asdk_app_[a-z0-9]+$/.test(app?.id ?? "") ||
        "credential_env_var" in metadata) {
      throw new Error("Packaged Codex app binding is invalid");
    }
    return {
      state: "host_managed",
      name: metadata.mcp_group_name,
      url: expectedUrl,
      app_id: app.id,
      authentication: "oauth_2_1",
      next_action: "connect"
    };
  }
  const runtimePath = join(paths.target, ".mcp.json");
  if (!(await pathExists(runtimePath))) return { state: "not_applicable" };
  const runtime = await readJson(runtimePath);
  const runtimeServer = Object.values(runtime.mcpServers ?? {})[0];
  if (!runtimeServer) return { state: "not_applicable" };
  const registration = codexBosMcpRegistration(
    metadata.application_name,
    metadata.mcp_group_name,
    metadata.credential_env_var
  );
  if (runtimeServer.url !== registration.url) {
    throw new Error("Packaged MCP resource-group URL does not match product metadata");
  }
  const runCommand = options.runCommand ?? execFileAsync;
  const environment = options.environment ?? process.env;
  const verifyBearer = (apiKey) => (
    options.verifyNamedMcpBearer ?? verifyNamedMcpBearer
  )({
    apiKey,
    endpoint: registration.url,
    applicationName: metadata.application_name,
    mcpGroupName: metadata.mcp_group_name,
    fetchImpl: options.fetchImpl
  });
  const host = await (options.inspectCodexHost
    ? options.inspectCodexHost({
        credentialEnvVar: metadata.credential_env_var,
        expectedApiKey: environment[metadata.credential_env_var],
        verifyBearer
      })
    : codexHostBearerState(runCommand, {
        credentialEnvVar: metadata.credential_env_var,
        expectedApiKey: environment[metadata.credential_env_var],
        verifyBearer
      }));
  let credentialState = host;
  if (host.state === "verification_required" &&
      host.reason === "codex_host_inspection_unsupported") {
    const apiKey = environment[metadata.credential_env_var];
    if (!apiKey) {
      credentialState = {
        state: "configuration_required",
        reason: "codex_customer_environment_product_api_key_missing"
      };
    } else {
      const live = await verifyBearer(apiKey);
      credentialState = live.state === "current"
        ? {
            state: "current",
            credential_source: "customer_environment",
            tool_count: live.tool_count
          }
        : live;
    }
  }
  await runCommand("codex", registration.args);
  const verification = await runCommand("codex", ["mcp", "get", registration.name]);
  const output = String(verification?.stdout ?? verification ?? "");
  if (!output.includes(`url: ${registration.url}`) ||
      !output.includes(`bearer_token_env_var: ${registration.bearer_token_env_var}`)) {
    throw new Error("Codex BOS MCP registration verification failed");
  }
  if (credentialState.state !== "current") {
    return {
      ...credentialState,
      url: registration.url,
      bearer_token_env_var: registration.bearer_token_env_var
    };
  }
  const current = {
    state: "current",
    name: registration.name,
    url: registration.url,
    bearer_token_env_var: registration.bearer_token_env_var,
    tool_count: credentialState.tool_count
  };
  if (credentialState.pid) current.host_pid = credentialState.pid;
  if (credentialState.credential_source) {
    current.credential_source = credentialState.credential_source;
  }
  return current;
}

function commandOutput(result) {
  return `${result?.stdout ?? result ?? ""}\n${result?.stderr ?? ""}`;
}

async function inspectDisabledMcp(runCommand, product, endpoint) {
  let result;
  try {
    result = await runCommand("codex", ["mcp", "get", product.mcp_group_name]);
  } catch (error) {
    const diagnostic = commandOutput(error);
    if (diagnostic.includes(
      `Error: No MCP server named '${product.mcp_group_name}' found.`
    )) return "absent";
    throw new Error(`Unable to inspect disabled MCP ${product.mcp_group_name}`);
  }
  const output = commandOutput(result);
  if (output.includes(
    `Error: No MCP server named '${product.mcp_group_name}' found.`
  )) return "absent";
  if (output.includes(`url: ${endpoint}`)) return "owned";
  return "unrelated";
}

async function inspectDisabledPlugin(runCommand, product) {
  let result;
  try {
    result = await runCommand("codex", ["plugin", "list"]);
  } catch {
    throw new Error(`Unable to inspect disabled plugin ${product.name}`);
  }
  const selector = `${product.name}@bos-education-center`;
  const line = commandOutput(result)
    .split(/\r?\n/)
    .find((candidate) => candidate.trimStart().startsWith(selector));
  if (!line || /\bnot installed\b/.test(line)) return "absent";
  if (/\binstalled(?:,|\b)/.test(line)) return "installed";
  throw new Error(`Unable to classify disabled plugin ${product.name}`);
}

export async function reconcileDisabledCodexProducts(options = {}) {
  if ((options.client ?? "codex") !== "codex") return [];
  const manifestPath = join(root, "clients", "disabled-products.json");
  if (!(await pathExists(manifestPath))) return [];
  const disabled = await readJson(manifestPath);
  const runCommand = options.runCommand ?? execFileAsync;
  const renamePath = options.renamePath ?? rename;
  const actions = [];
  for (const product of disabled.products ?? []) {
    const stableName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!stableName.test(product.name ?? "") ||
        !stableName.test(product.application_name ?? "") ||
        !stableName.test(product.mcp_group_name ?? "")) {
      throw new Error("Disabled product inventory contains an invalid identity");
    }
    const endpoint = `https://dfsm.ai/mcp/apps/${product.application_name}/${product.mcp_group_name}`;
    if (await inspectDisabledMcp(runCommand, product, endpoint) === "owned") {
      await runCommand("codex", ["mcp", "remove", product.mcp_group_name]);
      if (await inspectDisabledMcp(runCommand, product, endpoint) !== "absent") {
        throw new Error(`Disabled MCP ${product.mcp_group_name} remains registered`);
      }
      actions.push(`removed_mcp:${product.mcp_group_name}`);
    }

    const home = options.home ?? homedir();
    const installedRoots = [
      codexProductRoot({ home, product: product.name }),
      legacyCodexProductRoot(home, product.name)
    ];
    for (const [rootIndex, installedRoot] of installedRoots.entries()) {
      const installedMetadata = join(installedRoot, ".bos-product.json");
      try {
        const metadata = await readJson(installedMetadata);
        if (metadata.name === product.name) {
          if (await inspectDisabledPlugin(runCommand, product) === "installed") {
            await runCommand("codex", [
              "plugin", "remove", `${product.name}@bos-education-center`, "--json"
            ]);
            if (await inspectDisabledPlugin(runCommand, product) !== "absent") {
              throw new Error(`Disabled plugin ${product.name} remains installed`);
            }
          }
          const backup = join(
            home,
            ".agents",
            "bos-backups",
            `disabled-${product.name}-${Date.now()}-${rootIndex}`
          );
          await mkdir(dirname(backup), { recursive: true });
          await renamePath(installedRoot, backup);
          actions.push(`retired_plugin:${product.name}:${backup}`);
        }
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }

    const marketplacePath = codexMarketplaceManifest(home);
    try {
      const marketplace = await readJson(marketplacePath);
      const originalCount = marketplace.plugins?.length ?? 0;
      marketplace.plugins = (marketplace.plugins ?? []).filter((entry) =>
        entry.name !== product.name || entry.source?.path !== `./plugins/${product.name}`
      );
      if (marketplace.plugins.length !== originalCount) {
        const temporary = `${marketplacePath}.tmp-${process.pid}`;
        await writeFile(temporary, stableJson(marketplace));
        await rename(temporary, marketplacePath);
        actions.push(`removed_marketplace_entry:${product.name}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new Error(`Unable to reconcile disabled marketplace entry ${product.name}`);
      }
    }
  }
  return actions;
}

export function validateCustomerSettings(settings) {
  const failures = [];
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return ["settings must be a JSON object"];
  }
  if (settings.schema_version !== "1") failures.push('schema_version must be "1"');
  const allowedTopLevel = new Set([
    "schema_version", "brand_display_name", "organization_display_name", "location_display_name",
    "timezone", "mailboxes", "source_routes", "billing"
  ]);
  for (const field of Object.keys(settings)) {
    if (!allowedTopLevel.has(field)) failures.push(`unknown settings field: ${field}`);
  }
  for (const field of [
    "brand_display_name", "organization_display_name", "location_display_name", "timezone"
  ]) {
    if (typeof settings[field] !== "string" || !settings[field].trim()) {
      failures.push(`${field} must be a non-empty string`);
    }
  }
  if (typeof settings.brand_display_name === "string" &&
      (settings.brand_display_name.trim().length > 120 ||
       /[\r\n\u0000-\u001f\u007f]/.test(settings.brand_display_name))) {
    failures.push("brand_display_name must be a single-line display value of 120 characters or fewer");
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
      if (!new Set(["care_com", "parent_communications"]).has(field)) {
        failures.push(`unknown mailboxes field: ${field}`);
      }
    }
  }
  if (mailbox !== undefined && mailbox !== "" &&
      (typeof mailbox !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox))) {
    failures.push("mailboxes.care_com must be empty or a valid email address");
  }
  const parentMailbox = settings.mailboxes?.parent_communications;
  if (parentMailbox !== undefined && parentMailbox !== "" &&
      (typeof parentMailbox !== "string" ||
       !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentMailbox))) {
    failures.push("mailboxes.parent_communications must be empty or a valid email address");
  }
  const allowedSourceRoutes = new Set([
    "calimatic", "lead_director", "calendar", "parent_communications", "care_com"
  ]);
  const allowedRouteValues = new Set(["bos", "connected_gmail"]);
  if (settings.source_routes !== undefined &&
      (!settings.source_routes || typeof settings.source_routes !== "object" ||
       Array.isArray(settings.source_routes))) {
    failures.push("source_routes must be an object");
  } else {
    for (const [field, value] of Object.entries(settings.source_routes ?? {})) {
      if (!allowedSourceRoutes.has(field)) {
        failures.push(`unknown source_routes field: ${field}`);
      } else if (!allowedRouteValues.has(value)) {
        failures.push(`source_routes.${field} must be bos or connected_gmail`);
      } else if (value === "connected_gmail" && field !== "care_com" &&
                 field !== "parent_communications") {
        failures.push(`source_routes.${field} does not support connected_gmail`);
      } else if (value === "connected_gmail" && field === "care_com" && !mailbox) {
        failures.push("source_routes.care_com requires mailboxes.care_com");
      } else if (value === "connected_gmail" && field === "parent_communications" &&
                 !parentMailbox) {
        failures.push(
          "source_routes.parent_communications requires mailboxes.parent_communications"
        );
      }
    }
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
    brand_display_name: clientContext.brand_display_name,
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
  const marketplace = options.marketplace ?? codexMarketplaceManifest(options.home);
  const marketplaceRoot = marketplaceRootFromManifest(marketplace);
  const marketplaceRelativePath = relative(marketplaceRoot, marketplace);
  const allowedMarketplaceRoot = join(options.home, ".agents");
  if (marketplaceRelativePath !== join(".agents", "plugins", "marketplace.json") ||
      !safeInside(allowedMarketplaceRoot, marketplaceRoot) ||
      resolve(marketplaceRoot) === resolve(allowedMarketplaceRoot)) {
    throw new Error(
      `Marketplace must use <home>/.agents/<marketplace>/.agents/plugins/marketplace.json`
    );
  }
  const canonicalTarget = codexProductRoot({
    home: options.home,
    marketplace,
    product: options.product
  });
  const target = options.target ?? canonicalTarget;
  if (resolve(target) !== resolve(canonicalTarget)) {
    throw new Error(`Target must be the marketplace product directory ${canonicalTarget}`);
  }
  return {
    desired,
    target,
    marketplace,
    legacyTarget: legacyCodexProductRoot(options.home, options.product)
  };
}

async function lstatIfExists(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function validateLegacyProduct(path, product) {
  const metadata = await readJson(join(path, ".bos-product.json"));
  if (metadata.name !== product) {
    throw new Error(`Legacy product metadata does not match ${product}: ${path}`);
  }
}

export async function migrateLegacyCodexLayout(rawOptions = {}) {
  const options = {
    client: "codex",
    product: "bos",
    home: homedir(),
    ...rawOptions
  };
  const paths = pathsFor(options);
  const legacyStat = await lstatIfExists(paths.legacyTarget);
  const targetStat = await lstatIfExists(paths.target);
  if (!legacyStat) {
    if (targetStat?.isSymbolicLink()) {
      throw new Error(`Canonical product path must be a real directory: ${paths.target}`);
    }
    return [];
  }
  await validateLegacyProduct(paths.legacyTarget, options.product);
  let removedMarketplaceLink = false;
  if (targetStat?.isSymbolicLink()) {
    const [linkedProduct, legacyProduct] = await Promise.all([
      realpath(paths.target),
      realpath(paths.legacyTarget)
    ]);
    if (linkedProduct !== legacyProduct) {
      throw new Error(`Marketplace link does not target the legacy product: ${paths.target}`);
    }
    await rm(paths.target, { force: true });
    removedMarketplaceLink = true;
  } else if (targetStat) {
    throw new Error(
      `Both canonical and legacy product directories exist for ${options.product}`
    );
  }
  await mkdir(dirname(paths.target), { recursive: true });
  try {
    await (options.renamePath ?? rename)(paths.legacyTarget, paths.target);
  } catch (error) {
    if (removedMarketplaceLink && !(await lstatIfExists(paths.target))) {
      await symlink(paths.legacyTarget, paths.target, "dir");
    }
    throw error;
  }
  return [`migrated_product:${options.product}:${paths.legacyTarget}:${paths.target}`];
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
  if (
    marketplace.name !== codexMarketplaceIdentity.name ||
    marketplace.interface?.displayName !== codexMarketplaceIdentity.displayName
  ) {
    return { state: "stale", entry: entries[0] };
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
  if (
    !previousState &&
    desired.manifest.apps &&
    ".mcp.json" in currentFiles &&
    !(".mcp.json" in desired.hashes)
  ) {
    const metadata = await readJson(join(paths.desired, ".bos-product.json"));
    const expectedUrl =
      `https://dfsm.ai/mcp/apps/${metadata.application_name}/${metadata.mcp_group_name}`;
    if (await isLegacyCodexOAuthConfig(
      join(paths.target, ".mcp.json"),
      metadata.mcp_group_name,
      expectedUrl
    )) {
      remove.push(".mcp.json");
      preserve = preserve.filter((path) => path !== ".mcp.json");
    }
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
  const [targetStat, legacyStat] = await Promise.all([
    lstatIfExists(paths.target),
    lstatIfExists(paths.legacyTarget)
  ]);
  const legacyLayout = targetStat?.isSymbolicLink() ||
    (!targetStat && Boolean(legacyStat));
  if (legacyLayout) target.state = "legacy-layout";
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
      name: codexMarketplaceIdentity.name,
      interface: { displayName: codexMarketplaceIdentity.displayName },
      plugins: []
    };
  }
  marketplace.name = codexMarketplaceIdentity.name;
  marketplace.interface = {
    ...(marketplace.interface ?? {}),
    displayName: codexMarketplaceIdentity.displayName
  };
  const entry = marketplaceEntry({
    name: options.product,
    authentication: desiredManifest.apps ? "ON_INSTALL" : "ON_USE",
    category: desiredManifest.interface?.category ?? "Productivity"
  });
  const index = marketplace.plugins.findIndex(
    (candidate) => candidate.name === options.product
  );
  if (index === -1) marketplace.plugins.push(entry);
  else {
    if (!desiredManifest.apps) {
      entry.policy.authentication =
        marketplace.plugins[index].policy?.authentication ?? "ON_USE";
    }
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
  const layoutActions = await migrateLegacyCodexLayout(options);
  const disabledProductActions = await reconcileDisabledCodexProducts(options);
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
  result.layout_actions = layoutActions;
  result.disabled_product_actions = disabledProductActions;
  return result;
}

export async function verifyInstallation(options = {}) {
  const report = await inspectInstallation({ ...options, command: "verify" });
  report.runtime = await configureCodexBosMcp(options, report.paths);
  report.ok =
    report.state === "managed-current" && report.marketplace === "current" &&
    ["current", "host_managed", "not_applicable"].includes(report.runtime.state);
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
        "Continue with education-center-customer-initialization: derive safe client values and ask the user once for unresolved settings."
      );
    }
    for (const [key, values] of Object.entries(report.actions)) {
      if (values.length) console.log(`${key}: ${values.join(", ")}`);
    }
    for (const warning of report.warnings) console.log(`warning: ${warning}`);
    if (report.runtime) {
      const reason = report.runtime.reason
        ? `; reason=${report.runtime.reason}`
        : "";
      console.log(`runtime=${report.runtime.state}${reason}`);
    }
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
