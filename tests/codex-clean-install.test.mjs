import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CODEX_CLEAN_CONFIRMATION,
  cleanInstallCodex,
  planCodexCleanup
} from "../scripts/clean-install-codex.mjs";

const appId = "plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91";
const retiredAppId = "asdk_app_6a932992592081919cdc88c60e4ff2dd";
const suffix = appId.replace("plugin_asdk_app_", "");

async function fixtureHome() {
  const home = await mkdtemp(join(tmpdir(), "bos-codex-clean-"));
  for (const product of ["bos", "education-center"]) {
    const version = join(home, ".codex/plugins/cache/bos-education-center", product, "0.4.51");
    await mkdir(version, { recursive: true });
    await writeFile(join(version, ".bos-product.json"), JSON.stringify({ name: product }));
  }
  const wrapper = join(home, ".codex/plugins/cache/created-by-me-remote", `dev-${suffix}`);
  await mkdir(join(wrapper, "1.0.0"), { recursive: true });
  await writeFile(
    join(wrapper, ".codex-remote-plugin-install.json"),
    JSON.stringify({ remote_plugin_id: appId })
  );
  const retiredWrapper = join(
    home,
    ".codex/plugins/cache/created-by-me-remote",
    `dev-${retiredAppId.replace("asdk_app_", "")}`
  );
  await mkdir(join(retiredWrapper, "1.0.0"), { recursive: true });
  await writeFile(
    join(retiredWrapper, ".codex-remote-plugin-install.json"),
    JSON.stringify({ remote_plugin_id: `plugin_${retiredAppId}` })
  );
  const toolCache = join(home, ".codex/cache/codex_apps_tools/catalog.json");
  await mkdir(join(home, ".codex/cache/codex_apps_tools"), { recursive: true });
  await writeFile(toolCache, JSON.stringify({ app_id: appId }));
  const globalState = join(home, ".codex/.codex-global-state.json");
  await writeFile(globalState, JSON.stringify({
    "electron-persisted-atom-state": {
      "mcp-extension-sidebar-catalog": {
        catalog: [{ tools: [
          { name: "bos", _meta: { connector_id: appId } },
          { name: "other", _meta: { connector_id: "asdk_app_other" } }
        ] }]
      }
    }
  }));
  return { home, globalState, retiredWrapper };
}

test("Codex cleanup plan is bounded to BOS-owned identities", async () => {
  const { home } = await fixtureHome();
  const plan = await planCodexCleanup({ home });
  assert.equal(plan.app_id, appId);
  assert.match(plan.package_cache, /bos-education-center$/);
  assert.equal(plan.registered_app_wrappers.length, 2);
  assert(plan.registered_app_wrappers.some((path) => new RegExp(`dev-${suffix}$`).test(path)));
  assert.equal(plan.cache_files.length, 1);
});

test("Codex clean install preserves unrelated global catalog tools", async () => {
  const { home, globalState } = await fixtureHome();
  const commands = [];
  const runCommand = async (_command, args) => {
    commands.push(args);
    if (args[1] === "list" && args[2] === "--json") {
      return { stdout: JSON.stringify({ installed: [
        { pluginId: "bos@bos-education-center" },
        { pluginId: "education-center@bos-education-center" }
      ] }) };
    }
    if (args[1] === "marketplace" && args[2] === "list") {
      return { stdout: JSON.stringify({
        marketplaces: [{ name: "bos-education-center" }]
      }) };
    }
    return { stdout: "{}" };
  };
  const report = await cleanInstallCodex({
    home,
    confirmation: CODEX_CLEAN_CONFIRMATION,
    runCommand
  });
  assert.equal(report.ok, true);
  const state = JSON.parse(await readFile(globalState, "utf8"));
  const tools = state["electron-persisted-atom-state"]
    ["mcp-extension-sidebar-catalog"].catalog[0].tools;
  assert.deepEqual(tools.map((tool) => tool.name), ["other"]);
  assert.equal(commands.filter((args) => args[1] === "remove").length, 2);
  assert.equal(commands.filter((args) => args[1] === "add").length, 2);
});

test("Codex clean install requires exact destructive confirmation", async () => {
  await assert.rejects(
    cleanInstallCodex({ confirmation: "yes" }),
    /Confirmation must equal/
  );
});

test("Codex clean install defers all mutations until a running client is stopped", async () => {
  const commands = [];
  const report = await cleanInstallCodex({
    confirmation: CODEX_CLEAN_CONFIRMATION,
    runCommand: async (_command, args) => {
      commands.push(args);
      return { stdout: "{}" };
    },
    deferRunningInstall: async () => ["ChatGPT"]
  });
  assert.equal(report.ok, true);
  assert.deepEqual(report.actions, ["clean_install_scheduled:ChatGPT"]);
  assert.deepEqual(commands, []);
});
