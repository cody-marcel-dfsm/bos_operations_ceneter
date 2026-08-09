import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile
} from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

export const root = resolve(import.meta.dirname, "../..");
export const supportedClients = new Set(["codex", "claude", "copilot"]);
export const productNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, stableJson(value));
}

export async function listProducts(base = root) {
  const productsDir = join(base, "products");
  const names = (await readdir(productsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const path = join(productsDir, name, "product.json");
      return { path, manifest: await readJson(path) };
    })
  );
}

export function validateProduct(manifest, path = "product.json") {
  const failures = [];
  const allowed = new Set([
    "schema_version",
    "name",
    "version",
    "display_name",
    "description",
    "publisher",
    "category",
    "authentication",
    "clients",
    "includes",
    "runtime",
    "mcp_profile",
    "settings_template",
    "default_prompts"
  ]);
  for (const field of Object.keys(manifest)) {
    if (!allowed.has(field)) failures.push(`${path}: unknown field ${field}`);
  }
  if (manifest.schema_version !== "1") {
    failures.push(`${path}: schema_version must be "1"`);
  }
  if (!productNamePattern.test(manifest.name ?? "")) {
    failures.push(`${path}: invalid product name`);
  }
  for (const field of [
    "version",
    "display_name",
    "description",
    "publisher",
    "category"
  ]) {
    if (typeof manifest[field] !== "string" || !manifest[field]) {
      failures.push(`${path}: ${field} must be a non-empty string`);
    }
  }
  if (!["ON_INSTALL", "ON_USE"].includes(manifest.authentication)) {
    failures.push(`${path}: authentication must be ON_INSTALL or ON_USE`);
  }
  if (!Array.isArray(manifest.clients) || manifest.clients.length === 0) {
    failures.push(`${path}: clients must be a non-empty array`);
  } else {
    for (const client of manifest.clients) {
      if (!supportedClients.has(client)) {
        failures.push(`${path}: unsupported client ${client}`);
      }
    }
    if (new Set(manifest.clients).size !== manifest.clients.length) {
      failures.push(`${path}: duplicate client`);
    }
  }
  if (!Array.isArray(manifest.includes) || manifest.includes.length === 0) {
    failures.push(`${path}: includes must be a non-empty array`);
  } else {
    for (const include of manifest.includes) {
      if (
        typeof include !== "string" ||
        include.startsWith("/") ||
        include.includes("..") ||
        include.includes("\\")
      ) {
        failures.push(`${path}: unsafe include ${include}`);
      }
    }
    if (new Set(manifest.includes).size !== manifest.includes.length) {
      failures.push(`${path}: duplicate include`);
    }
  }
  if (
    !Array.isArray(manifest.default_prompts) ||
    manifest.default_prompts.length > 3 ||
    manifest.default_prompts.some(
      (prompt) => typeof prompt !== "string" || prompt.length > 128
    )
  ) {
    failures.push(`${path}: default_prompts must contain up to 3 strings`);
  }
  if (
    manifest.mcp_profile !== undefined &&
    !productNamePattern.test(manifest.mcp_profile)
  ) {
    failures.push(`${path}: invalid mcp_profile`);
  }
  if (manifest.mcp_profile && !manifest.runtime) {
    failures.push(`${path}: mcp_profile requires runtime`);
  }
  if (
    manifest.settings_template !== undefined &&
    (typeof manifest.settings_template !== "string" ||
      manifest.settings_template.startsWith("/") ||
      manifest.settings_template.includes("..") ||
      manifest.settings_template.includes("\\"))
  ) {
    failures.push(`${path}: unsafe settings_template`);
  }
  return failures;
}

export async function copySettingsTemplate(product, pluginRoot, base = root) {
  if (!product.settings_template) return;
  const sourcePath = join(base, "source", product.settings_template);
  if (!safeInside(join(base, "source", "config"), sourcePath)) {
    throw new Error(`Unsafe settings template: ${product.settings_template}`);
  }
  await mkdir(join(pluginRoot, "config"), { recursive: true });
  await cp(sourcePath, join(pluginRoot, "config", "customer-settings.template.json"));
}

export function safeInside(base, candidate) {
  const resolvedBase = resolve(base);
  const resolvedCandidate = resolve(candidate);
  return (
    resolvedCandidate === resolvedBase ||
    resolvedCandidate.startsWith(`${resolvedBase}${sep}`)
  );
}

export async function resolveSkill(include, base = root) {
  const sourcePath = join(base, "source", include);
  if (!safeInside(join(base, "source"), sourcePath)) {
    throw new Error(`Unsafe skill include: ${include}`);
  }
  const skillFile = join(sourcePath, "SKILL.md");
  const content = await readFile(skillFile, "utf8");
  const match = content.match(/^---\s*\n[\s\S]*?^name:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (!match) throw new Error(`Missing skill name: ${skillFile}`);
  return {
    include,
    sourcePath,
    skillFile,
    name: match[1].trim()
  };
}

export async function resolveProductSkills(product, base = root) {
  const skills = [];
  const names = new Set();
  for (const include of product.includes) {
    const skill = await resolveSkill(include, base);
    if (names.has(skill.name)) {
      throw new Error(
        `Product ${product.name} exposes duplicate skill ${skill.name}`
      );
    }
    names.add(skill.name);
    skills.push(skill);
  }
  return skills;
}

export async function copyProductSkills(skills, target) {
  await mkdir(target, { recursive: true });
  for (const skill of skills) {
    await cp(skill.sourcePath, join(target, skill.name), {
      recursive: true,
      filter: publicPackagePath
    });
  }
}

function publicPackagePath(path) {
  const parts = resolve(path).split(sep);
  const name = basename(path);
  return !parts.includes("__pycache__") && !name.endsWith(".pyc");
}

export async function copyRuntime(product, pluginRoot, base = root) {
  if (!product.runtime) return;
  const runtimeRoot = join(base, "source", "runtime", product.runtime);
  await cp(join(runtimeRoot, ".mcp.json"), join(pluginRoot, ".mcp.json"));
  if (product.mcp_profile) {
    const configPath = join(pluginRoot, ".mcp.json");
    const config = await readJson(configPath);
    const server = config.mcpServers?.bos;
    if (!server || !Array.isArray(server.args)) {
      throw new Error(`Runtime ${product.runtime} has no BOS MCP server args`);
    }
    server.args.push("--profile", product.mcp_profile);
    await writeJson(configPath, config);
  }
  try {
    await cp(join(runtimeRoot, "scripts"), join(pluginRoot, "scripts"), {
      recursive: true,
      filter: publicPackagePath
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function pluginManifest(product) {
  const manifest = {
    name: product.name,
    version: product.version,
    description: product.description,
    author: { name: product.publisher },
    skills: "./skills/",
    interface: {
      displayName: product.display_name,
      shortDescription: product.description.slice(0, 80),
      longDescription: product.description,
      developerName: product.publisher,
      category: product.category,
      capabilities: ["Read", "Write"],
      defaultPrompt: product.default_prompts
    }
  };
  if (product.runtime) manifest.mcpServers = "./.mcp.json";
  return manifest;
}

export function marketplaceEntry(product) {
  return {
    name: product.name,
    source: {
      source: "local",
      path: `./plugins/${product.name}`
    },
    policy: {
      installation: "AVAILABLE",
      authentication: product.authentication
    },
    category: product.category
  };
}

export async function walkFiles(directory) {
  const output = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else output.push(path);
    }
  }
  await walk(directory);
  return output.sort();
}

export async function hashFile(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function hashTree(directory, excluded = new Set()) {
  const hashes = {};
  for (const path of await walkFiles(directory)) {
    const rel = relative(directory, path);
    if (!excluded.has(rel)) hashes[rel] = await hashFile(path);
  }
  return hashes;
}

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export function skillFolderName(path) {
  return basename(resolve(path, ".."));
}
