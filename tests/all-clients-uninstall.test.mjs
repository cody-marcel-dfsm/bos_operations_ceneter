import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ALL_CLIENTS_UNINSTALL_CONFIRMATION,
  uninstallBosAllClients
} from "../scripts/uninstall-bos-all-clients.mjs";
import { pathExists } from "../scripts/lib/package-model.mjs";

const appId = "asdk_app_6a932992592081919cdc88c60e4ff2dd";

async function fixtureHome(context) {
  const home = await mkdtemp(join(tmpdir(), "bos-all-uninstall-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  for (const [clientRoot, client] of [
    [join(home, ".codex/plugins/cache/bos-education-center"), undefined],
    [join(home, ".claude/plugins/cache/bos-education-center"), "claude"]
  ]) {
    for (const product of ["bos", "education-center"]) {
      const version = join(clientRoot, product, "0.4.52");
      await mkdir(version, { recursive: true });
      await writeFile(join(version, ".bos-product.json"), JSON.stringify({ name: product, client }));
    }
  }
  const suffix = appId.replace(/^asdk_app_/, "");
  const wrapper = join(home, ".codex/plugins/cache/created-by-me-remote", `dev-${suffix}`);
  await mkdir(wrapper, { recursive: true });
  await writeFile(join(wrapper, ".codex-remote-plugin-install.json"), JSON.stringify({
    remote_plugin_id: `plugin_${appId}`
  }));
  const globalState = join(home, ".codex/.codex-global-state.json");
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(globalState, JSON.stringify({
    "electron-persisted-atom-state": {
      "mcp-extension-sidebar-catalog": {
        catalog: [{ tools: [
          { name: "bos", _meta: { connector_id: appId } },
          { name: "other", _meta: { connector_id: "other" } }
        ] }]
      }
    }
  }));
  await mkdir(join(home, "Library/Caches/ai.dfsm.bos"), { recursive: true });
  return { home, globalState };
}

function commandFixture() {
  const state = { codex: true, claude: true, codexMarket: true, claudeMarket: true };
  const calls = [];
  const runCommand = async (command, args) => {
    calls.push([command, ...args].join(" "));
    if (command === "codex" && args.join(" ") === "plugin list --json") {
      return { stdout: JSON.stringify({ installed: state.codex ? [
        { pluginId: "bos@bos-education-center" },
        { pluginId: "education-center@bos-education-center" }
      ] : [] }) };
    }
    if (command === "codex" && args.join(" ") === "plugin marketplace list --json") {
      return { stdout: JSON.stringify({ marketplaces: state.codexMarket ? [{ name: "bos-education-center" }] : [] }) };
    }
    if (command === "claude" && args.join(" ") === "plugin list --json") {
      return { stdout: JSON.stringify(state.claude ? [
        { id: "bos@bos-education-center" },
        { id: "education-center@bos-education-center" }
      ] : []) };
    }
    if (command === "claude" && args.join(" ") === "plugin marketplace list --json") {
      return { stdout: JSON.stringify(state.claudeMarket ? [{ name: "bos-education-center" }] : []) };
    }
    if (command === "codex" && args[1] === "remove") state.codex = false;
    if (command === "codex" && args[1] === "marketplace" && args[2] === "remove") state.codexMarket = false;
    if (command === "claude" && args[1] === "uninstall") state.claude = false;
    if (command === "claude" && args[1] === "marketplace" && args[2] === "remove") state.claudeMarket = false;
    return { stdout: "{}" };
  };
  return { calls, runCommand };
}

test("all-client uninstall removes validated BOS state and preserves unrelated catalog tools", async (context) => {
  const { home, globalState } = await fixtureHome(context);
  const { calls, runCommand } = commandFixture();
  const report = await uninstallBosAllClients({
    confirmation: ALL_CLIENTS_UNINSTALL_CONFIRMATION,
    home,
    runCommand
  });
  assert.equal(report.ok, true);
  assert.equal(await pathExists(join(home, ".codex/plugins/cache/bos-education-center")), false);
  assert.equal(await pathExists(join(home, ".claude/plugins/cache/bos-education-center")), false);
  assert.equal(await pathExists(join(home, "Library/Caches/ai.dfsm.bos")), false);
  const global = JSON.parse(await readFile(globalState, "utf8"));
  assert.deepEqual(global["electron-persisted-atom-state"]
    ["mcp-extension-sidebar-catalog"].catalog[0].tools.map((tool) => tool.name), ["other"]);
  assert(calls.includes("codex plugin remove bos@bos-education-center --json"));
  assert(calls.includes("claude plugin uninstall bos@bos-education-center --scope user"));
});

test("all-client uninstall requires exact destructive confirmation", async () => {
  await assert.rejects(
    uninstallBosAllClients({ confirmation: "yes", runCommand: async () => ({ stdout: "[]" }) }),
    /Confirmation must equal/
  );
});

test("dry run reports removals without changing files", async (context) => {
  const { home } = await fixtureHome(context);
  const { runCommand } = commandFixture();
  const report = await uninstallBosAllClients({ home, dryRun: true, runCommand });
  assert.equal(report.ok, true);
  assert.equal(await pathExists(join(home, ".codex/plugins/cache/bos-education-center")), true);
  assert(report.actions.some((action) => action.includes("unregister_codex_plugin")));
});
