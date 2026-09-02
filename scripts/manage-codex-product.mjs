#!/usr/bin/env node

import { rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCodexAccountPluginClient } from "./lib/codex-account-plugin-client.mjs";
import {
  connectorContractForProvisionedId,
  establishedConnectorFromProduct,
  planEstablishedConnectorSync,
  planNewProductProvisioning
} from "./lib/codex-product-lifecycle.mjs";
import { codexRawAppId, readJson, root, stableJson } from "./lib/package-model.mjs";

function parseArgs(argv) {
  const [command = "inspect", ...rest] = argv;
  const options = { command, product: "bos", json: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--product") options.product = rest[++index];
    else if (argument === "--plugin-path") options.pluginPath = resolve(rest[++index]);
    else if (argument === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!new Set(["inspect", "sync", "provision"]).has(command)) {
    throw new Error(`Unsupported product lifecycle command: ${command}`);
  }
  return options;
}

function remotePluginId(result) {
  return result?.remotePluginId ?? result?.remote_plugin_id ?? result?.plugin?.remotePluginId;
}

function failedInspection(product, result) {
  const configured = establishedConnectorFromProduct(product);
  if (result.http_status === 404) {
    return { ok: false, ...planEstablishedConnectorSync(product, null), http_status: 404 };
  }
  if ([401, 403].includes(result.http_status)) {
    return {
      ok: false,
      state: "authentication_required",
      action: "authenticate_codex_account",
      connector_id: configured.id,
      http_status: result.http_status
    };
  }
  return {
    ok: false,
    state: result.http_status >= 500 ? "registry_unavailable" : "registry_request_failed",
    action: "retry_inspection",
    connector_id: configured.id,
    http_status: result.http_status
  };
}

function inspectionPlan(product, result) {
  if (!result.ok) return failedInspection(product, result);
  const record = result.body?.connector ?? result.body;
  return {
    ok: true,
    ...planEstablishedConnectorSync(product, record),
    http_status: result.http_status
  };
}

function sharedPlugins(listing) {
  if (Array.isArray(listing)) return listing;
  return listing?.plugins ?? listing?.data ?? listing?.sharedPlugins ?? [];
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function sharedPluginMetadata(entry) {
  return {
    name: firstDefined(
      entry?.name,
      entry?.displayName,
      entry?.summary?.name,
      entry?.summary?.displayName
    ),
    description: firstDefined(entry?.description, entry?.summary?.description),
    mcp_url: firstDefined(
      entry?.mcp_url,
      entry?.mcpUrl,
      entry?.base_url,
      entry?.baseUrl,
      entry?.url,
      entry?.summary?.mcp_url,
      entry?.summary?.mcpUrl,
      entry?.summary?.base_url,
      entry?.summary?.baseUrl
    ),
    website_url: firstDefined(
      entry?.website_url,
      entry?.websiteUrl,
      entry?.branding?.website,
      entry?.summary?.website_url,
      entry?.summary?.websiteUrl,
      entry?.summary?.branding?.website
    ),
    logo: firstDefined(
      entry?.logo,
      entry?.logo_url,
      entry?.logoUrl,
      entry?.branding?.logo,
      entry?.summary?.logo,
      entry?.summary?.logo_url,
      entry?.summary?.logoUrl,
      entry?.summary?.branding?.logo
    )
  };
}

function interruptedProvisioningCandidate(product, listing) {
  const desired = planNewProductProvisioning(product).metadata;
  const candidates = sharedPlugins(listing)
    .map((entry) => ({ entry, metadata: sharedPluginMetadata(entry) }))
    .filter(({ metadata }) =>
      metadata.name === desired.name || metadata.mcp_url === desired.mcp_url
    );
  if (!candidates.length) return null;
  const exact = candidates.filter(({ entry, metadata }) =>
    stableJson(metadata) === stableJson(desired) &&
    /^plugin_asdk_app_[a-z0-9]+$/.test(remotePluginId(entry) ?? "")
  );
  // Any partial, mismatched, duplicate, or identity-less match is ambiguous.
  // Failing here prevents a retry from minting another record after a create
  // whose registry projection cannot be proven identical to product.json.
  if (candidates.length !== 1 || exact.length !== 1) {
    throw new Error("New-product provisioning found ambiguous prior registry state");
  }
  return exact[0].entry;
}

async function recordProvisionedConnector(productPath, product, remoteId) {
  const connector = connectorContractForProvisionedId(product, remoteId);
  const updated = { ...product, codex_connector: connector };
  const temporary = `${productPath}.tmp-${process.pid}`;
  await writeFile(temporary, stableJson(updated));
  await rename(temporary, productPath);
  return connector;
}

export async function manageCodexProduct(rawOptions = {}) {
  const options = { product: "bos", command: "inspect", ...rawOptions };
  const productPath = options.productPath ??
    join(root, "products", options.product, "product.json");
  const product = options.productManifest ?? await readJson(productPath);
  if (product.name !== options.product) {
    throw new Error(
      `Product source mismatch: requested ${options.product}, found ${product.name}`
    );
  }
  const client = options.client ?? createCodexAccountPluginClient();

  if (options.command === "inspect") {
    const configured = establishedConnectorFromProduct(product);
    const result = await client.inspectConnector(configured.id);
    return {
      schema_version: "1",
      product: product.name,
      operation: "inspect",
      ...inspectionPlan(product, result)
    };
  }

  const pluginPath = options.pluginPath ??
    join(root, "clients", "codex", "plugins", product.name);

  if (options.command === "sync") {
    const configured = establishedConnectorFromProduct(product);
    const inspection = await client.inspectConnector(configured.id);
    const plan = inspectionPlan(product, inspection);
    if (plan.action !== "update_in_place") {
      return { schema_version: "1", product: product.name, operation: "sync", ...plan };
    }
    // Existing records use the connector-settings API's supported exact-ID
    // metadata patches. A missing record stays a registry-owner restoration
    // requirement because the account API's create route always mints a new
    // identity. The post-read below proves both identity and resource binding.
    const updated = await client.updateEstablishedConnector(
      configured.id,
      Object.fromEntries(Object.entries(plan.changes).map(([field, change]) => [field, change.to]))
    );
    const observed = updated?.connectorId;
    if (!observed) {
      throw new Error("Metadata synchronization returned no connector identity");
    }
    if (codexRawAppId(observed) !== configured.raw_id) {
      throw new Error(`Metadata synchronization changed connector identity to ${observed}`);
    }
    const verification = inspectionPlan(
      product,
      await client.inspectConnector(configured.id)
    );
    if (!verification.ok || verification.action !== "none") {
      throw new Error("Metadata synchronization did not verify the permanent connector record");
    }
    return {
      schema_version: "1",
      ok: true,
      product: product.name,
      operation: "sync",
      state: "synchronized",
      action: "updated_in_place",
      connector_id: configured.id,
      changes: plan.changes
    };
  }

  const plan = planNewProductProvisioning(product);
  if (plan.action !== "provision_once") {
    return { schema_version: "1", ok: true, product: product.name, operation: "provision", ...plan };
  }
  // Provisioning is reserved for a disabled product that has never had an ID.
  // The returned ID is written immediately into that product's sole source file;
  // every later run follows the established-product path.
  // A retry first reconciles an interrupted prior creation by exact product
  // fingerprint. Ambiguous state fails before another registry record exists.
  const prior = interruptedProvisioningCandidate(
    product,
    await client.inspectSharedPlugins()
  );
  const savedId = prior
    ? remotePluginId(prior)
    : remotePluginId(await client.provisionNewProduct(pluginPath));
  const connector = await recordProvisionedConnector(productPath, product, savedId);
  return {
    schema_version: "1",
    ok: true,
    product: product.name,
    operation: "provision",
    state: "provisioned",
    action: "recorded_product_identity",
    connector_id: connector.id
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await manageCodexProduct(options);
  if (options.json) process.stdout.write(stableJson(report));
  else console.log(JSON.stringify(report, null, 2));
  if (report.ok === false) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
