import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  copyProductSkills,
  copyRuntime,
  copySettingsTemplate,
  geminiExtensionManifest,
  listProducts,
  marketplaceEntry,
  pluginManifest,
  resolveProductSkills,
  root,
  validateProduct,
  writeJson
} from "./lib/package-model.mjs";

const stage = join(root, "tmp", `build-${process.pid}`);
const stagedClients = join(stage, "clients");
const products = await listProducts();
const failures = products.flatMap(({ path, manifest }) =>
  validateProduct(manifest, path)
);
if (failures.length) throw new Error(failures.join("\n"));

const resolved = [];
for (const { manifest } of products) {
  resolved.push({
    product: manifest,
    skills: await resolveProductSkills(manifest)
  });
}

await rm(stage, { recursive: true, force: true });
await mkdir(stagedClients, { recursive: true });

const marketplace = {
  name: "bos-icode",
  interface: { displayName: "BOS + iCode" },
  plugins: []
};
const claudeMarketplace = {
  name: "bos-icode",
  description: "Verified BOS and iCode operational plugins from Infinite State Machines LLC.",
  owner: { name: "Infinite State Machines LLC" },
  plugins: []
};

for (const { product, skills } of resolved) {
  if (product.clients.includes("codex")) {
    const pluginRoot = join(
      stagedClients,
      "codex",
      "plugins",
      product.name
    );
    await mkdir(join(pluginRoot, ".codex-plugin"), { recursive: true });
    await writeJson(join(pluginRoot, ".bos-product.json"), {
      schema_version: "1",
      name: product.name,
      version: product.version,
      client: "codex"
    });
    await writeJson(
      join(pluginRoot, ".codex-plugin", "plugin.json"),
      pluginManifest(product)
    );
    await copyProductSkills(skills, join(pluginRoot, "skills"));
    await copyRuntime(product, pluginRoot);
    await copySettingsTemplate(product, pluginRoot);
    marketplace.plugins.push(marketplaceEntry(product));
  }

  if (product.clients.includes("claude")) {
    const pluginRoot = join(
      stagedClients,
      "claude",
      "plugins",
      product.name
    );
    await mkdir(join(pluginRoot, ".claude-plugin"), { recursive: true });
    await writeJson(join(pluginRoot, ".bos-product.json"), {
      schema_version: "1",
      name: product.name,
      version: product.version,
      client: "claude"
    });
    await writeJson(join(pluginRoot, ".claude-plugin", "plugin.json"), {
      name: product.name,
      displayName: product.display_name,
      version: product.version,
      description: product.description,
      author: { name: product.publisher },
      homepage: "https://dfsm.ai",
      repository: "https://github.com/cody-marcel-dfsm/bos_operations_ceneter",
      license: "Apache-2.0",
      keywords: ["bos", "operations", product.name]
    });
    await copyProductSkills(skills, join(pluginRoot, "skills"));
    await copyRuntime(product, pluginRoot);
    await copySettingsTemplate(product, pluginRoot);
    if (product.name === "icode-operations-center") {
      await writeFile(
        join(pluginRoot, "README.md"),
        [
          "# iCode Operations Center",
          "",
          "This plugin supports legitimate school administration by authenticated adult",
          "iCode staff. Students and minors are data subjects; they are never intended",
          "users or operators of this plugin.",
          "",
          "## Data access and purpose",
          "",
          "The plugin accesses only the tenant-scoped school records needed for a",
          "user-requested operational task such as rosters, enrollment reconciliation,",
          "class capacity, trial scheduling, parent or guardian communication, and",
          "progress-report administration. BOS enforces organization, installation, role,",
          "and capability authorization on every private operation.",
          "",
          "The workflows require minimum-necessary disclosure, exclude unrelated family",
          "notes and opaque identifiers, and prohibit publishing or distributing student",
          "or family records without a separate authorized request. They do not make",
          "admissions, disciplinary, eligibility, or other high-impact decisions about",
          "students.",
          "",
          "## Authentication and security",
          "",
          "The remote HTTPS MCP uses the client-configured `BOS_API_KEY` bearer credential",
          "and `BOS_INSTALLED_APP_ID`. Credentials are never included in this package,",
          "conversation content, logs, or tool arguments.",
          "",
          "## Privacy and support",
          "",
          "Privacy policy: https://dfsm.ai/apps/bos/privacy.html",
          "",
          "Support and product documentation: https://dfsm.ai/apps/bos/",
          ""
        ].join("\n")
      );
    }
    claudeMarketplace.plugins.push({
      name: product.name,
      source: `./plugins/${product.name}`,
      description: product.description,
      version: product.version
    });
  }

  if (product.clients.includes("copilot")) {
    const productRoot = join(
      stagedClients,
      "copilot",
      "products",
      product.name
    );
    const target = join(productRoot, "skills");
    await writeJson(join(productRoot, ".bos-product.json"), {
      schema_version: "1",
      name: product.name,
      version: product.version,
      client: "copilot"
    });
    await copyProductSkills(skills, target);
    await copySettingsTemplate(product, join(target, ".."));
  }

  if (product.clients.includes("gemini")) {
    const extensionRoot = join(
      stagedClients,
      "gemini",
      "extensions",
      product.name
    );
    await writeJson(join(extensionRoot, ".bos-product.json"), {
      schema_version: "1",
      name: product.name,
      version: product.version,
      client: "gemini"
    });
    await writeJson(
      join(extensionRoot, "gemini-extension.json"),
      await geminiExtensionManifest(product)
    );
    await copyProductSkills(skills, join(extensionRoot, "skills"));
    await copySettingsTemplate(product, extensionRoot);
  }
}

await writeJson(
  join(stagedClients, "codex", ".agents", "plugins", "marketplace.json"),
  marketplace
);
await writeJson(
  join(stagedClients, "claude", ".claude-plugin", "marketplace.json"),
  claudeMarketplace
);

const iCodeCopilot = join(
  stagedClients,
  "copilot",
  "products",
  "icode-operations-center",
  "skills"
);
await cp(iCodeCopilot, join(stagedClients, "copilot", "skills"), {
  recursive: true
});
await writeFile(
  join(stagedClients, "copilot", "README.md"),
  [
    "# BOS Operations Center Copilot Packages",
    "",
    "Select a product under `products/<product>/skills` and install those",
    "skills into the target repository's `.agents/skills` directory.",
    ""
  ].join("\n")
);

for (const client of ["codex", "claude", "copilot", "gemini"]) {
  const target = join(root, "clients", client);
  const staged = join(stagedClients, client);
  const backup = join(stage, `${client}-previous`);
  await rm(backup, { recursive: true, force: true });
  try {
    await rename(target, backup);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await rename(staged, target);
  } catch (error) {
    try {
      await rename(backup, target);
    } catch {
      // The original error remains the primary build failure.
    }
    throw error;
  }
}

await rm(stage, { recursive: true, force: true });
console.log(
  `Generated ${resolved.length} products for Codex, Claude, Copilot, and Gemini.`
);
