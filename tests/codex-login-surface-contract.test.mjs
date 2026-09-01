import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { root } from "../scripts/lib/package-model.mjs";

const durableBosAppId = "asdk_app_6a932992592081919cdc88c60e4ff2dd";
const bosResourceUrl = "https://dfsm.ai/mcp/apps/bos/platform";
const pluginRoot = join(root, "clients", "codex", "plugins", "bos");

test("Codex BOS plugin declares the registered app that renders Login", async () => {
  const product = JSON.parse(await readFile(
    join(root, "products", "bos", "product.json"),
    "utf8"
  ));
  const plugin = JSON.parse(await readFile(
    join(pluginRoot, ".codex-plugin", "plugin.json"),
    "utf8"
  ));
  const app = JSON.parse(await readFile(join(pluginRoot, ".app.json"), "utf8"));

  assert.equal(product.codex_app_id, durableBosAppId);
  assert.equal(plugin.apps, "./.app.json");
  assert.equal(plugin.mcpServers, undefined);
  assert.deepEqual(app, {
    apps: {
      bos: {
        id: durableBosAppId,
        required: true
      }
    }
  });
  await assert.rejects(access(join(pluginRoot, ".mcp.json")), /ENOENT/);
});

test("Codex BOS Login surface cannot regress to an optional app dependency", async () => {
  const app = JSON.parse(await readFile(join(pluginRoot, ".app.json"), "utf8"));

  assert.equal(app.apps.bos.required, true);
  assert.deepEqual(Object.keys(app.apps.bos).sort(), ["id", "required"]);
});

test("Codex Login display binding remains independent from server OAuth discovery", async () => {
  const contract = JSON.parse(await readFile(
    join(root, "contracts", "single-bos-mcp-connection.v1.json"),
    "utf8"
  ));
  const runtime = JSON.parse(await readFile(
    join(root, "source", "runtime", "bos", ".mcp.json"),
    "utf8"
  ));

  assert.equal(contract.codex_app_id, durableBosAppId);
  assert.equal(contract.codex_app_required, true);
  assert(contract.connection_artifacts.includes(
    "clients/codex/plugins/bos/.app.json"
  ));
  assert(!contract.connection_artifacts.includes(
    "clients/codex/plugins/bos/.mcp.json"
  ));
  assert.equal(runtime.mcpServers.bos.url, bosResourceUrl);
});
