import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  codexPluginMcpManifest,
  copyProductAssets,
  copyProductSkills,
  copySettingsTemplate,
  copilotMcpManifest,
  geminiExtensionManifest,
  geminiPluginManifest,
  geminiPluginMcpManifest,
  listProducts,
  marketplaceEntry,
  materializeMcpUrl,
  oauthTargetContract,
  pluginManifest,
  resolveProductSkills,
  root,
  validateProduct,
  writeJson
} from "./lib/package-model.mjs";
import {
  codexLoginSurfaceContract,
  singleBosConnectionContract
} from "./lib/product-contracts.mjs";

const stage = join(root, "tmp", `build-${process.pid}`);
const stagedClients = join(stage, "clients");
const products = await listProducts();
const failures = products.flatMap(({ path, manifest }) =>
  validateProduct(manifest, path)
);
if (failures.length) throw new Error(failures.join("\n"));

const resolved = [];
for (const { manifest } of products) {
  if (manifest.release_status === "disabled") continue;
  resolved.push({
    product: manifest,
    skills: await resolveProductSkills(manifest)
  });
}

await rm(stage, { recursive: true, force: true });
await mkdir(stagedClients, { recursive: true });

const marketplace = {
  name: "bos-education-center",
  interface: { displayName: "BOS + Education Operation Center" },
  plugins: []
};
const claudeMarketplace = {
  name: "bos-education-center",
  description: "Verified BOS and childhood education franchise operations plugins from Infinite State Machines LLC.",
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
      client: "codex",
      application_name: product.application_name,
      mcp_group_name: product.mcp_group_name,
      resource_url: product.runtime ? materializeMcpUrl(product) : undefined,
      codex_mcp_startup_timeout_sec: product.runtime
        ? product.codex_mcp_startup_timeout_sec
        : undefined,
      codex_mcp_tool_timeout_sec: product.runtime
        ? product.codex_mcp_tool_timeout_sec
        : undefined,
      oauth: product.runtime ? oauthTargetContract(product) : undefined,
      runtime_verification_tools: product.runtime_verification_tools,
      connection_owner: "bos",
      authentication: product.runtime ? "oauth_2_1" : "bos_managed"
    });
    await writeJson(
      join(pluginRoot, ".codex-plugin", "plugin.json"),
      pluginManifest(product)
    );
    await copyProductSkills(product, skills, join(pluginRoot, "skills"));
    await copyProductAssets(product, pluginRoot);
    if (product.runtime) {
      await writeJson(join(pluginRoot, ".mcp.json"), codexPluginMcpManifest(product));
    }
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
    const claudeResourceUrl = product.runtime
      ? materializeMcpUrl(product)
      : undefined;
    await writeJson(join(pluginRoot, ".bos-product.json"), {
      schema_version: "1",
      name: product.name,
      version: product.version,
      client: "claude",
      application_name: product.application_name,
      mcp_group_name: product.mcp_group_name,
      ...(product.runtime ? {
        connection_scope: "claude_account",
        resource_url: claudeResourceUrl,
        oauth: oauthTargetContract(product)
      } : {}),
      connection_owner: "bos",
      authentication: product.runtime ? "oauth_2_1" : "bos_managed"
    });
    const claudePlugin = {
      name: product.name,
      displayName: product.display_name,
      version: product.version,
      description: product.description,
      author: { name: product.publisher },
      homepage: product.website_url ?? "https://dfsm.ai",
      repository: "https://github.com/cody-marcel-dfsm/bos_operations_ceneter",
      license: "Apache-2.0",
      keywords: ["bos", "operations", product.name]
    };
    await writeJson(
      join(pluginRoot, ".claude-plugin", "plugin.json"),
      claudePlugin
    );
    await copyProductSkills(product, skills, join(pluginRoot, "skills"));
    await copySettingsTemplate(product, pluginRoot);
    if (product.runtime) {
      await writeFile(
        join(pluginRoot, "CONNECTORS.md"),
        [
          "# Claude account connector",
          "",
          `This plugin uses the account-level Web connector named \`${product.mcp_group_name}\`.`,
          "It must appear under **Customize → Connectors** with its own **Connect** control.",
          "The plugin contains account-connector metadata and no plugin-level MCP declaration.",
          "",
          "For a private or development installation, an account owner adds a custom",
          `connector with the package-owned resource URL \`${claudeResourceUrl}\`, then`,
          "each authorized user completes BOS OAuth from **Customize → Connectors**.",
          "For customer distribution, publish the same resource in Anthropic's Connector",
          "Directory or provision it as an organization connector.",
          "",
          "The Claude account stores and refreshes the resource-scoped grant. The plugin",
          "never requests, stores, or transports a BOS key or OAuth token.",
          ""
        ].join("\n")
      );
    }
    if (product.name === "education-center") {
      await writeFile(
        join(pluginRoot, "README.md"),
        [
          `# ${product.display_name}`,
          "",
          "This plugin is a childhood education franchise-in-a-box operating system for",
          "authenticated adult education center staff. Students and minors are data subjects;",
          "they are never intended",
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
          "## BOS connection and security",
          "",
          "Install and connect the BOS plugin once. Education Operation Center uses that",
          "existing BOS connection and contains no connector, registered app, MCP server,",
          "or separate BOS login. BOS dynamically resolves domain-specific MCP services",
          "and tooling for the authenticated scope and evaluates",
          "organization, installation, role, plugin, capability, provider, and tool",
          "authorization on every private operation.",
          "The customer-facing franchise or brand name is supplied during tenant setup",
          "and applies only to customer-facing copy and output.",
          "Credentials are never included in this package,",
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
      description: product.description
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
      client: "copilot",
      application_name: product.application_name,
      mcp_group_name: product.mcp_group_name,
      resource_url: product.runtime ? materializeMcpUrl(product) : undefined,
      oauth: product.runtime ? oauthTargetContract(product) : undefined,
      connection_owner: "bos",
      authentication: product.runtime ? "oauth_2_1" : "bos_managed"
    });
    if (product.runtime) {
      await writeJson(
        join(productRoot, ".github", "mcp.json"),
        await copilotMcpManifest(product)
      );
    }
    await copyProductSkills(product, skills, target);
    await copySettingsTemplate(product, join(target, ".."));
    await writeFile(
      join(productRoot, "README.md"),
      [
        `# ${product.display_name} for GitHub Copilot`,
        "",
        "Copy `skills/` into the target repository's `.agents/skills/` directory.",
        ...(product.runtime ? [
          "Copy `.github/mcp.json` into the target repository for Copilot CLI, or",
          "copy the server entry into `.vscode/mcp.json` for Copilot in VS Code.",
          "",
          `Run \`/mcp auth ${product.mcp_group_name}\` in Copilot CLI, or select \`Auth\``,
          "above the server entry in VS Code, then complete BOS sign-in. The host",
          "discovers BOS OAuth and stores and refreshes the resource-scoped grant.",
          "GitHub Copilot cloud agent and code review cannot use this remote OAuth",
          "connection until those hosts support OAuth-authenticated MCP servers.",
          "",
          "This package owns the single BOS connection at `/mcp/apps/bos/platform`."
        ] : [
          "Install and authenticate the BOS package once. This subservice adds workflows",
          "through the existing BOS connection and registers no additional MCP server."
        ]),
        "",
        `Verify this product in the target repository with \`npm run install:verify:copilot-runtime -- --target <repository> --product ${product.name}\`.`,
        "Copilot reads repository configuration directly and has no BOS package-cache layer.",
        ""
      ].join("\n")
    );
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
      client: "gemini",
      application_name: product.application_name,
      mcp_group_name: product.mcp_group_name,
      resource_url: product.runtime ? materializeMcpUrl(product) : undefined,
      oauth: product.runtime ? oauthTargetContract(product) : undefined,
      connection_owner: "bos",
      authentication: product.runtime ? "oauth_2_1" : "bos_managed"
    });
    await writeJson(
      join(extensionRoot, "gemini-extension.json"),
      await geminiExtensionManifest(product)
    );
    await writeJson(
      join(extensionRoot, "plugin.json"),
      geminiPluginManifest(product)
    );
    if (product.runtime) {
      await writeJson(
        join(extensionRoot, "mcp_config.json"),
        await geminiPluginMcpManifest(product)
      );
    }
    await copyProductSkills(product, skills, join(extensionRoot, "skills"));
    await copySettingsTemplate(product, extensionRoot);
    await writeFile(
      join(extensionRoot, "README.md"),
      [
        `# ${product.display_name} for Gemini`,
        "",
        "This one Gemini extension supports Gemini CLI and Google Antigravity 2.0 Desktop.",
        "Both surfaces load the same packaged skills and fixed BOS product identity.",
        "",
        "## Gemini CLI",
        "",
        `Install this extension from a terminal with \`gemini extensions install clients/gemini/extensions/${product.name}\`.`,
        "Gemini CLI copies the extension into its managed extension directory.",
        ...(product.runtime ? [
          `Run \`/mcp auth ${product.mcp_group_name}\` and complete BOS sign-in in the browser.`,
          "Gemini CLI discovers BOS OAuth, stores and refreshes the resource-scoped grant,",
          "and connects to the fixed HTTPS MCP route declared by this extension.",
          "",
          "This package owns the single BOS connection at `/mcp/apps/bos/platform`."
        ] : [
          "Install and authenticate the BOS extension once. This subservice adds workflows",
          "through the existing BOS connection and registers no additional MCP server."
        ]),
        "",
        "For a bounded recovery, run `npm run clean-install:gemini -- --confirmation",
        "\"DELETE ALL BOS GEMINI EXTENSION STATE\"`. Restart Gemini CLI after installation",
        "or update. Run `npm run install:verify:gemini-runtime`, `/extensions list`, and",
        "confirm the extension is enabled and `/skills list` to confirm its skills are",
        "discoverable. Use `gemini extensions update " + product.name + "` for later releases.",
        "",
        "## Antigravity 2.0 Desktop",
        "",
        "Run `./scripts/clean-install-antigravity.sh` once from the synced BOS Operations Center",
        "repository. This is an intentionally destructive clean install: it deletes prior BOS",
        "product entries, including local customizations, without backups,",
        "then links every generated Gemini product into `~/.gemini/config/plugins/`.",
        "It resolves the repository from the installer's own location, independent of the",
        "current working directory. Before changing files, it displays the deletion warning and",
        "requires `DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS` as typed confirmation.",
        "After each Git pull, restart Antigravity and run `npm run install:verify:antigravity-runtime`.",
        ...(product.runtime ? [
          `Open Settings > Customizations, find the \`${product.mcp_group_name}\` MCP server,`,
          "select Authenticate, complete BOS sign-in in the browser, and return to Antigravity.",
          "The desktop host stores and refreshes the resource-scoped OAuth grant."
        ] : [
          "Confirm the BOS connection is authenticated, then enable this plugin and its skills."
        ]),
        ""
      ].join("\n")
    );
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

const repositoryCodexMarketplace = {
  ...marketplace,
  plugins: marketplace.plugins.map((entry) => ({
    ...entry,
    source: {
      ...entry.source,
      path: `./clients/codex/plugins/${entry.name}`
    }
  }))
};
const repositoryClaudeMarketplace = {
  ...claudeMarketplace,
  plugins: claudeMarketplace.plugins.map((entry) => ({
    ...entry,
    source: `./clients/claude/plugins/${entry.name}`
  }))
};

const educationCenterCopilot = join(
  stagedClients,
  "copilot",
  "products",
  "education-center",
  "skills"
);
await cp(educationCenterCopilot, join(stagedClients, "copilot", "skills"), {
  recursive: true
});
await writeFile(
  join(stagedClients, "copilot", "README.md"),
  [
    "# BOS Operations Center Copilot Packages",
    "",
    "Select a product under `products/<product>/skills` and install those",
    "skills into the target repository's `.agents/skills` directory. Install the BOS",
    "product once for the shared `.github/mcp.json` connection. Subservice products",
    "add workflows through that connection and include no additional MCP registration.",
    "Run `npm run install:verify:copilot-runtime -- --target <repository> --product <product>`",
    "to compare the repository files directly with the selected generated package.",
    ""
  ].join("\n")
);
await writeFile(
  join(stagedClients, "gemini", "README.md"),
  [
    "# BOS Operations Center Gemini Client",
    "",
    "One generated Gemini extension umbrella supports both Gemini CLI and Google",
    "Antigravity 2.0 Desktop. Each product directory contains shared skills plus the",
    "native manifest and MCP format required by each Google surface.",
    "",
    "## Gemini CLI",
    "",
    "Cleanly install both product extensions from a terminal:",
    "",
    "```bash",
    "npm run clean-install:gemini -- --confirmation \"DELETE ALL BOS GEMINI EXTENSION STATE\"",
    "```",
    "",
    "The equivalent native first-install commands are",
    "`gemini extensions install clients/gemini/extensions/bos` and",
    "`gemini extensions install clients/gemini/extensions/education-center`.",
    "",
    "Restart Gemini CLI. Run `/mcp auth platform`, complete BOS sign-in once, then",
    "run `npm run install:verify:gemini-runtime`, `/extensions list`, and `/skills list`",
    "to verify the native installation and bundled skills.",
    "",
    "## Antigravity 2.0 Desktop",
    "",
    "Run `./scripts/clean-install-antigravity.sh` once. This intentionally destructive clean installer",
    "deletes prior BOS product entries, including local customizations, without backups,",
    "locates this repository from its own file path, and requires typed confirmation of",
    "`DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS` before changing files,",
    "and creates one product symlink in `~/.gemini/config/plugins/` for each active product.",
    "After each Git pull, restart Antigravity, run `npm run install:verify:antigravity-runtime`,",
    "open Settings > Customizations, and",
    "select Authenticate for the `platform` BOS MCP server. Complete BOS sign-in once.",
    "",
    "The Gemini package contains no BOS key, token, authorization header, or client secret.",
    "Each product has detailed CLI and desktop instructions in its own README.",
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

await writeJson(join(root, "clients", "disabled-products.json"), {
  schema_version: "1",
  products: products
    .map(({ manifest }) => manifest)
    .filter(({ release_status }) => release_status === "disabled")
    .map(({ name, application_name, mcp_group_name }) => ({
      name,
      application_name,
      mcp_group_name
    }))
});

// These repository-root entrypoints make the Git repository itself installable
// in Codex and Claude. The all-client uninstaller must preserve source files.
await writeJson(
  join(root, ".agents", "plugins", "marketplace.json"),
  repositoryCodexMarketplace
);
await writeJson(
  join(root, ".claude-plugin", "marketplace.json"),
  repositoryClaudeMarketplace
);

// Product contracts are derived outputs. Product identity and connection
// metadata are authored only in products/<name>/product.json.
const activeProducts = resolved.map(({ product }) => product);
const bosProduct = activeProducts.find(({ name }) => name === "bos");
await writeJson(
  join(root, "contracts", "single-bos-mcp-connection.v1.json"),
  singleBosConnectionContract(activeProducts)
);
await writeJson(
  join(root, "contracts", "codex-login-surface.v1.json"),
  codexLoginSurfaceContract(bosProduct)
);

await rm(stage, { recursive: true, force: true });
console.log(
  `Generated ${resolved.length} active products for Codex, Claude, Copilot, and Gemini.`
);
