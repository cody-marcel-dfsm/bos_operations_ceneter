import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { root } from "../scripts/lib/package-model.mjs";

const bosResourceUrl = "https://dfsm.ai/mcp/apps/bos/platform";
const pluginRoot = join(root, "clients", "codex", "plugins", "bos");

test("Codex BOS plugin declares one portable package-owned MCP server", async () => {
  const product = JSON.parse(await readFile(
    join(root, "products", "bos", "product.json"),
    "utf8"
  ));
  const plugin = JSON.parse(await readFile(
    join(pluginRoot, ".codex-plugin", "plugin.json"),
    "utf8"
  ));
  const mcp = JSON.parse(await readFile(join(pluginRoot, ".mcp.json"), "utf8"));

  assert.equal(product.codex_app_id, undefined);
  assert.equal(plugin.mcpServers, "./.mcp.json");
  assert.equal(plugin.apps, undefined);
  assert.deepEqual(mcp, {
    mcpServers: {
      platform: {
        type: "http",
        url: bosResourceUrl
      }
    }
  });
  await assert.rejects(access(join(pluginRoot, ".app.json")), /ENOENT/);
});

test("Codex package never embeds credentials or account-scoped app IDs", async () => {
  const content = await readFile(join(pluginRoot, ".mcp.json"), "utf8");
  assert.doesNotMatch(content, /authorization|bearer_token_env_var|asdk_app_/i);
});

test("Codex package and portable contract use the same root resource", async () => {
  const contract = JSON.parse(await readFile(
    join(root, "contracts", "single-bos-mcp-connection.v1.json"),
    "utf8"
  ));
  const runtime = JSON.parse(await readFile(
    join(root, "source", "runtime", "bos", ".mcp.json"),
    "utf8"
  ));

  assert.equal(contract.codex_app_id, undefined);
  assert(contract.connection_artifacts.includes(
    "clients/codex/plugins/bos/.mcp.json"
  ));
  assert(!contract.connection_artifacts.includes(
    "clients/codex/plugins/bos/.app.json"
  ));
  assert.equal(runtime.mcpServers.bos.url, bosResourceUrl);
});
