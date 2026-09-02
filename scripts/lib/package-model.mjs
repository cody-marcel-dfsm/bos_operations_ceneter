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
export const supportedClients = new Set(["codex", "claude", "copilot", "gemini"]);
export const productNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const publicToolNamePattern = /^[a-z][a-z0-9_]*$/;
export const productInitializationIndependentSkills = new Set([
  "bos-mcp-client",
  "bos-plugin-console",
  "bos-plugin-settings"
]);

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
  const standaloneCodexCandidate = manifest.name !== "bos" &&
    manifest.release_status === "disabled" &&
    Boolean(manifest.runtime) &&
    manifest.clients?.includes("codex") &&
    manifest.codex_connector !== undefined;
  const allowed = new Set([
    "schema_version",
    "name",
    "version",
    "release_status",
    "display_name",
    "description",
    "long_description",
    "website_url",
    "brand_color",
    "composer_icon",
    "logo",
    "publisher",
    "category",
    "authentication",
    "clients",
    "includes",
    "runtime",
    "application_name",
    "mcp_group_name",
    "mcp_resource_url",
    "codex_connector",
    "settings_template",
    "settings_initializer",
    "plugin_settings_initializer",
    "runtime_verification_tools",
    "default_prompts"
  ]);
  for (const field of Object.keys(manifest)) {
    if (!allowed.has(field)) failures.push(`${path}: unknown field ${field}`);
  }
  if (manifest.schema_version !== "1") {
    failures.push(`${path}: schema_version must be "1"`);
  }
  if (!["active", "disabled"].includes(manifest.release_status)) {
    failures.push(`${path}: release_status must be active or disabled`);
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
  if (
    manifest.long_description !== undefined &&
    (typeof manifest.long_description !== "string" || !manifest.long_description)
  ) {
    failures.push(`${path}: long_description must be a non-empty string`);
  }
  if (
    manifest.website_url !== undefined &&
    (typeof manifest.website_url !== "string" ||
      !/^https:\/\/[^\s]+$/.test(manifest.website_url))
  ) {
    failures.push(`${path}: website_url must be an absolute HTTPS URL`);
  }
  if (
    manifest.brand_color !== undefined &&
    !/^#[0-9A-Fa-f]{6}$/.test(manifest.brand_color)
  ) {
    failures.push(`${path}: brand_color must be a six-digit hex color`);
  }
  for (const field of ["composer_icon", "logo"]) {
    const value = manifest[field];
    if (
      value !== undefined &&
      (typeof value !== "string" ||
        !value.startsWith("assets/") ||
        value.includes("..") ||
        value.includes("\\") ||
        !/\.(?:png|jpe?g|svg|webp)$/i.test(value))
    ) {
      failures.push(`${path}: ${field} must be a safe image path under assets/`);
    }
  }
  if (!["ON_INSTALL", "ON_USE"].includes(manifest.authentication)) {
    failures.push(`${path}: authentication must be ON_INSTALL or ON_USE`);
  }
  if (manifest.name === "bos" && manifest.authentication !== "ON_INSTALL") {
    failures.push(`${path}: BOS authentication must be ON_INSTALL`);
  }
  if (standaloneCodexCandidate && manifest.authentication !== "ON_INSTALL") {
    failures.push(`${path}: standalone runtime authentication must be ON_INSTALL`);
  }
  if (manifest.name !== "bos" && !standaloneCodexCandidate &&
      manifest.authentication !== "ON_USE") {
    failures.push(`${path}: subservice authentication policy must be ON_USE`);
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
  const runtimeVerificationTools = manifest.runtime_verification_tools;
  if (
    (manifest.release_status === "active" && !Array.isArray(runtimeVerificationTools)) ||
    (runtimeVerificationTools !== undefined && (
      !Array.isArray(runtimeVerificationTools) ||
      runtimeVerificationTools.length === 0 ||
      runtimeVerificationTools.some(
        (tool) => typeof tool !== "string" || !publicToolNamePattern.test(tool)
      ) ||
      new Set(runtimeVerificationTools).size !== runtimeVerificationTools.length
    ))
  ) {
    failures.push(
      `${path}: runtime_verification_tools must contain unique public tool names`
    );
  }
  if (
    manifest.application_name !== undefined &&
    !productNamePattern.test(manifest.application_name)
  ) {
    failures.push(`${path}: invalid application_name`);
  }
  if (
    manifest.mcp_group_name !== undefined &&
    !productNamePattern.test(manifest.mcp_group_name)
  ) {
    failures.push(`${path}: invalid mcp_group_name`);
  }
  if ((manifest.application_name || manifest.mcp_group_name || manifest.mcp_resource_url) &&
      !manifest.runtime) {
    failures.push(`${path}: application and MCP group names require runtime`);
  }
  if (manifest.runtime && (!manifest.application_name || !manifest.mcp_group_name ||
      typeof manifest.mcp_resource_url !== "string" ||
      !/^https:\/\/[^\s]+$/.test(manifest.mcp_resource_url))) {
    failures.push(`${path}: runtime requires application_name, mcp_group_name, and an HTTPS mcp_resource_url`);
  }
  const connector = manifest.codex_connector;
  if (connector !== undefined) {
    const expectedKeys = [
      "id",
      "identity_policy",
      "lifecycle_state",
      "metadata_policy",
      "missing_record_policy",
      "provisioning_policy",
      "required",
      "retired_ids"
    ];
    if (!connector || typeof connector !== "object" || Array.isArray(connector) ||
        JSON.stringify(Object.keys(connector).sort()) !== JSON.stringify(expectedKeys)) {
      failures.push(`${path}: codex_connector must contain the complete lifecycle contract`);
    } else {
      if (!new Set(["ESTABLISHED", "UNPROVISIONED_NEW"]).has(connector.lifecycle_state)) {
        failures.push(`${path}: codex_connector.lifecycle_state is invalid`);
      }
      if (connector.lifecycle_state === "ESTABLISHED" &&
          !/^plugin_asdk_app_[a-z0-9]+$/.test(connector.id ?? "")) {
        failures.push(`${path}: an established codex_connector.id must be a plugin_asdk_app identifier`);
      }
      if (connector.lifecycle_state === "UNPROVISIONED_NEW" && connector.id !== null) {
        failures.push(`${path}: an unprovisioned new connector must have a null ID`);
      }
      if (connector.lifecycle_state === "UNPROVISIONED_NEW" &&
          (manifest.name === "bos" || connector.retired_ids?.length !== 0)) {
        failures.push(`${path}: UNPROVISIONED_NEW is only valid for a different product with no retired IDs`);
      }
      if (connector.required !== true ||
          connector.identity_policy !== "IMMUTABLE" ||
          connector.metadata_policy !== "UPDATE_IN_PLACE" ||
          connector.missing_record_policy !== "REGISTRY_INTEGRITY_FAILURE" ||
          connector.provisioning_policy !== "NEW_PRODUCT_ONLY") {
        failures.push(`${path}: codex_connector lifecycle policies are invalid`);
      }
      if (!Array.isArray(connector.retired_ids) ||
          connector.retired_ids.some((id) => !/^asdk_app_[a-z0-9]+$/.test(id)) ||
          new Set(connector.retired_ids).size !== connector.retired_ids.length ||
          (connector.id && connector.retired_ids.includes(codexRawAppId(connector.id)))) {
        failures.push(`${path}: codex_connector.retired_ids must contain unique noncanonical raw IDs`);
      }
    }
  }
  if (
    manifest.release_status === "active" &&
    manifest.runtime &&
    manifest.clients?.includes("codex") &&
    manifest.codex_connector?.lifecycle_state !== "ESTABLISHED"
  ) {
    failures.push(`${path}: active Codex runtime requires codex_connector`);
  }
  if (
    manifest.codex_connector !== undefined &&
    (!manifest.runtime || !manifest.clients?.includes("codex"))
  ) {
    failures.push(`${path}: codex_connector requires a Codex runtime product`);
  }
  if (manifest.runtime &&
      !manifest.includes?.includes("platform/bos-mcp-client")) {
    failures.push(`${path}: runtime requires platform/bos-mcp-client`);
  }
  if (manifest.name === "bos") {
    if (
      manifest.runtime !== "bos" ||
      manifest.application_name !== "bos" ||
      manifest.mcp_group_name !== "platform"
    ) {
      failures.push(`${path}: BOS must own the bos/platform MCP runtime`);
    }
  } else if (!standaloneCodexCandidate && (
    manifest.runtime !== undefined ||
    manifest.application_name !== undefined ||
    manifest.mcp_group_name !== undefined ||
    manifest.mcp_resource_url !== undefined ||
    manifest.codex_connector !== undefined
  )) {
    failures.push(`${path}: subservice products must use the BOS-owned connection`);
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
  if (
    manifest.settings_initializer !== undefined &&
    !productNamePattern.test(manifest.settings_initializer)
  ) {
    failures.push(`${path}: invalid settings_initializer`);
  }
  if (Boolean(manifest.settings_template) !== Boolean(manifest.settings_initializer)) {
    failures.push(
      `${path}: settings_template and settings_initializer must be declared together`
    );
  }
  if (
    manifest.settings_initializer &&
    !manifest.includes?.some(
      (include) => include.split("/").at(-1) === manifest.settings_initializer
    )
  ) {
    failures.push(`${path}: settings_initializer must name an included skill`);
  }
  if (
    manifest.plugin_settings_initializer !== undefined &&
    !productNamePattern.test(manifest.plugin_settings_initializer)
  ) {
    failures.push(`${path}: invalid plugin_settings_initializer`);
  }
  if (
    manifest.plugin_settings_initializer &&
    !manifest.includes?.some(
      (include) => include.split("/").at(-1) === manifest.plugin_settings_initializer
    )
  ) {
    failures.push(
      `${path}: plugin_settings_initializer must name an included skill`
    );
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

export async function copyProductAssets(product, pluginRoot, base = root) {
  const assets = new Set(
    [product.composer_icon, product.logo].filter(Boolean)
  );
  for (const asset of assets) {
    const sourcePath = join(base, "products", product.name, asset);
    const productAssets = join(base, "products", product.name, "assets");
    if (!safeInside(productAssets, sourcePath)) {
      throw new Error(`Product ${product.name} has an unsafe visual asset path`);
    }
    const targetPath = join(pluginRoot, asset);
    await mkdir(resolve(targetPath, ".."), { recursive: true });
    await cp(sourcePath, targetPath);
  }
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

export async function copyProductSkills(product, skills, target) {
  await mkdir(target, { recursive: true });
  for (const skill of skills) {
    const skillTarget = join(target, skill.name);
    await cp(skill.sourcePath, skillTarget, {
      recursive: true,
      filter: publicPackagePath
    });
    const skillFile = join(skillTarget, "SKILL.md");
    const guidance = await readFile(skillFile, "utf8");
    const transformed = transformProductSkillGuidance(
      product,
      skill.name,
      guidance
    );
    if (transformed !== guidance) await writeFile(skillFile, transformed);
  }
}

export function transformProductSkillGuidance(product, skillName, guidance) {
  if (skillName === product.settings_initializer) return guidance;
  if (productInitializationIndependentSkills.has(skillName)) return guidance;
  if (skillName === product.plugin_settings_initializer) {
    return product.settings_initializer
      ? injectSettingsPreflight(guidance, product.settings_initializer)
      : guidance;
  }
  if (product.settings_initializer && product.plugin_settings_initializer) {
    return injectProductInitializationPreflight(guidance, {
      settingsInitializer: product.settings_initializer,
      pluginSettingsInitializer: product.plugin_settings_initializer
    });
  }
  if (product.settings_initializer) {
    return injectSettingsPreflight(guidance, product.settings_initializer);
  }
  if (product.plugin_settings_initializer) {
    return injectProductInitializationPreflight(guidance, {
      pluginSettingsInitializer: product.plugin_settings_initializer
    });
  }
  return guidance;
}

export function injectSettingsPreflight(guidance, initializer) {
  const frontmatter = guidance.match(/^---\s*\n[\s\S]*?^---\s*\n/m);
  if (!frontmatter) throw new Error("Cannot inject settings preflight without frontmatter");
  const preflight = [
    "## Product first-run preflight",
    "",
    "Before performing this skill's workflow, resolve the installed product root and",
    "validate its customer-owned `config/customer-settings.json` against",
    "`config/customer-settings.template.json`. Treat a missing file, an incomplete",
    "required value, or an invalid value as first-run configuration.",
    "",
    `When first-run configuration is detected, invoke \`${initializer}\``,
    "immediately. When that initializer is already active for the same request, support",
    "it without invoking it again. Preserve the user's original request while",
    "initialization runs.",
    "Complete the product's host-managed BOS authentication before asking any settings",
    "question. If direct sign-in is required, ask only for that action and resume",
    "initialization automatically afterward. Do not perform the original workflow or",
    "substitute generic customer values while configuration remains unresolved. After",
    "the user accepts the consolidated recommendation and the initializer writes and",
    "revalidates `config/customer-settings.json`, reload the effective settings and",
    "resume the original request automatically.",
    ""
  ].join("\n");
  return `${guidance.slice(0, frontmatter[0].length)}\n${preflight}\n${guidance.slice(frontmatter[0].length)}`;
}

export function injectProductInitializationPreflight(guidance, {
  settingsInitializer,
  pluginSettingsInitializer
}) {
  const frontmatter = guidance.match(/^---\s*\n[\s\S]*?^---\s*\n/m);
  if (!frontmatter) {
    throw new Error("Cannot inject product initialization preflight without frontmatter");
  }
  if (!settingsInitializer && !pluginSettingsInitializer) return guidance;
  const lines = [
    "## Product initialization preflight",
    "",
    "Before performing this skill's workflow, preserve the pending request and",
    "complete the product's host-managed BOS authentication. Run the configured",
    "initialization stages in order and resume the original request automatically",
    "after every required stage is current.",
    ""
  ];
  if (settingsInitializer) {
    lines.push(
      "First validate the customer-owned `config/customer-settings.json` against",
      "`config/customer-settings.template.json`. Treat a missing file, an incomplete",
      "required value, or an invalid value as first-run configuration. When detected,",
      `invoke \`${settingsInitializer}\` immediately. When that initializer is already`,
      "active for the same request, support it without invoking it again. Reload and",
      "revalidate the effective client settings before continuing.",
      ""
    );
  }
  if (pluginSettingsInitializer) {
    lines.push(
      "After client settings are current, validate the server plugin-settings",
      "initialization epoch, required canonical field states, and local completion",
      `receipt. Invoke \`${pluginSettingsInitializer}\` when the receipt is missing or`,
      "stale, a required field is unset or invalid partial, or the server schema changed.",
      "Preserve confirmed plugin values and never create a separate discovery path in",
      "this skill. Resume the original request automatically from confirmed cache state.",
      ""
    );
  }
  const preflight = lines.join("\n");
  return `${guidance.slice(0, frontmatter[0].length)}\n${preflight}\n${guidance.slice(frontmatter[0].length)}`;
}

function publicPackagePath(path) {
  const parts = resolve(path).split(sep);
  const name = basename(path);
  return !parts.includes("__pycache__") && !name.endsWith(".pyc");
}

export function materializeMcpUrl(product) {
  const resourceUrl = product?.mcp_resource_url;
  if (typeof resourceUrl !== "string" || !/^https:\/\/[^\s]+$/.test(resourceUrl)) {
    throw new Error(`Runtime ${product?.runtime ?? "unknown"} has no valid MCP resource URL`);
  }
  return resourceUrl;
}

export function codexRawAppId(id) {
  return String(id ?? "").replace(/^plugin_/, "");
}

export function codexConnectorContract(product) {
  const connector = product?.codex_connector;
  if (!connector || connector.lifecycle_state !== "ESTABLISHED" ||
      connector.identity_policy !== "IMMUTABLE" ||
      !/^plugin_asdk_app_[a-z0-9]+$/.test(connector.id ?? "")) {
    throw new Error(`Product ${product?.name ?? "unknown"} has no immutable Codex connector`);
  }
  return connector;
}

export function codexKnownRawAppIds(product) {
  const connector = codexConnectorContract(product);
  return [...new Set([
    codexRawAppId(connector.id),
    ...(connector.retired_ids ?? []).map(codexRawAppId)
  ])];
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
      longDescription: product.long_description ?? product.description,
      developerName: product.publisher,
      category: product.category,
      capabilities: ["Read", "Write"],
      defaultPrompt: product.default_prompts
    }
  };
  if (product.website_url) {
    manifest.homepage = product.website_url;
    manifest.interface.websiteURL = product.website_url;
  }
  if (product.brand_color) manifest.interface.brandColor = product.brand_color;
  if (product.composer_icon) {
    manifest.interface.composerIcon = `./${product.composer_icon}`;
  }
  if (product.logo) manifest.interface.logo = `./${product.logo}`;
  if (product.runtime) manifest.apps = "./.app.json";
  return manifest;
}

export function codexAppManifest(product) {
  if (!product.runtime) return { apps: {} };
  const connector = codexConnectorContract(product);
  return {
    apps: {
      [product.name]: {
        id: connector.id,
        required: connector.required
      }
    }
  };
}

export function claudePluginMcpManifest(product) {
  if (!product.runtime) return { mcpServers: {} };
  return {
    mcpServers: {
      [product.mcp_group_name]: {
        type: "http",
        url: materializeMcpUrl(product)
      }
    }
  };
}

export async function geminiExtensionManifest(product) {
  const manifest = {
    name: product.name,
    version: product.version,
    description: product.description
  };
  if (!product.runtime) return manifest;

  const httpUrl = materializeMcpUrl(product);
  const serverName = product.mcp_group_name;
  manifest.mcpServers = {
    [serverName]: {
      httpUrl,
      oauth: { enabled: true }
    }
  };
  return manifest;
}

export function geminiPluginManifest(product) {
  return {
    $schema: "https://antigravity.google/schemas/v1/plugin.json",
    name: product.name,
    description: `${product.description} Version ${product.version}.`
  };
}

export async function geminiPluginMcpManifest(product) {
  if (!product.runtime) return { mcpServers: {} };
  return {
    mcpServers: {
      [product.mcp_group_name]: {
        serverUrl: materializeMcpUrl(product)
      }
    }
  };
}

export async function copilotMcpManifest(product) {
  if (!product.runtime) return { mcpServers: {} };
  return {
    mcpServers: {
      [product.mcp_group_name]: {
        type: "http",
      url: materializeMcpUrl(product),
        tools: ["*"]
      }
    }
  };
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
