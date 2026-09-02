import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CODEX_CLEAN_CONFIRMATION,
  cleanInstallCodex,
  planCodexCleanup,
  removeBosPluginStateFromGlobalState
} from "../scripts/clean-install-codex.mjs";
import {
  codexConnectorContract,
  codexRawAppId,
  readJson,
  root
} from "../scripts/lib/package-model.mjs";

const bosProduct = await readJson(join(root, "products", "bos", "product.json"));
const bosConnector = codexConnectorContract(bosProduct);
const appId = bosConnector.id;
const rawAppId = codexRawAppId(appId);
const retiredAppId = bosConnector.retired_ids[0];
const suffix = rawAppId.replace("asdk_app_", "");

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
      "prompt-history": {
        global: [`Investigate ${appId} at ${bosProduct.mcp_resource_url}`]
      },
      "app-connect-oauth-plugin-install-resume-by-state-v1": {
        "codex_scheme__oauth_test": {
          marketplaceAnalytics: { remotePluginId: appId }
        }
      },
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
  assert.equal(plan.global_state.endsWith(".codex-global-state.json"), true);
});

test("Codex global cleanup removes plugin state and preserves matching prompt history", () => {
  const state = {
    "electron-persisted-atom-state": {
      "prompt-history": {
        global: [`Discuss ${appId} and ${bosProduct.mcp_resource_url}`]
      },
      "app-connect-oauth-plugin-install-resume-by-state-v1": {
        bos: { remotePluginId: appId },
        other: { remotePluginId: "plugin_asdk_app_other" }
      },
      "mcp-extension-sidebar-catalog": {
        catalog: [{ tools: [
          { name: "bos", _meta: { connector_id: appId } },
          { name: "other", _meta: { connector_id: "asdk_app_other" } }
        ] }]
      }
    }
  };

  assert.equal(removeBosPluginStateFromGlobalState(state), 2);
  const atoms = state["electron-persisted-atom-state"];
  assert.equal(atoms["prompt-history"].global.length, 1);
  assert.deepEqual(
    Object.keys(atoms["app-connect-oauth-plugin-install-resume-by-state-v1"]),
    ["other"]
  );
  assert.deepEqual(
    atoms["mcp-extension-sidebar-catalog"].catalog[0].tools.map(({ name }) => name),
    ["other"]
  );
});

test("Codex cleanup preserves unrelated global catalog tools and never reinstalls", async () => {
  const { home, globalState } = await fixtureHome();
  const commands = [];
  const installed = new Set([
    "bos@bos-education-center",
    "education-center@bos-education-center"
  ]);
  let marketplacePresent = true;
  const accountCalls = [];
  const codexAccount = {
    async inspectConnector(id) {
      accountCalls.push(`inspect:${id}`);
      return { ok: false, http_status: 404 };
    },
    async remove(id) {
      accountCalls.push(`remove:${id}`);
      return { alreadyAbsent: false };
    }
  };
  const runCommand = async (_command, args) => {
    commands.push(args);
    if (args[1] === "list" && args[2] === "--json") {
      return { stdout: JSON.stringify({
        installed: [...installed].map((pluginId) => ({ pluginId }))
      }) };
    }
    if (args[1] === "remove") {
      installed.delete(args[2]);
      return { stdout: "{}" };
    }
    if (args[1] === "marketplace" && args[2] === "list") {
      return { stdout: JSON.stringify({
        marketplaces: marketplacePresent ? [{ name: "bos-education-center" }] : []
      }) };
    }
    if (args[1] === "marketplace" && args[2] === "remove") {
      marketplacePresent = false;
      return { stdout: "{}" };
    }
    return { stdout: "{}" };
  };
  const report = await cleanInstallCodex({
    home,
    confirmation: CODEX_CLEAN_CONFIRMATION,
    runCommand,
    codexAccount
  });
  assert.equal(report.ok, true);
  const state = JSON.parse(await readFile(globalState, "utf8"));
  const tools = state["electron-persisted-atom-state"]
    ["mcp-extension-sidebar-catalog"].catalog[0].tools;
  assert.deepEqual(tools.map((tool) => tool.name), ["other"]);
  assert.equal(
    state["electron-persisted-atom-state"]["prompt-history"].global.length,
    1
  );
  assert.deepEqual(
    state["electron-persisted-atom-state"]
      ["app-connect-oauth-plugin-install-resume-by-state-v1"],
    {}
  );
  assert.equal(commands.filter((args) => args[1] === "remove").length, 2);
  assert.equal(commands.filter((args) => args[1] === "add").length, 0);
  assert.equal(
    commands.filter((args) => args[1] === "marketplace" && args[2] === "add").length,
    0
  );
  assert.equal(
    report.next_action,
    "All retired accidental BOS account apps and all BOS plugin, marketplace, and local artifacts were removed. The permanent product record was preserved. Nothing was reinstalled."
  );
  assert(report.actions.includes("verified_accidental_account_apps_absent"));
  assert(report.actions.includes("verified_plugins_absent"));
  assert(report.actions.includes("verified_marketplace_absent"));
  assert(report.actions.includes("verified_local_artifacts_absent"));
  assert(report.actions.includes("verified_global_plugin_state_absent"));
  assert.equal(accountCalls.filter((call) => call.startsWith("remove:")).length, 0);
  assert.equal(
    accountCalls.filter((call) => call.startsWith("inspect:")).length,
    bosConnector.retired_ids.length * 2
  );
});

test("Codex cleanup removes and verifies a retired accidental BOS app", async () => {
  const { home } = await fixtureHome();
  const current = new Set([retiredAppId]);
  const accountCalls = [];
  const codexAccount = {
    async inspectConnector(id) {
      accountCalls.push(`inspect:${id}`);
      return current.has(id)
        ? { ok: true, http_status: 200, body: { id } }
        : { ok: false, http_status: 404 };
    },
    async remove(id) {
      accountCalls.push(`remove:${id}`);
      current.delete(id);
      return { alreadyAbsent: false };
    }
  };
  const runCommand = async (_command, args) => {
    if (args[1] === "list") return { stdout: JSON.stringify({ installed: [] }) };
    if (args[1] === "marketplace" && args[2] === "list") {
      return { stdout: JSON.stringify({ marketplaces: [] }) };
    }
    return { stdout: "{}" };
  };

  const report = await cleanInstallCodex({
    home,
    confirmation: CODEX_CLEAN_CONFIRMATION,
    runCommand,
    codexAccount
  });

  assert(report.actions.includes(`removed_account_app:${retiredAppId}`));
  assert(report.actions.includes("verified_accidental_account_apps_absent"));
  assert.deepEqual(
    accountCalls.filter((call) => call.startsWith("remove:")),
    [`remove:${retiredAppId}`]
  );
});

test("Codex cleanup is a no-op for retired account records on a second run", async () => {
  const { home } = await fixtureHome();
  const accountCalls = [];
  const codexAccount = {
    async inspectConnector(id) {
      accountCalls.push(`inspect:${id}`);
      return { ok: false, http_status: 404 };
    },
    async remove() {
      throw new Error("unexpected removal");
    }
  };
  const runCommand = async (_command, args) => {
    if (args[1] === "list") return { stdout: JSON.stringify({ installed: [] }) };
    if (args[1] === "marketplace" && args[2] === "list") {
      return { stdout: JSON.stringify({ marketplaces: [] }) };
    }
    return { stdout: "{}" };
  };

  const first = await cleanInstallCodex({
    home,
    confirmation: CODEX_CLEAN_CONFIRMATION,
    runCommand,
    codexAccount,
    deferWhileRunning: false
  });
  const second = await cleanInstallCodex({
    home,
    confirmation: CODEX_CLEAN_CONFIRMATION,
    runCommand,
    codexAccount,
    deferWhileRunning: false
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(accountCalls.length, bosConnector.retired_ids.length * 4);
  assert(second.actions.every((action) => !action.startsWith("removed_account_app:")));
});

test("Codex clean install requires exact destructive confirmation", async () => {
  await assert.rejects(
    cleanInstallCodex({ confirmation: "yes" }),
    /Confirmation must equal/
  );
});

test("Codex cleanup defers all mutations until a running client is stopped", async () => {
  const commands = [];
  const report = await cleanInstallCodex({
    confirmation: CODEX_CLEAN_CONFIRMATION,
    runCommand: async (_command, args) => {
      commands.push(args);
      return { stdout: "{}" };
    },
    codexAccount: {
      async inspect() { return []; },
      async remove() { throw new Error("unexpected removal"); }
    },
    deferRunningInstall: async () => ["ChatGPT"]
  });
  assert.equal(report.ok, true);
  assert.deepEqual(report.actions, ["clean_removal_scheduled:ChatGPT"]);
  assert.deepEqual(commands, []);
});
