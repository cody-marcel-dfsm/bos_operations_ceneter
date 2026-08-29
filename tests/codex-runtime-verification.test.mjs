import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectCodexRuntime } from "../scripts/verify-codex-runtime.mjs";
import { readJson, root } from "../scripts/lib/package-model.mjs";

const appId = "asdk_app_6a932992592081919cdc88c60e4ff2dd";
const releaseVersion = (await readJson(join(root, "products", "bos", "product.json"))).version;

async function fixtureHome(toolNames) {
  const home = await mkdtemp(join(tmpdir(), "bos-codex-runtime-"));
  for (const product of ["bos", "education-center"]) {
    await mkdir(
      join(home, ".codex", "plugins", "cache", "bos-education-center", product, releaseVersion),
      { recursive: true }
    );
  }
  const wrapper = join(
    home,
    ".codex",
    "plugins",
    "cache",
    "created-by-me-remote",
    "dev-6a932992592081919cdc88c60e4ff2dd"
  );
  await mkdir(join(wrapper, "1.0.0"), { recursive: true });
  await writeFile(
    join(wrapper, ".codex-remote-plugin-install.json"),
    JSON.stringify({ schema_version: 1, remote_plugin_id: `plugin_${appId}` })
  );
  const catalog = join(home, ".codex", "cache", "codex_apps_tools", "catalog.json");
  await mkdir(join(home, ".codex", "cache", "codex_apps_tools"), { recursive: true });
  await writeFile(catalog, JSON.stringify({
    schema_version: 1,
    tools: toolNames.map((name) => ({
      name: `bos_business_operating_system.${name}`,
      _meta: { connector_id: appId }
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

const requiredTools = [
  "bos_get_authorization_status",
  "bos_get_context",
  "bos_resume_operation",
  "education_center_get_camp_roster_report",
  "education_center_list_enrollments",
  "education_center_search_leads",
  "education_center_search_students"
];

test("Codex runtime verification accepts one registered package and complete tool catalog", async () => {
  const { home, catalog } = await fixtureHome(requiredTools);
  const report = await inspectCodexRuntime({
    home,
    catalogPath: catalog,
    runCommand: runCommand()
  });
  assert.equal(report.ok, true);
  assert.deepEqual(report.callable_catalog.missing_tools, []);
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
