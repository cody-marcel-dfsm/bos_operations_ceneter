import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CACHE_RESET_CONFIRMATION,
  planBosClientCacheReset,
  resetBosClientCaches
} from "../scripts/reset-bos-client-caches.mjs";
import { pathExists, readJson, root } from "../scripts/lib/package-model.mjs";

const currentVersion = (await readJson(join(root, "products", "bos", "product.json"))).version;

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "bos-cache-reset-"));
  for (const [client, base] of [["codex", ".codex"], ["claude", ".claude"]]) {
    for (const product of ["bos", "education-center"]) {
      const dir = join(home, base, "plugins/cache/bos-education-center", product, currentVersion);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, ".bos-product.json"), JSON.stringify({ name: product, client }));
    }
  }
  return home;
}

test("cache reset targets only validated local marketplace package caches", async () => {
  const home = await fixture();
  const plan = await planBosClientCacheReset({ home });
  assert.equal(plan.targets.length, 2);
  assert(plan.targets.every((path) => path.endsWith("plugins/cache/bos-education-center")));
  assert.equal(plan.targets.some((path) => path.includes("created-by-me-remote")), false);
  assert.equal(plan.targets.some((path) => path.includes("codex_apps_tools")), false);
  const report = await resetBosClientCaches({ home, confirmation: CACHE_RESET_CONFIRMATION });
  assert.equal(report.ok, true);
  for (const path of plan.targets) assert.equal(await pathExists(path), false);
});

const desktopRepository = "https://github.com/cody-marcel-dfsm/bos_operations_ceneter";

async function writeDesktopPluginSnapshot(home, { account, session, pluginId, name, repository }) {
  const dir = join(
    home, "Library", "Application Support", "Claude",
    "local-agent-mode-sessions", account, session, "rpm", pluginId, ".claude-plugin"
  );
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "plugin.json"), JSON.stringify({ name, repository }));
  return join(dir, "..");
}

test("cache reset also targets validated Claude Desktop session plugin snapshots", async () => {
  const home = await fixture();
  const bosSnapshot = await writeDesktopPluginSnapshot(home, {
    account: "acct-1", session: "sess-1", pluginId: "plugin_bos",
    name: "bos", repository: desktopRepository
  });
  const eduSnapshot = await writeDesktopPluginSnapshot(home, {
    account: "acct-1", session: "sess-1", pluginId: "plugin_education",
    name: "education-center", repository: desktopRepository
  });
  const unrelatedSnapshot = await writeDesktopPluginSnapshot(home, {
    account: "acct-1", session: "sess-1", pluginId: "plugin_other",
    name: "some-other-plugin", repository: "https://github.com/example/unrelated"
  });

  const plan = await planBosClientCacheReset({ home });
  assert(plan.targets.includes(bosSnapshot));
  assert(plan.targets.includes(eduSnapshot));
  assert.equal(plan.targets.includes(unrelatedSnapshot), false);

  const report = await resetBosClientCaches({ home, confirmation: CACHE_RESET_CONFIRMATION });
  assert.equal(report.ok, true);
  assert.equal(await pathExists(bosSnapshot), false);
  assert.equal(await pathExists(eduSnapshot), false);
  assert.equal(await pathExists(unrelatedSnapshot), true);
});
