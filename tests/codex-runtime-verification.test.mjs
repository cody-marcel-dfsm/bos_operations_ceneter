import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectCodexRuntime } from "../scripts/verify-codex-runtime.mjs";
import { readJson, root } from "../scripts/lib/package-model.mjs";

const releaseVersion = (await readJson(join(root, "products", "bos", "product.json"))).version;

async function fixtureHome(toolNames) {
  const home = await mkdtemp(join(tmpdir(), "bos-codex-runtime-"));
  for (const product of ["bos", "education-center"]) {
    await mkdir(
      join(home, ".codex", "plugins", "cache", "bos-education-center", product, releaseVersion),
      { recursive: true }
    );
  }
  await writeFile(
    join(home, ".codex", "plugins", "cache", "bos-education-center", "bos", releaseVersion, ".app.json"),
    JSON.stringify({
      apps: {
        bos: {
          id: "asdk_app_6a932992592081919cdc88c60e4ff2dd",
          required: true
        }
      }
    })
  );
  const catalog = join(home, ".codex", "cache", "codex_apps_tools", "catalog.json");
  await mkdir(join(home, ".codex", "cache", "codex_apps_tools"), { recursive: true });
  await writeFile(catalog, JSON.stringify({
    schema_version: 1,
    tools: toolNames.map((name) => ({
      name: `bos_business_operating_system.${name}`,
      _meta: { _codex_apps: { resource_uri: "https://dfsm.ai/mcp/apps/bos/platform" } }
    }))
  }));
  const appDirectory = join(home, ".codex", "cache", "codex_app_directory", "directory.json");
  await mkdir(join(home, ".codex", "cache", "codex_app_directory"), { recursive: true });
  await writeFile(appDirectory, JSON.stringify({
    schema_version: 1,
    connectors: [{
      id: "asdk_app_6a932992592081919cdc88c60e4ff2dd",
      name: "Business Operating System"
    }]
  }));
  return { home, catalog };
}

function runCommand({ installed = true, marketplace = true } = {}) {
  return async (_command, args) => {
    if (args[0] === "plugin" && args[1] === "list") {
      return { stdout: JSON.stringify({ installed: installed ? [
        {
          pluginId: "bos@bos-education-center",
          version: releaseVersion,
          installed: true,
          enabled: true
        },
        {
          pluginId: "education-center@bos-education-center",
          version: releaseVersion,
          installed: true,
          enabled: true
        }
      ] : [] }) };
    }
    return { stdout: JSON.stringify({
      marketplaces: marketplace ? [{ name: "bos-education-center" }] : []
    }) };
  };
}

function runLocalCommand(sourceRoot) {
  return async (_command, args) => {
    if (args[0] === "plugin" && args[1] === "list") {
      return { stdout: JSON.stringify({ installed: [
        {
          pluginId: "bos@bos-education-center",
          version: releaseVersion,
          installed: true,
          enabled: true,
          source: { source: "local", path: join(sourceRoot, "bos") }
        },
        {
          pluginId: "education-center@bos-education-center",
          version: releaseVersion,
          installed: true,
          enabled: true,
          source: { source: "local", path: join(sourceRoot, "education-center") }
        }
      ] }) };
    }
    return { stdout: JSON.stringify({ marketplaces: [{ name: "bos-education-center" }] }) };
  };
}

const requiredTools = [
  "bos_get_authorization_status",
  "bos_apply_plugin_settings",
  "bos_begin_plugin_service_connection",
  "bos_get_context",
  "bos_get_plugin_setting_changes",
  "bos_get_plugin_settings",
  "bos_get_plugin_settings_initialization",
  "bos_list_plugin_services",
  "bos_prepare_plugin_settings",
  "bos_resume_operation",
  "bos_set_plugin_enabled",
  "education_center_get_camp_roster_report",
  "education_center_list_enrollments",
  "education_center_search_leads",
  "education_center_search_students"
];

test("Codex runtime verification accepts one registered app binding and complete tool catalog", async () => {
  const { home, catalog } = await fixtureHome(requiredTools);
  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runCommand()
  });
  assert.equal(report.ok, true, JSON.stringify(report.failures));
  assert.deepEqual(report.callable_catalog.missing_tools, []);
  assert.equal(report.registered_app_resolution.state, "directory-listed");
});

test("Codex runtime verification accepts the host's nested callable-tool cache schema", async () => {
  const { home, catalog } = await fixtureHome([]);
  await writeFile(catalog, JSON.stringify({
    schema_version: 1,
    tools: requiredTools.map((name) => ({
      server_name: "codex_apps",
      tool: { name: `bos_business_operating_system.${name}` }
    }))
  }));
  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runCommand()
  });
  assert.equal(report.ok, true, JSON.stringify(report.failures));
  assert.deepEqual(report.callable_catalog.missing_tools, []);
});

test("Codex runtime verification accepts a direct local marketplace without package caches", async () => {
  const { home, catalog } = await fixtureHome(requiredTools);
  const sourceRoot = join(home, "local-marketplace", "plugins");
  await mkdir(join(sourceRoot, "bos"), { recursive: true });
  await mkdir(join(sourceRoot, "education-center"), { recursive: true });
  for (const product of ["bos", "education-center"]) {
    await writeFile(join(sourceRoot, product, ".bos-product.json"), JSON.stringify({
      name: product,
      client: "codex",
      version: releaseVersion
    }));
  }
  await writeFile(join(sourceRoot, "bos", ".app.json"), JSON.stringify({
    apps: {
      bos: {
        id: "asdk_app_6a932992592081919cdc88c60e4ff2dd",
        required: true
      }
    }
  }));
  const cacheRoot = join(home, ".codex", "plugins", "cache", "bos-education-center");
  await rm(cacheRoot, { recursive: true });
  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runLocalCommand(sourceRoot)
  });
  assert.equal(report.ok, true, JSON.stringify(report.failures));
  assert.equal(report.app_binding.path, join(sourceRoot, "bos", ".app.json"));
  assert.deepEqual(report.cache_versions, { bos: [], "education-center": [] });
});

test("Codex runtime verification rejects a direct-MCP-only package with no Login binding", async () => {
  const { home, catalog } = await fixtureHome(requiredTools);
  const bosRoot = join(
    home,
    ".codex",
    "plugins",
    "cache",
    "bos-education-center",
    "bos",
    releaseVersion
  );
  await rm(join(bosRoot, ".app.json"));
  await writeFile(join(bosRoot, ".mcp.json"), JSON.stringify({
    mcpServers: {
      platform: {
        type: "http",
        url: "https://dfsm.ai/mcp/apps/bos/platform"
      }
    }
  }));

  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runCommand()
  });
  assert.equal(report.ok, false);
  assert.equal(report.app_binding.state, "missing");
  assert(report.failures.includes("registered BOS app binding is missing or invalid"));
});

test("Codex runtime verification rejects an optional app that does not require the Login surface", async () => {
  const { home, catalog } = await fixtureHome(requiredTools);
  const appPath = join(
    home,
    ".codex",
    "plugins",
    "cache",
    "bos-education-center",
    "bos",
    releaseVersion,
    ".app.json"
  );
  await writeFile(appPath, JSON.stringify({
    apps: {
      bos: {
        id: "asdk_app_6a932992592081919cdc88c60e4ff2dd"
      }
    }
  }));

  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runCommand()
  });
  assert.equal(report.ok, false);
  assert.equal(report.app_binding.state, "invalid");
  assert(report.failures.includes("registered BOS app binding is missing or invalid"));
});

test("Codex runtime verification reproduces the incomplete Calimatic tool catalog", async () => {
  const { home, catalog } = await fixtureHome(requiredTools.filter((name) => ![
    "education_center_get_camp_roster_report",
    "education_center_list_enrollments",
    "education_center_search_students"
  ].includes(name)));
  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runCommand()
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.callable_catalog.missing_tools, [
    "education_center_get_camp_roster_report",
    "education_center_list_enrollments",
    "education_center_search_students"
  ]);
});

test("Codex runtime verification rejects a catalog without native settings tools", async () => {
  const { home, catalog } = await fixtureHome(requiredTools.filter((name) => ![
    "bos_get_plugin_settings",
    "bos_prepare_plugin_settings",
    "bos_apply_plugin_settings"
  ].includes(name)));
  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runCommand()
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.callable_catalog.missing_tools, [
    "bos_apply_plugin_settings",
    "bos_get_plugin_settings",
    "bos_prepare_plugin_settings"
  ]);
});

test("Codex runtime verification rejects orphan caches without installed registry entries", async () => {
  const { home, catalog } = await fixtureHome(requiredTools);
  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runCommand({ installed: false, marketplace: false })
  });
  assert.equal(report.ok, false);
  assert.match(report.failures.join("\n"), /is not installed and enabled/);
  assert.match(report.failures.join("\n"), /marketplace is not registered/);
});

test("Codex runtime verification reports the exact registered app as unavailable after a resolver 404", async () => {
  const { home, catalog } = await fixtureHome(requiredTools);
  const appDirectory = join(home, ".codex", "cache", "codex_app_directory", "directory.json");
  await writeFile(appDirectory, JSON.stringify({ schema_version: 1, connectors: [] }));
  const logRoot = join(home, "Library", "Logs", "com.openai.codex", "2026", "09", "01");
  await mkdir(logRoot, { recursive: true });
  await writeFile(join(logRoot, "codex-desktop.log"), [
    "2099-09-01T19:53:57.476Z warning sa_server_request_failed",
    "errorMessage=\"{\\\"detail\\\":\\\"Connector not found\\\"}\"",
    "status=404",
    "url=/aip/connectors/asdk_app_6a932992592081919cdc88c60e4ff2dd?include_actions=false"
  ].join(" "));

  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runCommand()
  });
  assert.equal(report.ok, false);
  assert.equal(report.registered_app_resolution.state, "unavailable");
  assert.equal(report.registered_app_resolution.directory.state, "not-listed");
  assert.equal(report.registered_app_resolution.resolver_log.state, "connector-not-found");
  assert(report.failures.includes(
    "registered BOS app is unavailable to Codex: asdk_app_6a932992592081919cdc88c60e4ff2dd"
  ));
});

test("Codex runtime verification does not let historical resolver failure override newer success evidence", async () => {
  const { home, catalog } = await fixtureHome(requiredTools);
  const logRoot = join(home, "Library", "Logs", "com.openai.codex");
  await mkdir(logRoot, { recursive: true });
  await writeFile(join(logRoot, "historical.log"), [
    "2000-01-01T00:00:00.000Z warning sa_server_request_failed",
    "errorMessage=\"{\\\"detail\\\":\\\"Connector not found\\\"}\"",
    "status=404",
    "url=/aip/connectors/asdk_app_6a932992592081919cdc88c60e4ff2dd?include_actions=false"
  ].join(" "));

  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runCommand()
  });
  assert.equal(report.ok, true, JSON.stringify(report.failures));
  assert.equal(report.registered_app_resolution.state, "directory-listed");
  assert.equal(report.registered_app_resolution.resolver_log.state, "observed");
});
