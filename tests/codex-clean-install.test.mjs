import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CODEX_CLEAN_CONFIRMATION,
  cleanInstallCodex,
  planCodexCleanup
} from "../scripts/clean-install-codex.mjs";
import { pathExists, readJson, root } from "../scripts/lib/package-model.mjs";

const currentVersion = (await readJson(join(root, "products", "bos", "product.json"))).version;

test("Codex cleanup removes only local BOS installs and package cache", async () => {
  const home = await mkdtemp(join(tmpdir(), "bos-codex-clean-"));
  for (const product of ["bos", "education-center"]) {
    const dir = join(home, ".codex/plugins/cache/bos-education-center", product, currentVersion);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, ".bos-product.json"), JSON.stringify({ name: product, client: "codex" }));
  }
  const commands = [];
  const runCommand = async (_command, args) => {
    commands.push(args);
    if (args[1] === "list") return { stdout: JSON.stringify({ installed: [
      { pluginId: "bos@bos-education-center" },
      { pluginId: "education-center@bos-education-center" }
    ] }) };
    return { stdout: "{}" };
  };
  const plan = await planCodexCleanup({ home });
  const report = await cleanInstallCodex({ home, confirmation: CODEX_CLEAN_CONFIRMATION, runCommand });
  assert.equal(report.ok, true);
  assert.equal(await pathExists(plan.package_cache), false);
  assert.equal(commands.filter((args) => args[1] === "remove").length, 2);
  assert.equal(commands.some((args) => args.includes("marketplace")), false);
});
test("Codex cleanup requires exact destructive confirmation", async () => {
  await assert.rejects(cleanInstallCodex({ confirmation: "wrong" }), /Confirmation must equal/);
});
