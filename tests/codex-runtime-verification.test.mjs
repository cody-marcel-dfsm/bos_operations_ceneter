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
    mcpServers: { "BOS-Platform": {
      type: "http",
      url: "https://dfsm.ai/mcp/apps/bos/platform",
      oauth_resource: "https://dfsm.ai/mcp/apps/bos/platform",
      required: false,
      startup_timeout_sec: 180,
      tool_timeout_sec: 180
    } }
  }));
  const catalog = join(home, "catalog.json");
  const runtimeProducts = await Promise.all(["bos", "education-center"].map(name => readJson(join(root, "products", name, "product.json"))));
  await writeFile(catalog, JSON.stringify({tools: [...new Set(runtimeProducts.flatMap(p => p.runtime_verification_tools))].map(name => ({name}))}));

  let nativeServers = [{name:"BOS-Platform",enabled:true,transport:{url:"https://dfsm.ai/mcp/apps/bos/platform"}}];
  const runCommand = async (_command, args) => {
    if (args[0] === "mcp") return {stdout: JSON.stringify(nativeServers)};
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
  await writeFile(join(education, ".bos-product.json"), JSON.stringify(await readJson(join(root, "clients/codex/plugins/education-center/.bos-product.json"))));
  const report = await inspectCodexRuntime({ home, runCommand, catalogPath: catalog });
  assert.equal(report.ok, true, JSON.stringify(report.failures));
  assert.equal(report.mcp_binding.state, "current");
  assert.equal(report.mcp_binding.server.url, "https://dfsm.ai/mcp/apps/bos/platform");
  assert.equal(report.mcp_binding.server.oauth_resource, "https://dfsm.ai/mcp/apps/bos/platform");
  assert.equal(report.mcp_binding.server.required, false);
  assert.equal(report.mcp_binding.server.startup_timeout_sec, 180);
  assert.equal(report.live_tool_surface.semantics, "operation_schema_only");
  assert.equal(report.live_tool_surface.authorization_source, "tools_call_server_result");
  nativeServers.push({...nativeServers[0], name:"platform"});
  const duplicate = await inspectCodexRuntime({home, runCommand, catalogPath: catalog});
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.failures.some(message => message.includes("exactly one current host binding")));
  nativeServers = nativeServers.slice(0, 1);
  await writeFile(join(education, ".mcp.json"), JSON.stringify({mcpServers:{"education-center":{type:"http",url:"https://dfsm.ai/mcp/apps/leaddirector/education-center"}}}));
  const stale = await inspectCodexRuntime({home, runCommand, catalogPath: catalog});
  assert.equal(stale.ok, false);
  assert.ok(stale.failures.includes("education-center: dependent_transport"));
});
