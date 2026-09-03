import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readJson, root } from "../scripts/lib/package-model.mjs";
import { inspectCodexRuntime } from "../scripts/verify-codex-runtime.mjs";

test("Codex runtime verifier requires the package-owned MCP binding", async () => {
  const currentVersion = (await readJson(join(root, "products", "bos", "product.json"))).version;
  const home = await mkdtemp(join(tmpdir(), "bos-runtime-"));
  const source = join(home, "source", "bos");
  await mkdir(join(source, ".codex-plugin"), { recursive: true });
  await writeFile(join(source, ".bos-product.json"), JSON.stringify({
    name: "bos", client: "codex", version: currentVersion
  }));
  await writeFile(join(source, ".codex-plugin/plugin.json"), JSON.stringify({
    name: "bos", version: currentVersion, mcpServers: "./.mcp.json"
  }));
  await writeFile(join(source, ".mcp.json"), JSON.stringify({
    mcpServers: { platform: { type: "http", url: "https://dfsm.ai/mcp/apps/bos/platform" } }
  }));
  const catalog = join(home, "catalog.json");
  await writeFile(catalog, JSON.stringify({ tools: [
    "bos_get_authorization_status", "bos_apply_plugin_settings",
    "bos_begin_plugin_service_connection", "bos_get_context",
    "bos_get_plugin_setting_changes", "bos_get_plugin_settings",
    "bos_list_plugin_services", "bos_prepare_plugin_settings",
    "bos_resume_operation", "bos_set_plugin_enabled"
  ].map((name) => ({ name })) }));
  const runCommand = async (_command, args) => {
    if (args[1] === "list" && args[0] === "plugin") return { stdout: JSON.stringify({
      installed: [
        { pluginId: "bos@bos-education-center", installed: true, enabled: true, version: currentVersion, source: { path: source } },
        { pluginId: "education-center@bos-education-center", installed: true, enabled: true, version: currentVersion, source: { path: join(home, "source", "education-center") } }
      ]
    }) };
    return { stdout: JSON.stringify({ marketplaces: [{ name: "bos-education-center" }] }) };
  };
  const education = join(home, "source", "education-center");
  await mkdir(education, { recursive: true });
  await writeFile(join(education, ".bos-product.json"), JSON.stringify({
    name: "education-center", client: "codex", version: currentVersion
  }));
  const report = await inspectCodexRuntime({ home, runCommand, catalogPath: catalog });
  assert.equal(report.mcp_binding.state, "current");
  assert.equal(report.mcp_binding.server.url, "https://dfsm.ai/mcp/apps/bos/platform");
});
