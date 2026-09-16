import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectAntigravityRuntime } from "../scripts/verify-antigravity-runtime.mjs";
import { inspectClaudeRuntime } from "../scripts/verify-claude-runtime.mjs";
import { inspectCopilotRuntime } from "../scripts/verify-copilot-runtime.mjs";
import { inspectGeminiRuntime } from "../scripts/verify-gemini-runtime.mjs";
import { readJson, root } from "../scripts/lib/package-model.mjs";

const releaseVersion = (await readJson(join(root, "products", "bos", "product.json"))).version;

async function sandboxHome(context, prefix) {
  const path = await mkdtemp(join(tmpdir(), prefix));
  context.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("Claude verifier follows active installPath and reports retained versions separately", async (context) => {
  const home = await sandboxHome(context, "bos-claude-verify-");
  const entries = [];
  for (const product of ["bos", "education-center"]) {
    const installPath = join(home, "active", product);
    await cp(join(root, "clients", "claude", "plugins", product), installPath, { recursive: true });
    await mkdir(join(home, ".claude", "plugins", "cache", "bos-education-center", product, "0.1.0"), { recursive: true });
    entries.push({
      id: `${product}@bos-education-center`,
      scope: "user",
      enabled: true,
      version: releaseVersion,
      installPath
    });
  }
  const runCommand = async (_command, args) => ({ stdout: args[1] === "list" && args[2] === "--json"
    ? JSON.stringify(entries)
    : JSON.stringify([{ name: "bos-education-center" }]) });
  const report = await inspectClaudeRuntime({ home, runCommand });
  assert.equal(report.ok, true);
  assert.deepEqual(report.retained_cache_versions.bos, ["0.1.0"]);

  const legacyConnector = join(entries[1].installPath, "CONNECTORS.md");
  await writeFile(legacyConnector, "retired Education Center connector");
  const duplicate = await inspectClaudeRuntime({home, runCommand});
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.failures.join("\n"), /dependent_transport/);
  await rm(legacyConnector);
  entries[0].version = "0.4.50";
  const stale = await inspectClaudeRuntime({ home, runCommand });
  assert.equal(stale.ok, false);
  assert.match(stale.failures.join("\n"), /active version=0\.4\.50/);
});

test("Gemini verifier detects byte-for-byte drift in copied extensions", async (context) => {
  const home = await sandboxHome(context, "bos-gemini-verify-");
  for (const product of ["bos", "education-center"]) {
    const source = join(root, "clients", "gemini", "extensions", product);
    const installed = join(home, ".gemini", "extensions", product);
    await cp(source, installed, { recursive: true });
    await writeFile(join(installed, ".gemini-extension-install.json"), JSON.stringify({ type: "link" }));
  }
  assert.equal((await inspectGeminiRuntime({ home })).ok, true);
  const staleBinding = join(home, ".gemini/extensions/education-center/mcp_config.json");
  await writeFile(staleBinding, JSON.stringify({mcpServers:{"education-center":{serverUrl:"https://dfsm.ai/mcp/apps/leaddirector/education-center"}}}));
  const duplicate = await inspectGeminiRuntime({home});
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.failures.join("\n"), /dependent_transport/);
  await rm(staleBinding);
  await writeFile(
    join(home, ".gemini", "extensions", "education-center", "README.md"),
    "stale\n"
  );
  const report = await inspectGeminiRuntime({ home });
  assert.equal(report.ok, false);
  assert.match(report.failures.join("\n"), /stale installed file/);
});

test("Antigravity verifier requires exact current repository symlinks", async (context) => {
  const home = await sandboxHome(context, "bos-antigravity-verify-");
  const plugins = join(home, ".gemini", "config", "plugins");
  await mkdir(plugins, { recursive: true });
  for (const product of ["bos", "education-center"]) {
    await symlink(join(root, "clients", "gemini", "extensions", product), join(plugins, product));
  }
  assert.equal((await inspectAntigravityRuntime({ home })).ok, true);
  await rm(join(plugins, "bos"));
  await mkdir(join(plugins, "bos"));
  const report = await inspectAntigravityRuntime({ home });
  assert.equal(report.ok, false);
  assert.match(report.failures.join("\n"), /not a symlink/);
});

test("Copilot verifier checks product files directly and declares no package cache", async (context) => {
  const target = await sandboxHome(context, "bos-copilot-verify-");
  await mkdir(join(target, ".github"), { recursive: true });
  await cp(
    join(root, "clients", "copilot", "products", "bos", ".github", "mcp.json"),
    join(target, ".github", "mcp.json")
  );
  await cp(
    join(root, "clients", "copilot", "products", "education-center", "skills"),
    join(target, ".github", "skills"),
    { recursive: true }
  );
  const current = await inspectCopilotRuntime({ target });
  assert.equal(current.ok, true);
  assert.equal(current.configuration_model, "repository-files-no-package-cache");
  const mcpPath = join(target, ".github/mcp.json");
  const mcp = await readJson(mcpPath);
  mcp.mcpServers.unrelated = {type:"http",url:"https://example.test/other"};
  await writeFile(mcpPath, JSON.stringify(mcp));
  assert.equal((await inspectCopilotRuntime({target})).ok, true);
  mcp.mcpServers.platform = {...mcp.mcpServers["BOS-Platform"]};
  await writeFile(mcpPath, JSON.stringify(mcp));
  const alias = await inspectCopilotRuntime({target});
  assert.equal(alias.ok, false);
  assert.match(alias.failures.join("\n"), /superseded BOS host binding remains: platform/);
  delete mcp.mcpServers.platform;
  mcp.mcpServers["education-center"] = {type:"http",url:"https://dfsm.ai/mcp/apps/leaddirector/education-center"};
  await writeFile(mcpPath, JSON.stringify(mcp));
  const duplicate = await inspectCopilotRuntime({target});
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.failures.join("\n"), /retired dependent MCP connection/);
  delete mcp.mcpServers["education-center"];
  await writeFile(mcpPath, JSON.stringify(mcp));
  const vscodePath = join(target, ".vscode/mcp.json");
  await mkdir(join(target, ".vscode"));
  await writeFile(vscodePath, JSON.stringify({servers:{...mcp.mcpServers,
    "education-center":{type:"http",url:"https://dfsm.ai/mcp/apps/leaddirector/education-center"}
  }}));
  const dual = await inspectCopilotRuntime({target});
  assert.equal(dual.ok, false);
  assert.match(dual.failures.join("\n"), /\.vscode.*retired dependent MCP connection/);
  await writeFile(vscodePath, JSON.stringify({servers:mcp.mcpServers}));
  assert.equal((await inspectCopilotRuntime({target})).ok, true);
  const skill = join(target, ".github", "skills", "education-center-student-operations", "SKILL.md");
  await writeFile(skill, `${await readFile(skill, "utf8")}\nstale\n`);
  assert.equal((await inspectCopilotRuntime({ target })).ok, false);
});

test("Copilot verifier accepts the VS Code MCP layout and .agents skills", async (context) => {
  const target = await sandboxHome(context, "bos-copilot-vscode-");
  await mkdir(join(target, ".vscode"), { recursive: true });
  await cp(
    join(root, "clients", "copilot", "products", "bos", ".github", "mcp.json"),
    join(target, ".vscode", "mcp.json")
  );
  await cp(
    join(root, "clients", "copilot", "products", "bos", "skills"),
    join(target, ".agents", "skills"),
    { recursive: true }
  );
  const report = await inspectCopilotRuntime({ target, product: "bos" });
  assert.equal(report.ok, true);
  assert.match(report.mcp_path, /\.vscode\/mcp\.json$/);
  assert.match(report.skills_root, /\.agents\/skills$/);
});
