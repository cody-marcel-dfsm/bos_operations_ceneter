#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCodexAccountPluginClient } from "./lib/codex-account-plugin-client.mjs";
import {
  codexRawAppId,
  readJson,
  root,
  stableJson
} from "./lib/package-model.mjs";

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--screenshot") options.screenshot = resolve(argv[++index]);
    else if (argv[index] === "--review") options.review = resolve(argv[++index]);
    else if (argv[index] === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function failedConnectorBinding(product, connectorBinding, failure) {
  return {
    schema_version: "1",
    ok: false,
    product_version: product.version,
    connector_binding: connectorBinding,
    failure
  };
}

async function verifyConnectorBinding(product, client) {
  const expectedId = product.codex_connector.id;
  const expectedRawId = codexRawAppId(expectedId);
  const expectedResourceUrl = product.mcp_resource_url;
  let inspection;
  try {
    inspection = await client.inspectConnector(expectedId);
  } catch {
    return failedConnectorBinding(product, {
      connector_id: expectedId,
      resource_url: expectedResourceUrl,
      http_status: null
    }, "registered BOS connector inspection failed");
  }

  const record = inspection.body?.connector ?? inspection.body;
  const observedId = record?.id ?? null;
  const observedResourceUrl = record?.base_url ?? record?.mcp_url ?? null;
  const connectorBinding = {
    connector_id: expectedId,
    resource_url: expectedResourceUrl,
    http_status: inspection.http_status ?? null,
    observed_connector_id: observedId,
    observed_resource_url: observedResourceUrl
  };
  if (!inspection.ok) {
    return failedConnectorBinding(
      product,
      connectorBinding,
      `registered BOS connector resolution failed with HTTP ${inspection.http_status ?? "unknown"}`
    );
  }
  if (codexRawAppId(inspection.app_id) !== expectedRawId ||
      codexRawAppId(observedId) !== expectedRawId) {
    return failedConnectorBinding(
      product,
      connectorBinding,
      "registered BOS connector resolved to a different immutable identity"
    );
  }
  if (observedResourceUrl !== expectedResourceUrl) {
    return failedConnectorBinding(
      product,
      connectorBinding,
      "registered BOS connector does not resolve to the canonical MCP resource"
    );
  }
  return {
    schema_version: "1",
    ok: true,
    product_version: product.version,
    connector_binding: connectorBinding,
    failure: null
  };
}

export async function verifyCodexLoginEvidence(options = {}) {
  const product = await readJson(join(root, "products", "bos", "product.json"));
  const connector = await verifyConnectorBinding(
    product,
    options.client ?? createCodexAccountPluginClient()
  );
  if (!connector.ok) return connector;
  const screenshot = options.screenshot ?? join(
    root,
    "Vault",
    "evidence",
    "codex-login",
    `${product.version}-connect-button.png`
  );
  const review = options.review ?? join(
    root,
    "Vault",
    "evidence",
    "codex-login",
    `${product.version}-connect-button.review.json`
  );
  let image;
  try {
    image = await readFile(screenshot);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {
      schema_version: "1",
      ok: false,
      product_version: product.version,
      connector_binding: connector.connector_binding,
      screenshot,
      review,
      failure: "version-matched Connect/Reconnect screenshot is missing"
    };
  }
  const png = image.length > 1024 &&
    image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!png) return {
    schema_version: "1",
    ok: false,
    product_version: product.version,
    connector_binding: connector.connector_binding,
    screenshot,
    review,
    failure: "acceptance evidence is not a nontrivial PNG screenshot"
  };
  let receipt;
  try {
    receipt = JSON.parse(await readFile(review, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return {
      schema_version: "1",
      ok: false,
      product_version: product.version,
      connector_binding: connector.connector_binding,
      screenshot,
      review,
      failure: "version-matched Oracle visual review receipt is missing or invalid"
    };
  }
  const screenshotSha256 = createHash("sha256").update(image).digest("hex");
  const receiptValid = receipt.schema_version === "1" &&
    receipt.product_version === product.version &&
    receipt.screenshot === basename(screenshot) &&
    receipt.screenshot_sha256 === screenshotSha256 &&
    receipt.surface === "GPT_PLUGIN_DETAIL" &&
    new Set(["Connect", "Reconnect"]).has(receipt.visible_action) &&
    receipt.reviewer === "ORACLE" &&
    receipt.verdict === "APPROVED";
  return {
    schema_version: "1",
    ok: receiptValid,
    product_version: product.version,
    connector_binding: connector.connector_binding,
    screenshot,
    review,
    screenshot_sha256: screenshotSha256,
    visible_action: receiptValid ? receipt.visible_action : null,
    failure: receiptValid
      ? null
      : "Oracle visual review receipt does not match the screenshot and Connect/Reconnect contract"
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await verifyCodexLoginEvidence(options);
  if (options.json) process.stdout.write(stableJson(report));
  else console.log(report.ok ? "Codex Login visual acceptance passed." : report.failure);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
