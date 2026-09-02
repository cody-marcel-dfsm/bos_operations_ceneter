#!/usr/bin/env node

import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  geminiPluginManifest,
  geminiPluginMcpManifest,
  validateProduct
} from "./lib/package-model.mjs";

const repositoryRoot = process.argv[2];

if (!repositoryRoot) {
  throw new Error("repository root is required");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const productsRoot = join(repositoryRoot, "products");
const extensionsRoot = join(repositoryRoot, "clients", "gemini", "extensions");
const activeNames = [];
const disabledProducts = [];

for (const entry of await readdir(productsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const product = await readJson(join(productsRoot, entry.name, "product.json"));
  const productPath = join(productsRoot, entry.name, "product.json");
  const failures = validateProduct(product, productPath);
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
  if (product.name !== entry.name) {
    throw new Error(`product directory/name mismatch for ${entry.name}`);
  }
  if (product.release_status === "disabled") {
    disabledProducts.push({
      name: product.name,
      application_name: product.application_name,
      mcp_group_name: product.mcp_group_name
    });
    continue;
  }
  if (product.release_status !== "active" || !product.clients?.includes("gemini")) {
    continue;
  }

  const name = product.name;
  const extensionRoot = join(extensionsRoot, name);
  const metadata = await readJson(join(extensionRoot, ".bos-product.json"));
  const plugin = await readJson(join(extensionRoot, "plugin.json"));
  const expectedAuthentication = product.runtime ? "oauth_2_1" : "bos_managed";
  const expectedMetadata = {
    schema_version: "1",
    name,
    version: product.version,
    client: "gemini",
    ...(product.application_name ? { application_name: product.application_name } : {}),
    ...(product.mcp_group_name ? { mcp_group_name: product.mcp_group_name } : {}),
    ...(product.runtime
      ? { resource_url: product.mcp_resource_url, oauth: product.oauth }
      : {}),
    connection_owner: "bos",
    authentication: expectedAuthentication
  };

  if (
    JSON.stringify(metadata) !== JSON.stringify(expectedMetadata) ||
    JSON.stringify(plugin) !== JSON.stringify(geminiPluginManifest(product))
  ) {
    throw new Error(`generated Antigravity manifest parity mismatch for ${name}`);
  }

  if (product.runtime) {
    const mcp = await readJson(join(extensionRoot, "mcp_config.json"));
    const expectedMcp = await geminiPluginMcpManifest(product, repositoryRoot);
    if (JSON.stringify(mcp) !== JSON.stringify(expectedMcp)) {
      throw new Error(`generated Antigravity MCP configuration mismatch for ${name}`);
    }
  } else {
    try {
      await access(join(extensionRoot, "mcp_config.json"));
      throw new Error(`BOS subservice ${name} declares an additional MCP configuration`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  activeNames.push(name);
}

if (activeNames.length === 0) {
  throw new Error("no active Gemini products were declared");
}

const disabledInventory = await readJson(
  join(repositoryRoot, "clients", "disabled-products.json")
);
const expectedDisabled = disabledProducts.sort((left, right) =>
  left.name.localeCompare(right.name)
);
const actualDisabled = [...(disabledInventory.products ?? [])].sort((left, right) =>
  left.name.localeCompare(right.name)
);
if (
  disabledInventory.schema_version !== "1" ||
  JSON.stringify(actualDisabled) !== JSON.stringify(expectedDisabled)
) {
  throw new Error("generated disabled-product inventory mismatch");
}

process.stdout.write(
  [
    ...activeNames.sort().map((name) => `active:${name}`),
    ...expectedDisabled.map(({ name }) => `disabled:${name}`)
  ].join("\n") + "\n"
);
