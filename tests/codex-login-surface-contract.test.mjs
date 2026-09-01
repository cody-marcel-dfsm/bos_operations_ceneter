import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { root } from "../scripts/lib/package-model.mjs";

const provenBosAppId = "plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91";
const bosResourceUrl = "https://dfsm.ai/mcp/apps/bos/platform";
const pluginRoot = join(root, "clients", "codex", "plugins", "bos");

test("Codex BOS plugin preserves the proven required app binding that renders Login", async () => {
  const product = JSON.parse(await readFile(
    join(root, "products", "bos", "product.json"),
    "utf8"
  ));
  const plugin = JSON.parse(await readFile(
    join(pluginRoot, ".codex-plugin", "plugin.json"),
    "utf8"
  ));
  const app = JSON.parse(await readFile(join(pluginRoot, ".app.json"), "utf8"));

  assert.equal(product.codex_app_id, provenBosAppId);
  assert.equal(plugin.apps, "./.app.json");
  assert.equal(plugin.mcpServers, undefined);
  assert.deepEqual(app, {
    apps: {
      bos: {
        id: provenBosAppId,
        required: true
      }
    }
  });
  await assert.rejects(access(join(pluginRoot, ".mcp.json")), /ENOENT/);
});

test("Codex Login cannot regress to direct-MCP-only or optional app packaging", async () => {
  const app = JSON.parse(await readFile(join(pluginRoot, ".app.json"), "utf8"));
  const content = JSON.stringify(app);

  assert.equal(app.apps.bos.required, true);
  assert.deepEqual(Object.keys(app.apps.bos).sort(), ["id", "required"]);
  assert.doesNotMatch(content, /authorization|bearer_token_env_var/i);
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

  assert.equal(contract.codex_app_id, provenBosAppId);
  assert.equal(contract.codex_app_required, true);
  assert(contract.connection_artifacts.includes(
    "clients/codex/plugins/bos/.app.json"
  ));
  assert(!contract.connection_artifacts.includes(
    "clients/codex/plugins/bos/.mcp.json"
  ));
  assert.equal(runtime.mcpServers.bos.url, bosResourceUrl);
});

test("Codex Login release acceptance includes a version-matched GPT UI screenshot", async () => {
  const product = JSON.parse(await readFile(
    join(root, "products", "bos", "product.json"),
    "utf8"
  ));
  const evidencePath = join(
    root,
    "Vault",
    "evidence",
    "codex-login",
    `${product.version}-connect-button.png`
  );
  const evidence = await readFile(evidencePath);

  assert(evidence.length > 1024, "Login screenshot evidence is unexpectedly small");
  assert.deepEqual(
    [...evidence.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "Login acceptance evidence must be a PNG screenshot"
  );
});
