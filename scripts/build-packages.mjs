import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  copyProductSkills,
  copyRuntime,
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
  name: "bos-operations-center",
  interface: { displayName: "BOS Operations Center" },
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
    await writeJson(
      join(pluginRoot, ".codex-plugin", "plugin.json"),
      pluginManifest(product)
    );
    await copyProductSkills(skills, join(pluginRoot, "skills"));
    await copyRuntime(product, pluginRoot);
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
    await writeJson(join(pluginRoot, ".claude-plugin", "plugin.json"), {
      name: product.name,
      version: product.version,
      description: product.description,
      author: { name: product.publisher }
    });
    await copyProductSkills(skills, join(pluginRoot, "skills"));
    await copyRuntime(product, pluginRoot);
  }

  if (product.clients.includes("copilot")) {
    const target = join(
      stagedClients,
      "copilot",
      "products",
      product.name,
      "skills"
    );
    await copyProductSkills(skills, target);
  }
}

await writeJson(
  join(stagedClients, "codex", ".agents", "plugins", "marketplace.json"),
  marketplace
);

const iCodeClaude = join(
  stagedClients,
  "claude",
  "plugins",
  "icode-operations-center"
);
await cp(join(iCodeClaude, ".claude-plugin"), join(stagedClients, "claude", ".claude-plugin"), {
  recursive: true
});
await cp(join(iCodeClaude, "skills"), join(stagedClients, "claude", "skills"), {
  recursive: true
});
try {
  await cp(
    join(iCodeClaude, ".mcp.json"),
    join(stagedClients, "claude", ".mcp.json")
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  await writeJson(join(stagedClients, "claude", ".mcp.json"), {
    mcpServers: {}
  });
}

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

for (const client of ["codex", "claude", "copilot"]) {
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
  `Generated ${resolved.length} products for Codex, Claude, and Copilot.`
);
