import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CACHE_RESET_CONFIRMATION,
  planBosClientCacheReset,
  resetBosClientCaches
} from "../scripts/reset-bos-client-caches.mjs";
import {
  codexConnectorContract,
  readJson,
  root,
  pathExists
} from "../scripts/lib/package-model.mjs";

const bosProduct = await readJson(join(root, "products", "bos", "product.json"));
const bosConnector = codexConnectorContract(bosProduct);
const appId = bosConnector.id;
const retiredAppId = bosConnector.retired_ids[0];

async function fixtureHome(context) {
  const home = await mkdtemp(join(tmpdir(), "bos-cache-reset-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const codexCache = join(home, ".codex/plugins/cache/bos-education-center");
  const claudeCache = join(home, ".claude/plugins/cache/bos-education-center");
  for (const [clientRoot, client] of [
    [codexCache, undefined],
    [claudeCache, "claude"]
  ]) {
    for (const product of ["bos", "education-center"]) {
      const version = join(clientRoot, product, "0.4.55");
      await mkdir(version, { recursive: true });
      await writeFile(join(version, ".bos-product.json"), JSON.stringify({ name: product, client }));
    }
  }
  const suffix = appId.replace(/^plugin_asdk_app_/, "");
  const wrapper = join(home, ".codex/plugins/cache/created-by-me-remote", `dev-${suffix}`);
  await mkdir(wrapper, { recursive: true });
  await writeFile(join(wrapper, ".codex-remote-plugin-install.json"), JSON.stringify({
    remote_plugin_id: appId
  }));
  const retiredWrapper = join(
    home,
    ".codex/plugins/cache/created-by-me-remote",
    `dev-${retiredAppId.replace(/^asdk_app_/, "")}`
  );
  await mkdir(retiredWrapper, { recursive: true });
  await writeFile(join(retiredWrapper, ".codex-remote-plugin-install.json"), JSON.stringify({
    remote_plugin_id: `plugin_${retiredAppId}`
  }));
  const matchingCatalog = join(home, ".codex/cache/codex_apps_tools/bos.json");
  const unrelatedCatalog = join(home, ".codex/cache/codex_apps_tools/unrelated.json");
  await mkdir(join(matchingCatalog, ".."), { recursive: true });
  await writeFile(matchingCatalog, JSON.stringify({ url: bosProduct.mcp_resource_url }));
  await writeFile(unrelatedCatalog, JSON.stringify({ url: "https://example.com/mcp" }));

  const preserved = [
    join(home, "source-repository/.agents/plugins/marketplace.json"),
    join(home, "source-repository/.claude-plugin/marketplace.json"),
    join(home, ".codex/skills/partnership-proposal-builder/SKILL.md"),
    join(home, ".codex/.codex-global-state.json"),
    join(home, ".claude/plugins/marketplaces/bos-education-center/marketplace.json"),
    join(home, ".gemini/extensions/bos/gemini-extension.json"),
    join(home, "copilot-project/.github/mcp.json"),
    join(home, "Library/Caches/ai.dfsm.bos/document.json")
  ];
  for (const path of preserved) {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, `preserve:${path}\n`);
  }
  return {
    home,
    codexCache,
    claudeCache,
    wrapper,
    retiredWrapper,
    matchingCatalog,
    unrelatedCatalog,
    preserved
  };
}

test("cache reset removes only validated ChatGPT/Codex and Claude cache artifacts", async (context) => {
  const fixture = await fixtureHome(context);
  const report = await resetBosClientCaches({
    confirmation: CACHE_RESET_CONFIRMATION,
    home: fixture.home
  });
  assert.equal(report.ok, true);
  assert.equal(report.scope, "local_chatgpt_codex_and_claude_caches_only");
  for (const path of [
    fixture.codexCache,
    fixture.claudeCache,
    fixture.wrapper,
    fixture.retiredWrapper,
    fixture.matchingCatalog
  ]) assert.equal(await pathExists(path), false, path);
  assert.equal(await pathExists(fixture.unrelatedCatalog), true);
  for (const path of fixture.preserved) {
    assert.equal(await pathExists(path), true, path);
    assert.equal((await readFile(path, "utf8")).startsWith("preserve:"), true);
  }
});

test("dry run enumerates the bounded cache targets without changing files", async (context) => {
  const fixture = await fixtureHome(context);
  const report = await resetBosClientCaches({ home: fixture.home, dryRun: true });
  assert.equal(report.ok, true);
  assert(report.actions.every((action) => action.startsWith("remove_cache:")));
  assert.equal(await pathExists(fixture.codexCache), true);
  assert.equal(await pathExists(fixture.claudeCache), true);
  for (const path of fixture.preserved) assert.equal(await pathExists(path), true);
});

test("cache reset requires exact destructive confirmation", async () => {
  await assert.rejects(
    resetBosClientCaches({ confirmation: "yes" }),
    /Confirmation must equal/
  );
});

test("cache reset refuses an unverified product directory before any deletion", async (context) => {
  const fixture = await fixtureHome(context);
  await rm(join(fixture.claudeCache, "bos/0.4.55/.bos-product.json"));
  await assert.rejects(
    planBosClientCacheReset({ home: fixture.home }),
    /Refusing unverified package cache/
  );
  assert.equal(await pathExists(fixture.codexCache), true);
  assert.equal(await pathExists(fixture.wrapper), true);
});

test("cache reset refuses unrelated content inside the dedicated BOS cache", async (context) => {
  const fixture = await fixtureHome(context);
  const unrelated = join(fixture.codexCache, "unrelated-plugin/data.json");
  await mkdir(join(unrelated, ".."), { recursive: true });
  await writeFile(unrelated, "preserve\n");
  await assert.rejects(
    planBosClientCacheReset({ home: fixture.home }),
    /Refusing unexpected package-cache entry/
  );
  assert.equal(await pathExists(unrelated), true);
  assert.equal(await pathExists(fixture.claudeCache), true);
});

test("cache reset refuses the filesystem root as a home", async () => {
  await assert.rejects(planBosClientCacheReset({ home: "/" }), /filesystem root/);
});
