import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ALL_CLIENTS_UNINSTALL_CONFIRMATION,
  uninstallBosAllClients
} from "../scripts/uninstall-bos-all-clients.mjs";
import { createCodexAccountPluginClient } from "../scripts/lib/codex-account-plugin-client.mjs";
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
  const personalSkill = join(home, ".codex", "skills", "partnership-proposal-builder");
  await mkdir(personalSkill, { recursive: true });
  await writeFile(join(personalSkill, "SKILL.md"), "---\nname: partnership-proposal-builder\n---\n");
  const sourceRoot = join(home, "source-repository");
  for (const relative of [
    join(".agents", "plugins", "marketplace.json"),
    join(".claude-plugin", "marketplace.json")
  ]) {
    const path = join(sourceRoot, relative);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, JSON.stringify({
      name: "bos-education-center",
      plugins: [{ name: "bos" }, { name: "education-center" }]
    }));
  }
  return { home, globalState, sourceRoot };
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
    if (command === "pgrep") return { stdout: "" };
    return { stdout: "{}" };
  };
  return { calls, runCommand };
}

function accountFixture({ present = true } = {}) {
  let plugins = present ? [{
    id: "dev-6a932992592081919cdc88c60e4ff2dd@created-by-me-remote",
    remotePluginId: `plugin_${appId}`,
    installed: true
  }] : [];
  const calls = [];
  return {
    calls,
    client: {
      async inspect() {
        calls.push("inspect");
        return plugins;
      },
      async remove(id) {
        calls.push(`remove:${id}`);
        plugins = [];
      }
    }
  };
}

test("all-client uninstall removes validated BOS state and preserves unrelated catalog tools", async (context) => {
  const { home, globalState, sourceRoot } = await fixtureHome(context);
  const { calls, runCommand } = commandFixture();
  const account = accountFixture({ present: false });
  const report = await uninstallBosAllClients({
    confirmation: ALL_CLIENTS_UNINSTALL_CONFIRMATION,
    home,
    sourceRoot,
    runCommand,
    codexAccount: account.client
  });
  assert.equal(report.ok, true);
  assert.equal(await pathExists(join(home, ".codex/plugins/cache/bos-education-center")), false);
  assert.equal(await pathExists(join(home, ".claude/plugins/cache/bos-education-center")), false);
  assert.equal(await pathExists(join(home, "Library/Caches/ai.dfsm.bos")), false);
  assert.equal(
    await pathExists(join(home, ".codex/skills/partnership-proposal-builder")),
    false
  );
  assert.equal(await pathExists(join(sourceRoot, ".agents/plugins/marketplace.json")), false);
  assert.equal(await pathExists(join(sourceRoot, ".claude-plugin/marketplace.json")), false);
  const global = JSON.parse(await readFile(globalState, "utf8"));
  assert.deepEqual(global["electron-persisted-atom-state"]
    ["mcp-extension-sidebar-catalog"].catalog[0].tools.map((tool) => tool.name), ["other"]);
  assert(calls.includes("codex plugin remove bos@bos-education-center --json"));
  assert(calls.includes("claude plugin uninstall bos@bos-education-center --scope user"));
  assert.deepEqual(account.calls, ["inspect", "inspect"]);
  assert.equal(report.visibility.account_app, "verified_absent");
  assert.equal(report.visibility.repository_marketplace_cards, "verified_absent");
});

test("all-client uninstall requires exact destructive confirmation", async () => {
  await assert.rejects(
    uninstallBosAllClients({
      confirmation: "yes",
      runCommand: async () => ({ stdout: "[]" }),
      codexAccount: accountFixture({ present: false }).client
    }),
    /Confirmation must equal/
  );
});

test("dry run reports removals without changing files", async (context) => {
  const { home, sourceRoot } = await fixtureHome(context);
  const { runCommand } = commandFixture();
  const account = accountFixture({ present: false });
  const report = await uninstallBosAllClients({
    home,
    sourceRoot,
    dryRun: true,
    runCommand,
    codexAccount: account.client
  });
  assert.equal(report.ok, true);
  assert.equal(await pathExists(join(home, ".codex/plugins/cache/bos-education-center")), true);
  assert.equal(
    await pathExists(join(home, ".codex/skills/partnership-proposal-builder")),
    true
  );
  assert.equal(await pathExists(join(sourceRoot, ".agents/plugins/marketplace.json")), true);
  assert(report.actions.some((action) => action.includes("unregister_codex_plugin")));
  assert.deepEqual(account.calls, ["inspect"]);
});

test("account app is deleted automatically before local cleanup", async (context) => {
  const { home, sourceRoot } = await fixtureHome(context);
  const { runCommand } = commandFixture();
  const account = accountFixture();
  const report = await uninstallBosAllClients({
    confirmation: ALL_CLIENTS_UNINSTALL_CONFIRMATION,
    home,
    sourceRoot,
    runCommand,
    codexAccount: account.client
  });
  assert.equal(report.ok, true);
  assert.equal(await pathExists(join(home, ".codex/plugins/cache/bos-education-center")), false);
  assert.deepEqual(account.calls, ["inspect", `remove:${appId}`, "inspect"]);
  assert(report.actions.includes(`delete_codex_account_app:${appId}`));
});

test("account client deletes the exact authenticated ChatGPT connector resource", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "bos-account-delete-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const authPath = join(root, "auth.json");
  await writeFile(authPath, JSON.stringify({
    tokens: { access_token: "test-access", account_id: "test-account" }
  }));
  const requests = [];
  const client = createCodexAccountPluginClient({
    authPath,
    runCommand: async () => ({ stdout: "codex-cli 0.151.0-alpha.7.1\n" }),
    fetchRequest: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) return {
        ok: false,
        status: 403,
        headers: { get: () => "text/html; charset=UTF-8" },
        async text() { return "challenge"; }
      };
      return { ok: true, status: 204 };
    }
  });
  await client.remove(appId);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, `https://chatgpt.com/backend-api/aip/connectors/${appId}`);
  assert.equal(requests[0].options.method, "DELETE");
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-access");
  assert.equal(requests[0].options.headers["ChatGPT-Account-Id"], "test-account");
  assert.equal(requests[0].options.headers["User-Agent"], "codex_cli_rs/0.151.0-alpha.7.1");
});
