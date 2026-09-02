import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  geminiPluginManifest,
  hashTree,
  listProducts,
  materializeMcpUrl,
  pathExists,
  readJson,
  resolveProductSkills,
  root,
  stableJson,
  transformProductSkillGuidance,
  validateProduct
} from "./lib/package-model.mjs";
import {
  codexLoginSurfaceContract,
  singleBosConnectionContract
} from "./lib/product-contracts.mjs";

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
const retiredProductIdentityPatterns = [
  new RegExp(`\\b${["i", "code"].join("")}\\b`, "i"),
  new RegExp(["I", "CODE", "_OPERATIONS"].join(""))
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
const reusableRuntimePlatformSkills = new Set([
  "platform/bos-mcp-client",
  "platform/bos-plugin-settings",
  "platform/bos-plugin-settings-initialization",
  "platform/bos-federated-query",
  "platform/bos-cache-maintenance",
  "platform/submit-feedback",
  "platform/manage-customer-extension"
]);

async function expectedSkillHashes(product, skill) {
  const hashes = await hashTree(skill.sourcePath);
  const source = await readFile(skill.skillFile, "utf8");
  const transformed = transformProductSkillGuidance(
    product,
    skill.name,
    source
  );
  if (transformed !== source) {
    hashes["SKILL.md"] = createHash("sha256")
      .update(transformed)
      .digest("hex");
  }
  return hashes;
}

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    if (directory === root && entry.name === ".env") continue;
    const path = join(directory, entry.name);
    for (const pattern of retiredProductIdentityPatterns) {
      if (pattern.test(entry.name)) {
        failures.push(`Retired product identity in path: ${path}`);
      }
    }
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
    for (const pattern of retiredProductIdentityPatterns) {
      if (pattern.test(content)) {
        failures.push(`Retired product identity in ${path}`);
      }
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
  const [repositoryPackage, packageManifest] = await Promise.all([
    readJson(join(root, "package.json")),
    readJson(join(root, "package-manifest.json"))
  ]);
  if (packageManifest.version !== repositoryPackage.version) {
    failures.push(
      `Package manifest version ${packageManifest.version} does not match repository release ${repositoryPackage.version}`
    );
  }
  if (
    JSON.stringify(Object.keys(packageManifest.clients ?? {}).sort()) !==
    JSON.stringify(["claude", "codex", "copilot", "gemini"])
  ) {
    failures.push("Package manifest must declare all supported clients");
  }
  const products = await listProducts();
  const identities = new Set();
  for (const { path, manifest } of products) {
    failures.push(...validateProduct(manifest, path));
    if (
      manifest.name !== "bos" &&
      manifest.includes.some(
        (include) =>
          include.startsWith("platform/") &&
          !reusableRuntimePlatformSkills.has(include)
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
      const expectedAuthentication = manifest.runtime
        ? "oauth_2_1"
        : "bos_managed";
      if (
        metadata.connection_owner !== "bos" ||
        metadata.application_name !== manifest.application_name ||
        metadata.mcp_group_name !== manifest.mcp_group_name ||
        metadata.resource_url !== (manifest.runtime
          ? materializeMcpUrl(manifest)
          : undefined) ||
        metadata.codex_app_id !==
          (client === "codex" ? manifest.codex_connector?.id : undefined) ||
        JSON.stringify(metadata.retired_codex_app_ids) !==
          JSON.stringify(client === "codex"
            ? manifest.codex_connector?.retired_ids
            : undefined) ||
        metadata.authentication !== expectedAuthentication ||
        "credential_env_var" in metadata ||
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
        if (manifest.runtime) {
          if (generated.mcpServers !== "./.mcp.json" || "apps" in generated) {
            failures.push(`Generated Codex MCP binding drift: ${pluginPath}`);
          }
        } else if ("apps" in generated || "mcpServers" in generated) {
          failures.push(`Skills-only Codex product contains runtime binding: ${pluginPath}`);
        }
      }
      const appPath = join(pluginRoot, ".app.json");
      const runtimePath = join(pluginRoot, ".mcp.json");
      if (manifest.runtime) {
        if (
          await pathExists(appPath) ||
          !(await pathExists(runtimePath))
        ) {
          failures.push(`Generated Codex MCP file drift: ${runtimePath}`);
        } else {
          const runtimeManifest = await readJson(runtimePath);
          const entries = Object.entries(runtimeManifest.mcpServers ?? {});
          const [name, server] = entries[0] ?? [];
          if (
            entries.length !== 1 ||
            name !== manifest.mcp_group_name ||
            server?.type !== "http" ||
            server?.url !== materializeMcpUrl(manifest) ||
            JSON.stringify(Object.keys(server ?? {}).sort()) !==
              JSON.stringify(["type", "url"])
          ) {
            failures.push(`Generated Codex MCP declaration drift: ${runtimePath}`);
          }
        }
      } else if (await pathExists(appPath) || await pathExists(runtimePath)) {
        failures.push(`Skills-only Codex product contains runtime file: ${pluginRoot}`);
      }
      for (const skill of skills) {
        const generatedSkillRoot = join(pluginRoot, "skills", skill.name);
        const generatedSkillFile = join(generatedSkillRoot, "SKILL.md");
        if (!(await pathExists(generatedSkillFile))) {
          failures.push(`Missing generated skill: ${generatedSkillFile}`);
          continue;
        }
        const [sourceHashes, generatedHashes] = await Promise.all([
          expectedSkillHashes(manifest, skill),
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
        if (manifest.runtime &&
            ("mcpServers" in generated || "userConfig" in generated)) {
          failures.push(`Generated Claude plugin owns a session-scoped connection: ${pluginPath}`);
        }
        if (!manifest.runtime && "mcpServers" in generated) {
          failures.push(`Skills-only Claude plugin contains runtime binding: ${pluginPath}`);
        }
      }
      const runtimePath = join(pluginRoot, ".mcp.json");
      if (manifest.runtime) {
        if (await pathExists(runtimePath)) {
          failures.push(`Generated Claude plugin contains session-scoped MCP: ${runtimePath}`);
        }
        const metadata = await readJson(join(pluginRoot, ".bos-product.json"));
        const expectedUrl = materializeMcpUrl(manifest);
        if (metadata.connection_scope !== "claude_account" ||
            metadata.resource_url !== expectedUrl ||
            !(await pathExists(join(pluginRoot, "CONNECTORS.md")))) {
          failures.push(`Generated Claude account connector metadata drift: ${pluginRoot}`);
        }
      } else if (await pathExists(runtimePath)) {
        failures.push(`Skills-only Claude plugin contains runtime file: ${runtimePath}`);
      }
      for (const skill of skills) {
        const generatedSkillRoot = join(pluginRoot, "skills", skill.name);
        const generatedSkillFile = join(generatedSkillRoot, "SKILL.md");
        if (!(await pathExists(generatedSkillFile))) {
          failures.push(`Missing generated skill: ${generatedSkillFile}`);
          continue;
        }
        const [sourceHashes, generatedHashes] = await Promise.all([
          expectedSkillHashes(manifest, skill),
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
        const expectedUrl = materializeMcpUrl(manifest);
        if (
          server?.type !== "http" ||
          server?.url !== expectedUrl ||
          "headers" in server ||
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
          expectedSkillHashes(manifest, skill),
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
      const pluginPath = join(extensionRoot, "plugin.json");
      const pluginMcpPath = join(extensionRoot, "mcp_config.json");
      const readmePath = join(extensionRoot, "README.md");
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
        } else {
          const expectedUrl = materializeMcpUrl(manifest);
          if (
            generated.mcpServers?.[manifest.mcp_group_name]?.httpUrl !== expectedUrl ||
            generated.mcpServers?.[manifest.mcp_group_name]?.oauth?.enabled !== true ||
            /BOS_INSTALLED_APP_ID|installed_app_id|Authorization|clientSecret/.test(
              JSON.stringify(generated)
            )
          ) {
            failures.push(`Generated Gemini named MCP route drift: ${extensionPath}`);
          }
          if (generated.settings !== undefined || generated.mcpServers?.[manifest.mcp_group_name]?.headers) {
            failures.push(`Generated Gemini authentication configuration drift: ${extensionPath}`);
          }
        }
      }
      if (!(await pathExists(pluginPath))) {
        failures.push(`Missing generated Antigravity plugin manifest: ${pluginPath}`);
      } else {
        const plugin = await readJson(pluginPath);
        const expectedPlugin = geminiPluginManifest(manifest);
        if (JSON.stringify(plugin) !== JSON.stringify(expectedPlugin)) {
          failures.push(`Generated Antigravity plugin identity drift: ${pluginPath}`);
        }
      }
      if (!manifest.runtime) {
        if (await pathExists(pluginMcpPath)) {
          failures.push(`Skills-only Gemini product contains desktop MCP configuration: ${pluginMcpPath}`);
        }
      } else if (!(await pathExists(pluginMcpPath))) {
        failures.push(`Missing generated Antigravity MCP configuration: ${pluginMcpPath}`);
      } else {
        const desktopMcp = await readJson(pluginMcpPath);
        const expectedUrl = materializeMcpUrl(manifest);
        const server = desktopMcp.mcpServers?.[manifest.mcp_group_name];
        if (
          Object.keys(desktopMcp.mcpServers ?? {}).length !== 1 ||
          server?.serverUrl !== expectedUrl ||
          "url" in (server ?? {}) ||
          "httpUrl" in (server ?? {}) ||
          /Authorization|headers|clientSecret|BOS_INSTALLED_APP_ID|installed_app_id/.test(
            JSON.stringify(desktopMcp)
          )
        ) {
          failures.push(`Generated Antigravity MCP configuration drift: ${pluginMcpPath}`);
        }
      }
      if (!(await pathExists(readmePath))) {
        failures.push(`Missing generated Gemini installation guidance: ${readmePath}`);
      } else {
        const readme = await readFile(readmePath, "utf8");
        if (
          !readme.includes(`gemini extensions install clients/gemini/extensions/${manifest.name}`) ||
          !readme.includes("/extensions list") ||
          !readme.includes("/skills list") ||
          !readme.includes("Antigravity 2.0 Desktop") ||
          !readme.includes("scripts/clean-install-antigravity.sh") ||
          !readme.includes("DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS") ||
          !readme.includes("~/.gemini/config/plugins/") ||
          !readme.includes("clean install") ||
          !readme.includes("without backups") ||
          !readme.includes("After each Git pull, restart Antigravity") ||
          (manifest.runtime &&
            (!readme.includes(`/mcp auth ${manifest.mcp_group_name}`) ||
              !readme.includes("Settings > Customizations") ||
              !readme.includes("Authenticate") ||
              !readme.includes(`/mcp/apps/${manifest.application_name}/${manifest.mcp_group_name}`)))
        ) {
          failures.push(`Generated Gemini installation guidance drift: ${readmePath}`);
        }
      }
      for (const skill of skills) {
        const generatedSkillRoot = join(extensionRoot, "skills", skill.name);
        const [sourceHashes, generatedHashes] = await Promise.all([
          expectedSkillHashes(manifest, skill),
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

async function validateRepositoryMarketplaceEntrypoints() {
  const codexPath = join(root, ".agents", "plugins", "marketplace.json");
  const claudePath = join(root, ".claude-plugin", "marketplace.json");
  const generatedCodexPath = join(
    root, "clients", "codex", ".agents", "plugins", "marketplace.json"
  );
  const generatedClaudePath = join(
    root, "clients", "claude", ".claude-plugin", "marketplace.json"
  );
  if (!(await pathExists(codexPath))) {
    failures.push(`Missing repository Codex marketplace entrypoint: ${codexPath}`);
  } else {
    const manifest = await readJson(codexPath);
    const generated = await readJson(generatedCodexPath);
    const expected = {
      ...generated,
      plugins: generated.plugins.map((entry) => ({
        ...entry,
        source: {
          ...entry.source,
          path: `./clients/codex/plugins/${entry.name}`
        }
      }))
    };
    if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
      failures.push(`Repository Codex marketplace entrypoint drift: ${codexPath}`);
    }
  }
  if (!(await pathExists(claudePath))) {
    failures.push(`Missing repository Claude marketplace entrypoint: ${claudePath}`);
  } else {
    const manifest = await readJson(claudePath);
    const generated = await readJson(generatedClaudePath);
    const expected = {
      ...generated,
      plugins: generated.plugins.map((entry) => ({
        ...entry,
        source: `./clients/claude/plugins/${entry.name}`
      }))
    };
    if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
      failures.push(`Repository Claude marketplace entrypoint drift: ${claudePath}`);
    }
  }
}

async function validateGeneratedProductContracts() {
  const products = (await listProducts())
    .map(({ manifest }) => manifest)
    .filter(({ release_status }) => release_status === "active");
  const bos = products.find(({ name }) => name === "bos");
  for (const [path, expected] of [
    [
      join(root, "contracts", "single-bos-mcp-connection.v1.json"),
      singleBosConnectionContract(products)
    ],
    [
      join(root, "contracts", "codex-login-surface.v1.json"),
      codexLoginSurfaceContract(bos)
    ]
  ]) {
    const actual = await readFile(path, "utf8");
    if (actual !== stableJson(expected)) {
      failures.push(`Generated product contract drift: ${path}`);
    }
  }
}

await scan(root);
await validateTrackedCredentialFiles();
await validateProducts();
await validateRepositoryMarketplaceEntrypoints();
await validateGeneratedProductContracts();

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Package structure, products, skills, and credential scan passed.");
