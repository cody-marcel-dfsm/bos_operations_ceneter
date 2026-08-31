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
    join(home, ".codex", "plugins", "cache", "bos-education-center", "bos", releaseVersion, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        platform: { type: "http", url: "https://dfsm.ai/mcp/apps/bos/platform" }
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

test("Codex runtime verification accepts one package-owned MCP binding and complete tool catalog", async () => {
  const { home, catalog } = await fixtureHome(requiredTools);
  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runCommand()
  });
  assert.equal(report.ok, true);
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
  await writeFile(join(sourceRoot, "bos", ".mcp.json"), JSON.stringify({
    mcpServers: {
      platform: { type: "http", url: "https://dfsm.ai/mcp/apps/bos/platform" }
    }
  }));
  const cacheRoot = join(home, ".codex", "plugins", "cache", "bos-education-center");
  await rm(cacheRoot, { recursive: true });
  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runLocalCommand(sourceRoot)
  });
  assert.equal(report.ok, true);
  assert.equal(report.mcp_binding.path, join(sourceRoot, "bos", ".mcp.json"));
  assert.deepEqual(report.cache_versions, { bos: [], "education-center": [] });
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
