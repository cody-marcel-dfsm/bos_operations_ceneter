import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  hashTree,
  listProducts,
  materializeMcpUrl,
  copilotCredentialEnvVar,
  pathExists,
  readJson,
  resolveProductSkills,
  root,
  validateProduct
} from "./lib/package-model.mjs";

const forbiddenNames = new Set([
  ".env",
  "credentials.json",
  "service-account.json",
  "id_rsa",
  "id_ed25519"
]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bbos_agent_[A-Za-z0-9_-]{16,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bgh[ps]_[A-Za-z0-9]{30,}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /"(?:access_token|refresh_token|client_secret|private_key)"\s*:\s*"(?!REDACTED|EXAMPLE|<)[^"]+"/i,
  /\/Users\/[A-Za-z0-9._-]+\//
];
const textExtensions = new Set([
  ".json",
  ".md",
  ".mjs",
  ".js",
  ".ts",
  ".toml",
  ".yaml",
  ".yml",
  ".py"
]);
const ignoredDirectories = new Set([
  ".git",
  "dist",
  "node_modules",
  "tmp",
  "__pycache__"
]);
const failures = [];
const execFileAsync = promisify(execFile);

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    if (directory === root && entry.name === ".env") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    if (forbiddenNames.has(entry.name) || entry.name.startsWith(".env.")) {
      failures.push(`Forbidden credential filename: ${path}`);
      continue;
    }
    if ([".pem", ".key", ".p12", ".pfx"].includes(extname(entry.name))) {
      failures.push(`Forbidden credential file type: ${path}`);
      continue;
    }
    if (!textExtensions.has(extname(entry.name))) continue;
    const content = await readFile(path, "utf8");
    if (content.includes(`[${"TODO"}:`)) {
      failures.push(`TODO placeholder: ${path}`);
    }
    for (const pattern of secretPatterns) {
      if (pattern.test(content)) failures.push(`Credential pattern in ${path}`);
    }
  }
}

async function validateTrackedCredentialFiles() {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", ".env", ".env.*", "*.pem", "*.key", "credentials.json"],
    { cwd: root }
  );
  for (const path of stdout.split(/\r?\n/).filter(Boolean)) {
    failures.push(`Tracked credential file: ${path}`);
  }
}

function validateSkillContent(content, path) {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    failures.push(`Missing frontmatter: ${path}`);
    return;
  }
  const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatter[1]
    .match(/^description:\s*(.+)$/m)?.[1]
    ?.trim();
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    failures.push(`Invalid skill name: ${path}`);
  }
  if (!description || description.length < 20) {
    failures.push(`Invalid skill description: ${path}`);
  }
}

async function validateProducts() {
  const products = await listProducts();
  const identities = new Set();
  for (const { path, manifest } of products) {
    failures.push(...validateProduct(manifest, path));
    if (
      manifest.name !== "bos" &&
      manifest.includes.some(
        (include) =>
          include.startsWith("platform/") &&
          ![
            "platform/bos-mcp-client",
            "platform/submit-feedback",
            "platform/manage-customer-extension"
          ].includes(include)
      )
    ) {
      failures.push(
        `${path}: only the bos product may publish platform foundation skills`
      );
    }
    if (identities.has(manifest.name)) {
      failures.push(`Duplicate product identity: ${manifest.name}`);
    }
    identities.add(manifest.name);
    let skills = [];
    try {
      skills = await resolveProductSkills(manifest);
    } catch (error) {
      failures.push(error.message);
      continue;
    }
    for (const skill of skills) {
      validateSkillContent(await readFile(skill.skillFile, "utf8"), skill.skillFile);
    }
    const generatedRoots = {
      codex: join(root, "clients", "codex", "plugins", manifest.name),
      claude: join(root, "clients", "claude", "plugins", manifest.name),
      copilot: join(root, "clients", "copilot", "products", manifest.name),
      gemini: join(root, "clients", "gemini", "extensions", manifest.name)
    };
    if (manifest.release_status === "disabled") {
      for (const generatedRoot of Object.values(generatedRoots)) {
        if (await pathExists(generatedRoot)) {
          failures.push(`Disabled product is present in generated clients: ${generatedRoot}`);
        }
      }
      continue;
    }
    for (const client of manifest.clients) {
      const metadataPath = join(generatedRoots[client], ".bos-product.json");
      if (!(await pathExists(metadataPath))) {
        failures.push(`Missing generated product metadata: ${metadataPath}`);
        continue;
      }
      const metadata = await readJson(metadataPath);
      if (
        metadata.application_name !== manifest.application_name ||
        metadata.mcp_group_name !== manifest.mcp_group_name ||
        metadata.credential_env_var !== manifest.credential_env_var ||
        "mcp_application" in metadata ||
        "mcp_resource_group" in metadata ||
        "installed_app_id" in metadata
      ) {
        failures.push(`Generated named MCP route metadata drift: ${metadataPath}`);
      }
    }
    if (manifest.clients.includes("codex")) {
      const pluginRoot = generatedRoots.codex;
      const pluginPath = join(pluginRoot, ".codex-plugin", "plugin.json");
      if (!(await pathExists(pluginPath))) {
        failures.push(`Missing generated Codex plugin: ${pluginPath}`);
      } else {
        const generated = await readJson(pluginPath);
        if (
          generated.name !== manifest.name ||
          generated.version !== manifest.version
        ) {
          failures.push(`Generated Codex identity drift: ${pluginPath}`);
        }
      }
      const runtimePath = join(pluginRoot, ".mcp.json");
      if (manifest.runtime && await pathExists(runtimePath)) {
        const runtime = await readJson(runtimePath);
        const server = runtime.mcpServers?.[manifest.mcp_group_name];
        const expectedUrl = materializeMcpUrl(
          "https://dfsm.ai/mcp/apps/{application_name}/{mcp_group_name}",
          manifest
        );
        if (
          server?.url !== expectedUrl ||
          server?.bearer_token_env_var !== manifest.credential_env_var ||
          JSON.stringify(runtime).includes("BOS_INSTALLED_APP_ID")
        ) {
          failures.push(`Generated Codex named MCP route drift: ${runtimePath}`);
        }
      }
      for (const skill of skills) {
        const generatedSkillRoot = join(pluginRoot, "skills", skill.name);
        const generatedSkillFile = join(generatedSkillRoot, "SKILL.md");
        if (!(await pathExists(generatedSkillFile))) {
          failures.push(`Missing generated skill: ${generatedSkillFile}`);
          continue;
        }
        const [sourceHashes, generatedHashes] = await Promise.all([
          hashTree(skill.sourcePath),
          hashTree(generatedSkillRoot)
        ]);
        if (JSON.stringify(sourceHashes) !== JSON.stringify(generatedHashes)) {
          failures.push(
            `Generated skill differs from canonical source: ${generatedSkillRoot}`
          );
        }
      }
    }
    if (manifest.clients.includes("claude")) {
      const pluginRoot = generatedRoots.claude;
      const pluginPath = join(pluginRoot, ".claude-plugin", "plugin.json");
      if (!(await pathExists(pluginPath))) {
        failures.push(`Missing generated Claude plugin: ${pluginPath}`);
      } else {
        const generated = await readJson(pluginPath);
        if (
          generated.name !== manifest.name ||
          generated.version !== manifest.version
        ) {
          failures.push(`Generated Claude identity drift: ${pluginPath}`);
        }
        if (manifest.runtime) {
          if (
            generated.mcpServers !== "./.mcp.json" ||
            generated.userConfig !== undefined
          ) {
            failures.push(`Generated Claude runtime configuration drift: ${pluginPath}`);
          }
        }
      }
      const runtimePath = join(pluginRoot, ".mcp.json");
      if (manifest.runtime) {
        if (!(await pathExists(runtimePath))) {
          failures.push(`Missing generated Claude MCP configuration: ${runtimePath}`);
        } else {
          const runtime = await readJson(runtimePath);
          const server = runtime.mcpServers?.[manifest.mcp_group_name];
          const expectedUrl = materializeMcpUrl(
            "https://dfsm.ai/mcp/apps/{application_name}/{mcp_group_name}",
            manifest
          );
          if (
            server?.type !== "http" ||
            server?.url !== expectedUrl ||
            server?.headers?.Authorization !==
              `Bearer \${${manifest.credential_env_var}}` ||
            Object.keys(runtime.mcpServers ?? {}).length !== 1 ||
            JSON.stringify(runtime).includes("BOS_INSTALLED_APP_ID") ||
            JSON.stringify(runtime).includes("installed_app_id")
          ) {
            failures.push(`Generated Claude named MCP route drift: ${runtimePath}`);
          }
        }
      }
      for (const skill of skills) {
        const generatedSkillRoot = join(pluginRoot, "skills", skill.name);
        const generatedSkillFile = join(generatedSkillRoot, "SKILL.md");
        if (!(await pathExists(generatedSkillFile))) {
          failures.push(`Missing generated skill: ${generatedSkillFile}`);
          continue;
        }
        const [sourceHashes, generatedHashes] = await Promise.all([
          hashTree(skill.sourcePath),
          hashTree(generatedSkillRoot)
        ]);
        if (JSON.stringify(sourceHashes) !== JSON.stringify(generatedHashes)) {
          failures.push(
            `Generated skill differs from canonical source: ${generatedSkillRoot}`
          );
        }
      }
    }
    if (manifest.clients.includes("copilot")) {
      const productRoot = generatedRoots.copilot;
      const runtimePath = join(productRoot, ".github", "mcp.json");
      if (!manifest.runtime && await pathExists(runtimePath)) {
        failures.push(`Skills-only product contains Copilot MCP configuration: ${runtimePath}`);
      } else if (manifest.runtime && !(await pathExists(runtimePath))) {
        failures.push(`Missing generated Copilot MCP configuration: ${runtimePath}`);
      } else if (manifest.runtime) {
        const runtime = await readJson(runtimePath);
        const server = runtime.mcpServers?.[manifest.mcp_group_name];
        const expectedUrl = materializeMcpUrl(
          "https://dfsm.ai/mcp/apps/{application_name}/{mcp_group_name}",
          manifest
        );
        if (
          server?.type !== "http" ||
          server?.url !== expectedUrl ||
          server?.headers?.Authorization !==
            `Bearer \${${copilotCredentialEnvVar(manifest)}}` ||
          JSON.stringify(server?.tools) !== JSON.stringify(["*"]) ||
          Object.keys(runtime.mcpServers ?? {}).length !== 1 ||
          /BOS_INSTALLED_APP_ID|installed_app_id/.test(JSON.stringify(runtime))
        ) {
          failures.push(`Generated Copilot named MCP route drift: ${runtimePath}`);
        }
      }
      for (const skill of skills) {
        const generatedSkillRoot = join(productRoot, "skills", skill.name);
        const [sourceHashes, generatedHashes] = await Promise.all([
          hashTree(skill.sourcePath),
          hashTree(generatedSkillRoot)
        ]);
        if (JSON.stringify(sourceHashes) !== JSON.stringify(generatedHashes)) {
          failures.push(
            `Generated skill differs from canonical source: ${generatedSkillRoot}`
          );
        }
      }
    }
    if (manifest.clients.includes("gemini")) {
      const extensionRoot = generatedRoots.gemini;
      const extensionPath = join(extensionRoot, "gemini-extension.json");
      if (!(await pathExists(extensionPath))) {
        failures.push(`Missing generated Gemini extension: ${extensionPath}`);
      } else {
        const generated = await readJson(extensionPath);
        if (
          generated.name !== manifest.name ||
          generated.version !== manifest.version
        ) {
          failures.push(`Generated Gemini identity drift: ${extensionPath}`);
        }
        for (const server of Object.values(generated.mcpServers ?? {})) {
          if (typeof server.httpUrl !== "string" || "url" in server) {
            failures.push(`Gemini MCP transport must use httpUrl: ${extensionPath}`);
          }
        }
        if (!manifest.runtime) {
          if (generated.mcpServers !== undefined || generated.settings !== undefined) {
            failures.push(`Skills-only Gemini product contains MCP configuration: ${extensionPath}`);
          }
          continue;
        }
        const expectedUrl = materializeMcpUrl(
          "https://dfsm.ai/mcp/apps/{application_name}/{mcp_group_name}",
          manifest
        );
        if (
          generated.mcpServers?.[manifest.mcp_group_name]?.httpUrl !== expectedUrl ||
          JSON.stringify(generated).includes("BOS_INSTALLED_APP_ID")
        ) {
          failures.push(`Generated Gemini named MCP route drift: ${extensionPath}`);
        }
        const settings = generated.settings ?? [];
        if (
          settings.length !== 1 ||
          settings[0]?.envVar !== manifest.credential_env_var ||
          settings[0]?.sensitive !== true ||
          generated.mcpServers?.[manifest.mcp_group_name]?.headers?.Authorization !==
            `Bearer \${${manifest.credential_env_var}}`
        ) {
          failures.push(`Generated Gemini authentication configuration drift: ${extensionPath}`);
        }
      }
      for (const skill of skills) {
        const generatedSkillRoot = join(extensionRoot, "skills", skill.name);
        const [sourceHashes, generatedHashes] = await Promise.all([
          hashTree(skill.sourcePath),
          hashTree(generatedSkillRoot)
        ]);
        if (JSON.stringify(sourceHashes) !== JSON.stringify(generatedHashes)) {
          failures.push(
            `Generated skill differs from canonical source: ${generatedSkillRoot}`
          );
        }
      }
    }
  }
}

await scan(root);
await validateTrackedCredentialFiles();
await validateProducts();

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Package structure, products, skills, and credential scan passed.");
