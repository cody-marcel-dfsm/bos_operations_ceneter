import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readJson, root } from "../scripts/lib/package-model.mjs";
import { verifyCodexLoginEvidence } from "../scripts/verify-codex-login-evidence.mjs";

const pluginRoot = join(root, "clients", "codex", "plugins", "bos");
const product = await readJson(join(root, "products", "bos", "product.json"));

test("BOS Codex package derives authentication from its bundled MCP resource", async () => {
  const plugin = JSON.parse(await readFile(join(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
  const mcp = JSON.parse(await readFile(join(pluginRoot, ".mcp.json"), "utf8"));
  assert.equal(plugin.mcpServers, "./.mcp.json");
  assert.equal("apps" in plugin, false);
  assert.deepEqual(mcp, {
    mcpServers: {
      platform: { type: "http", url: "https://dfsm.ai/mcp/apps/bos/platform" }
    }
  });
  await assert.rejects(access(join(pluginRoot, ".app.json")));
});
test("Codex login evidence remains pending without native UI evidence", async () => {
  const report = await verifyCodexLoginEvidence();
  assert.equal(report.ok, false);
  assert.equal(report.oauth_authorization_endpoint, "https://dfsm.ai/api/v1/mcp/oauth/authorize");
  assert.equal(/openai|chatgpt/i.test(JSON.stringify(report.package_binding)), false);
  assert.match(report.failure, /screenshot is missing/);
});
test("Codex login evidence accepts a matching screenshot and Oracle receipt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-codex-login-"));
  const screenshot = join(directory, `${product.version}-connect-button.png`);
  const review = join(directory, `${product.version}-connect-button.review.json`);
  const image = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(2048)
  ]);
  await writeFile(screenshot, image);
  await writeFile(review, JSON.stringify({
    schema_version: "1",
    product_version: product.version,
    screenshot: `${product.version}-connect-button.png`,
    screenshot_sha256: createHash("sha256").update(image).digest("hex"),
    surface: "GPT_PLUGIN_DETAIL",
    visible_action: "Connect",
    observed_authorization_target: "https://dfsm.ai/api/v1/mcp/oauth/authorize",
    reviewer: "ORACLE",
    verdict: "APPROVED"
  }));
  const report = await verifyCodexLoginEvidence({ screenshot, review });
  assert.equal(report.ok, true);
  assert.equal(report.visible_action, "Connect");
  assert.equal(report.observed_authorization_target, "https://dfsm.ai/api/v1/mcp/oauth/authorize");
});
test("Codex login evidence rejects an OpenAI authorization target", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-codex-login-wrong-target-"));
  const screenshot = join(directory, `${product.version}-connect-button.png`);
  const review = join(directory, `${product.version}-connect-button.review.json`);
  const image = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(2048)
  ]);
  await writeFile(screenshot, image);
  await writeFile(review, JSON.stringify({
    schema_version: "1",
    product_version: product.version,
    screenshot: `${product.version}-connect-button.png`,
    screenshot_sha256: createHash("sha256").update(image).digest("hex"),
    surface: "GPT_PLUGIN_DETAIL",
    visible_action: "Connect",
    observed_authorization_target: "https://auth.openai.com/about-you",
    reviewer: "ORACLE",
    verdict: "APPROVED"
  }));
  const report = await verifyCodexLoginEvidence({ screenshot, review });
  assert.equal(report.ok, false);
  assert.equal(report.observed_authorization_target, null);
  assert.match(report.failure, /exact BOS authorization target/);
});
