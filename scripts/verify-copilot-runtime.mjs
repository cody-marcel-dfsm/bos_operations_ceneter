import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { activeClientProducts, compareTrees } from "./lib/client-runtime-verification.mjs";
import { pathExists, readJson, root, stableJson } from "./lib/package-model.mjs";

export async function inspectCopilotRuntime({ target, product = "education-center", base = root } = {}) {
  if (!target) throw new Error("Copilot verification requires --target <repository>");
  const products = await activeClientProducts("copilot");
  const selected = products.find((candidate) => candidate.name === product);
  if (!selected) throw new Error(`Unknown active Copilot product: ${product}`);
  const failures = [];
  const githubMcpPath = join(target, ".github", "mcp.json");
  const vscodeMcpPath = join(target, ".vscode", "mcp.json");
  const mcpPath = await pathExists(githubMcpPath)
    ? githubMcpPath
    : await pathExists(vscodeMcpPath) ? vscodeMcpPath : githubMcpPath;
  const expectedMcp = await readJson(
    join(base, "clients", "copilot", "products", "bos", ".github", "mcp.json")
  );
  if (!(await pathExists(mcpPath))) failures.push(`missing Copilot MCP configuration: ${mcpPath}`);
  else {
    try {
      const actualMcp = JSON.parse(await readFile(mcpPath, "utf8"));
      for (const [name, expected] of Object.entries(expectedMcp.servers ?? expectedMcp.mcpServers ?? {})) {
        const actual = (actualMcp.servers ?? actualMcp.mcpServers ?? {})[name];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          failures.push(`Copilot MCP server ${name} differs from the generated BOS configuration`);
        }
      }
    } catch (error) {
      failures.push(`invalid Copilot MCP configuration ${mcpPath}: ${error.message}`);
    }
  }

  const githubSkills = join(target, ".github", "skills");
  const agentsSkills = join(target, ".agents", "skills");
  const skillsRoot = await pathExists(githubSkills)
    ? githubSkills
    : await pathExists(agentsSkills) ? agentsSkills : githubSkills;
  const skillStates = {};
  const productSkills = join(base, "clients", "copilot", "products", selected.name, "skills");
  for (const entry of await readdir(productSkills, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = join(productSkills, entry.name);
    const skillFailures = await compareTrees(source, join(skillsRoot, entry.name));
    skillStates[entry.name] = skillFailures.length === 0 ? "current" : "incomplete";
    failures.push(...skillFailures);
  }
  return {
    schema_version: "1",
    ok: failures.length === 0,
    target,
    product: selected.name,
    configuration_model: "repository-files-no-package-cache",
    mcp_path: mcpPath,
    skills_root: skillsRoot,
    skills: skillStates,
    failures
  };
}

async function main() {
  const args = process.argv.slice(2);
  const targetIndex = args.indexOf("--target");
  const productIndex = args.indexOf("--product");
  const report = await inspectCopilotRuntime({
    target: targetIndex >= 0 ? resolve(args[targetIndex + 1]) : undefined,
    product: productIndex >= 0 ? args[productIndex + 1] : "education-center"
  });
  if (args.includes("--json")) process.stdout.write(stableJson(report));
  else {
    console.log(`Copilot BOS runtime: ${report.ok ? "ready" : "incomplete"}`);
    for (const failure of report.failures) console.log(`failure: ${failure}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
