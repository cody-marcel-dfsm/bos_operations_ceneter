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
    "openai_submission",
    "publisher",
    "category",
    "authentication",
    "clients",
    "includes",
    "runtime",
    "application_name",
    "mcp_group_name",
    "mcp_resource_url",
    "codex_mcp_startup_timeout_sec",
    "oauth",
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
  const openaiSubmission = manifest.openai_submission;
  if (manifest.name === "bos" && (
    openaiSubmission === null ||
    typeof openaiSubmission !== "object" ||
    Array.isArray(openaiSubmission)
  )) {
    failures.push(`${path}: BOS requires permanent OpenAI submission source`);
  } else if (openaiSubmission !== undefined) {
    const expectedFields = new Set([
      "import_file",
      "directory_icon",
      "composer_icon"
    ]);
    for (const field of Object.keys(openaiSubmission)) {
      if (!expectedFields.has(field)) {
        failures.push(`${path}: unknown openai_submission field ${field}`);
      }
    }
    for (const field of expectedFields) {
      const value = openaiSubmission[field];
      const extension = field === "import_file" ? /\.json$/i : /\.png$/i;
      if (
        typeof value !== "string" ||
        !value.startsWith("openai/") ||
        value.includes("..") ||
        value.includes("\\") ||
        !extension.test(value)
      ) {
        failures.push(
          `${path}: openai_submission.${field} must be a safe path under openai/`
        );
      }
    }
  }
  if (!["ON_INSTALL", "ON_USE"].includes(manifest.authentication)) {
    failures.push(`${path}: authentication must be ON_INSTALL or ON_USE`);
  }
  if (manifest.name === "bos" && manifest.authentication !== "ON_INSTALL") {
    failures.push(`${path}: BOS authentication must be ON_INSTALL`);
  }
  if (manifest.name !== "bos" && manifest.authentication !== "ON_USE") {
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
  if (manifest.runtime &&
      (!Number.isInteger(manifest.codex_mcp_startup_timeout_sec) ||
        manifest.codex_mcp_startup_timeout_sec <= 30)) {
    failures.push(`${path}: runtime requires codex_mcp_startup_timeout_sec greater than 30`);
  }
  const oauth = manifest.oauth;
  if (manifest.runtime && (!oauth || typeof oauth !== "object" || Array.isArray(oauth))) {
    failures.push(`${path}: runtime requires a complete OAuth target contract`);
  } else if (!manifest.runtime && oauth !== undefined) {
    failures.push(`${path}: OAuth target contract is only valid for a runtime product`);
  } else if (oauth) {
    const expectedOAuthKeys = [
      "authorization_endpoint",
      "authorization_server_issuer",
      "identity_provider",
      "identity_provider_authorization_endpoint",
      "provider_account_selection_policy",
      "provider_account_selection_prompt"
    ];
    if (JSON.stringify(Object.keys(oauth).sort()) !== JSON.stringify(expectedOAuthKeys)) {
      failures.push(`${path}: oauth must contain the complete OAuth target contract`);
    } else {
      let issuer;
      let authorizationEndpoint;
      let providerEndpoint;
      try {
        issuer = new URL(oauth.authorization_server_issuer);
      } catch {
        // The failure below reports the invalid issuer.
      }
      try {
        authorizationEndpoint = new URL(oauth.authorization_endpoint);
      } catch {
        // The failure below reports the invalid endpoint.
      }
      try {
        providerEndpoint = new URL(oauth.identity_provider_authorization_endpoint);
      } catch {
        // The failure below reports the invalid endpoint.
      }
      if (!issuer || issuer.protocol !== "https:" || issuer.username || issuer.password ||
          issuer.pathname !== "/" || issuer.search || issuer.hash ||
          oauth.authorization_server_issuer !== issuer.origin) {
        failures.push(`${path}: oauth.authorization_server_issuer must be an exact HTTPS origin`);
      }
      if (!authorizationEndpoint || authorizationEndpoint.protocol !== "https:" ||
          authorizationEndpoint.username || authorizationEndpoint.password ||
          authorizationEndpoint.pathname === "/" || authorizationEndpoint.search ||
          authorizationEndpoint.hash || authorizationEndpoint.origin !== issuer?.origin) {
        failures.push(`${path}: oauth.authorization_endpoint must be an exact HTTPS endpoint on the authorization-server issuer`);
      }
      if (oauth.identity_provider !== "google") {
        failures.push(`${path}: oauth.identity_provider must be google`);
      }
      if (!providerEndpoint || providerEndpoint.protocol !== "https:" ||
          providerEndpoint.username || providerEndpoint.password ||
          providerEndpoint.hostname !== "accounts.google.com" ||
          providerEndpoint.pathname === "/" || providerEndpoint.search || providerEndpoint.hash) {
        failures.push(`${path}: oauth.identity_provider_authorization_endpoint must be an exact Google HTTPS endpoint`);
      }
      if (oauth.provider_account_selection_policy !== "ALWAYS_SELECT_ACCOUNT" ||
          oauth.provider_account_selection_prompt !== "select_account") {
        failures.push(`${path}: oauth provider account selection must require select_account`);
      }
      try {
        if (issuer && new URL(manifest.mcp_resource_url).origin !== issuer.origin) {
          failures.push(`${path}: BOS resource and OAuth authorization-server issuer must share one origin`);
        }
      } catch {
        // The runtime URL validation above reports an invalid resource URL.
      }
    }
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
  } else if (
    manifest.runtime !== undefined ||
    manifest.application_name !== undefined ||
    manifest.mcp_group_name !== undefined ||
    manifest.mcp_resource_url !== undefined ||
    manifest.codex_mcp_startup_timeout_sec !== undefined ||
    manifest.oauth !== undefined
  ) {
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
  const organizationScoped = injectOrganizationScopePreflight(guidance);
  if (product.settings_initializer && product.plugin_settings_initializer) {
    return injectProductInitializationPreflight(organizationScoped, {
      settingsInitializer: product.settings_initializer,
      pluginSettingsInitializer: product.plugin_settings_initializer
    });
  }
  if (product.settings_initializer) {
    return injectSettingsPreflight(organizationScoped, product.settings_initializer);
  }
  if (product.plugin_settings_initializer) {
    return injectProductInitializationPreflight(organizationScoped, {
      pluginSettingsInitializer: product.plugin_settings_initializer
    });
  }
  return organizationScoped;
}

export function injectOrganizationScopePreflight(guidance) {
  const frontmatter = guidance.match(/^---\s*\n[\s\S]*?^---\s*\n/m);
  if (!frontmatter) {
    throw new Error("Cannot inject organization scope preflight without frontmatter");
  }
  const preflight = [
    "## Organization scope preflight",
    "",
    "Before the first private or organization-scoped operation, follow",
    "`bos-mcp-client` and call `bos_get_context`. Select exactly one authorized",
    "organization in this order: an organization explicitly named in the current request;",
    "the shared `default_organization_label` after exact normalized validation against",
    "the returned organization labels; or the sole authorized organization. Read and",
    "validate the saved label with",
    "`../bos-mcp-client/scripts/client-preferences.mjs`. For tools whose live schema",
    "requires a context selector, pass only the selected role's opaque `context_id`.",
    "Never add organization or context arguments to an operation whose schema derives",
    "scope from the authenticated server context.",
    "Use this same selection for BOS installed-app discovery. Pass only the opaque app",
    "context and API authority returned under that selection to a discovered app MCP",
    "or deterministic HTTPS API; never reconstruct or substitute raw authority IDs.",
    "",
    "When several organizations are available and the default is missing, stale, or",
    "ambiguous, return `configuration_required` and resolve one default before domain",
    "execution. An organization named for the current request overrides the selection",
    "and does not rewrite the saved default. Never fan out across organizations unless",
    "the user explicitly requests that bounded scope. The display-label preference selects among",
    "current server-returned contexts and never grants authority.",
    ""
  ].join("\n");
  return `${guidance.slice(0, frontmatter[0].length)}\n${preflight}\n${guidance.slice(frontmatter[0].length)}`;
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
      "After client settings are current, validate the selected organization's live",
      "plugin-service inventory, organization business profile initialization epoch,",
      "required canonical field states, and local completion",
      `receipt. Invoke \`${pluginSettingsInitializer}\` when the receipt is missing or`,
      "stale, a required field is unset or invalid partial, the server schema changed,",
      "or the active request exposes a service-routing mismatch. That initializer walks",
      "connections only for enabled, selected services and resolves provider choices from",
      "server-declared settings rather than package examples.",
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

export function oauthTargetContract(product) {
  const oauth = product?.oauth;
  if (!oauth || typeof oauth !== "object" || Array.isArray(oauth)) {
    throw new Error(`Runtime ${product?.runtime ?? "unknown"} has no OAuth target contract`);
  }
  return {
    authorization_server_issuer: oauth.authorization_server_issuer,
    authorization_endpoint: oauth.authorization_endpoint,
    identity_provider: oauth.identity_provider,
    identity_provider_authorization_endpoint:
      oauth.identity_provider_authorization_endpoint,
    provider_account_selection_policy: oauth.provider_account_selection_policy,
    provider_account_selection_prompt: oauth.provider_account_selection_prompt
  };
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
  if (product.runtime) manifest.mcpServers = "./.mcp.json";
  return manifest;
}

export function codexPluginMcpManifest(product) {
  if (!product.runtime) return { mcpServers: {} };
  return {
    mcpServers: {
      [product.mcp_group_name]: {
        type: "http",
        url: materializeMcpUrl(product),
        oauth_resource: materializeMcpUrl(product),
        required: true,
        startup_timeout_sec: product.codex_mcp_startup_timeout_sec
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
