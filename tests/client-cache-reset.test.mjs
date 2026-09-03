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
