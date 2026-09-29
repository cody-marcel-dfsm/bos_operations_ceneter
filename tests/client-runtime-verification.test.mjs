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
const myCrmTools = [
  "lead_director_create_lead",
  "lead_director_search_leads",
  "lead_director_update_lead",
  "lead_director_get_customer_journey"
];

async function createMyCrmPackage(path, { tools = myCrmTools } = {}) {
  for (const skill of ["my-crm-record-operations", "my-crm-customer-journey"]) {
    await mkdir(join(path, "skills", skill), { recursive: true });
    await writeFile(join(path, "skills", skill, "SKILL.md"), `---\nname: ${skill}\n---\n`);
  }
  await mkdir(join(path, "skills", "my-crm-customer-journey", "references"), {
    recursive: true
  });
  await writeFile(
    join(path, "skills", "my-crm-customer-journey", "references", "journey.md"),
    "# Journey contract\n"
  );
  await writeFile(join(path, ".bos-product.json"), JSON.stringify({
    schema_version: "2",
    name: "my-crm",
    version: "0.2.26",
    runtime_verification_tools: tools
  }));
}

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
  const myCrmPath = join(home, "active", "my-crm");
  await createMyCrmPackage(myCrmPath);
  entries.push({
    id: "my-crm@my-crm-local",
    scope: "user",
    enabled: true,
    version: "0.2.26",
    installPath: myCrmPath
  });
  const runCommand = async (_command, args) => ({ stdout: args[1] === "list" && args[2] === "--json"
    ? JSON.stringify(entries)
    : JSON.stringify([{ name: "bos-education-center" }]) });
  const report = await inspectClaudeRuntime({ home, runCommand });
  assert.equal(report.ok, true);
  assert.deepEqual(report.retained_cache_versions.bos, ["0.1.0"]);

  entries.at(-1).enabled = false;
  const disabledDependency = await inspectClaudeRuntime({ home, runCommand });
  assert.equal(disabledDependency.ok, false);
  assert.match(disabledDependency.failures.join("\n"), /independent product my-crm is missing: product_disabled/);
  entries.at(-1).enabled = true;
  await writeFile(join(myCrmPath, ".bos-product.json"), JSON.stringify({
    name: "my-crm", version: "0.2.25", runtime_verification_tools: myCrmTools.slice(0, -1)
  }));
  const downgradedDependency = await inspectClaudeRuntime({ home, runCommand });
  assert.equal(downgradedDependency.ok, false);
  assert.match(downgradedDependency.failures.join("\n"), /independent product my-crm is outdated/);
  await createMyCrmPackage(myCrmPath);

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
  let nativeExtensions = [];
  const nativeCalls = [];
  const runCommand = async (command, args) => {
    nativeCalls.push([command, ...args]);
    return { stdout: JSON.stringify({ extensions: nativeExtensions }) };
  };
  for (const product of ["bos", "education-center"]) {
    const source = join(root, "clients", "gemini", "extensions", product);
    const installed = join(home, ".gemini", "extensions", product);
    await cp(source, installed, { recursive: true });
    await writeFile(join(installed, ".gemini-extension-install.json"), JSON.stringify({ type: "link" }));
  }
  assert.equal((await inspectGeminiRuntime({ home, runCommand })).ok, false);
  const myCrmPath = join(home, ".gemini", "extensions", "my-crm");
  await createMyCrmPackage(myCrmPath);
  assert.deepEqual(nativeCalls.at(-1), [
    "gemini", "extensions", "list", "--output-format", "json"
  ]);
  nativeExtensions = [{ name: "my-crm", isActive: false, path: myCrmPath }];
  const disabled = await inspectGeminiRuntime({ home, runCommand });
  assert.equal(disabled.ok, false);
  assert.match(disabled.failures.join("\n"), /product_disabled/);
  nativeExtensions[0].isActive = true;
  assert.equal((await inspectGeminiRuntime({ home, runCommand })).ok, true);
  const staleBinding = join(home, ".gemini/extensions/education-center/mcp_config.json");
  await writeFile(staleBinding, JSON.stringify({mcpServers:{"education-center":{serverUrl:"https://dfsm.ai/mcp/apps/leaddirector/education-center"}}}));
  const duplicate = await inspectGeminiRuntime({home, runCommand});
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.failures.join("\n"), /dependent_transport/);
  await rm(staleBinding);
  await writeFile(
    join(home, ".gemini", "extensions", "education-center", "README.md"),
    "stale\n"
  );
  const report = await inspectGeminiRuntime({ home, runCommand });
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
  assert.equal((await inspectAntigravityRuntime({ home })).ok, false);
  const myCrmPath = join(home, "my-crm");
  await createMyCrmPackage(myCrmPath);
  await symlink(myCrmPath, join(plugins, "my-crm"));
  assert.equal((await inspectAntigravityRuntime({ home })).ok, true);
  await rm(join(plugins, "my-crm"));
  await cp(myCrmPath, join(plugins, "my-crm"), { recursive: true });
  const unregistered = await inspectAntigravityRuntime({ home });
  assert.equal(unregistered.ok, false);
  assert.match(unregistered.failures.join("\n"), /not registered as a plugin symlink/);
  await rm(join(plugins, "my-crm"), { recursive: true });
  await symlink(myCrmPath, join(plugins, "my-crm"));
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
  const missingDependency = await inspectCopilotRuntime({ target });
  assert.equal(missingDependency.ok, false);
  const myCrmPath = join(target, "installed-products", "my-crm");
  await createMyCrmPackage(myCrmPath);
  for (const skill of ["my-crm-record-operations", "my-crm-customer-journey"]) {
    await cp(join(myCrmPath, "skills", skill), join(target, ".github", "skills", skill), {
      recursive: true
    });
  }
  const verifierOptions = {
    target,
    independentProductRoots: { "my-crm": myCrmPath }
  };
  const current = await inspectCopilotRuntime(verifierOptions);
  assert.equal(current.ok, true);
  assert.equal(current.configuration_model, "repository-files-no-package-cache");
  const crmRecordSkill = join(target, ".github", "skills", "my-crm-record-operations", "SKILL.md");
  await writeFile(crmRecordSkill, "---\nname: my-crm-record-operations\n---\nstale\n");
  const staleDependencySkill = await inspectCopilotRuntime(verifierOptions);
  assert.equal(staleDependencySkill.ok, false);
  assert.match(staleDependencySkill.failures.join("\n"), /independent product my-crm skill.*stale installed file/);
  await cp(
    join(myCrmPath, "skills", "my-crm-record-operations", "SKILL.md"),
    crmRecordSkill
  );
  const crmJourneyReference = join(
    target, ".github", "skills", "my-crm-customer-journey", "references", "journey.md"
  );
  await rm(crmJourneyReference);
  const missingDependencyReference = await inspectCopilotRuntime(verifierOptions);
  assert.equal(missingDependencyReference.ok, false);
  assert.match(missingDependencyReference.failures.join("\n"), /independent product my-crm skill.*missing installed file/);
  await cp(
    join(myCrmPath, "skills", "my-crm-customer-journey", "references", "journey.md"),
    crmJourneyReference
  );
  const mcpPath = join(target, ".github/mcp.json");
  const mcp = await readJson(mcpPath);
  mcp.mcpServers.unrelated = {type:"http",url:"https://example.test/other"};
  await writeFile(mcpPath, JSON.stringify(mcp));
  assert.equal((await inspectCopilotRuntime(verifierOptions)).ok, true);
  mcp.mcpServers.platform = {...mcp.mcpServers["BOS-Platform"]};
  await writeFile(mcpPath, JSON.stringify(mcp));
  const alias = await inspectCopilotRuntime(verifierOptions);
  assert.equal(alias.ok, false);
  assert.match(alias.failures.join("\n"), /superseded BOS host binding remains: platform/);
  delete mcp.mcpServers.platform;
  mcp.mcpServers["education-center"] = {type:"http",url:"https://dfsm.ai/mcp/apps/leaddirector/education-center"};
  await writeFile(mcpPath, JSON.stringify(mcp));
  const duplicate = await inspectCopilotRuntime(verifierOptions);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.failures.join("\n"), /retired dependent MCP connection/);
  delete mcp.mcpServers["education-center"];
  await writeFile(mcpPath, JSON.stringify(mcp));
  const vscodePath = join(target, ".vscode/mcp.json");
  await mkdir(join(target, ".vscode"));
  await writeFile(vscodePath, JSON.stringify({servers:{...mcp.mcpServers,
    "education-center":{type:"http",url:"https://dfsm.ai/mcp/apps/leaddirector/education-center"}
  }}));
  const dual = await inspectCopilotRuntime(verifierOptions);
  assert.equal(dual.ok, false);
  assert.match(dual.failures.join("\n"), /\.vscode.*retired dependent MCP connection/);
  await writeFile(vscodePath, JSON.stringify({servers:mcp.mcpServers}));
  assert.equal((await inspectCopilotRuntime(verifierOptions)).ok, true);
  const skill = join(target, ".github", "skills", "education-center-student-operations", "SKILL.md");
  await writeFile(skill, `${await readFile(skill, "utf8")}\nstale\n`);
  assert.equal((await inspectCopilotRuntime(verifierOptions)).ok, false);
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
