#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, root, stableJson } from "./lib/package-model.mjs";

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

export async function verifyCodexLoginEvidence(options = {}) {
  const product = await readJson(join(root, "products", "bos", "product.json"));
  const pluginRoot = join(root, "clients", "codex", "plugins", "bos");
  const plugin = await readJson(join(pluginRoot, ".codex-plugin", "plugin.json"));
  const mcp = await readJson(join(pluginRoot, ".mcp.json"));
  const entries = Object.entries(mcp.mcpServers ?? {});
  const [name, server] = entries[0] ?? [];
  const packageBinding = entries.length === 1 &&
    plugin.mcpServers === "./.mcp.json" &&
    !("apps" in plugin) &&
    name === product.mcp_group_name &&
    server?.type === "http" &&
    server?.url === product.mcp_resource_url &&
    server?.oauth_resource === product.mcp_resource_url &&
    server?.required === true &&
    server?.startup_timeout_sec === product.codex_mcp_startup_timeout_sec &&
    JSON.stringify(Object.keys(server ?? {}).sort()) ===
      JSON.stringify(["oauth_resource", "required", "startup_timeout_sec", "type", "url"]);
  const serialized = await readFile(join(pluginRoot, ".mcp.json"), "utf8");
  const forbiddenOpenAiTarget = /auth\.openai\.com|chatgpt\.com/i.test(serialized);
  const packageBindingReport = {
    plugin_manifest: ".codex-plugin/plugin.json",
    mcp_manifest: ".mcp.json",
    server_name: name ?? null,
    server_type: server?.type ?? null,
    resource_url: server?.url ?? null,
    oauth_resource: server?.oauth_resource ?? null,
    required: server?.required ?? null,
    startup_timeout_sec: server?.startup_timeout_sec ?? null
  };
  if (!packageBinding || forbiddenOpenAiTarget) return {
    schema_version: "1",
    ok: false,
    product_version: product.version,
    package_binding: packageBindingReport,
    oauth_authorization_endpoint: product.oauth.authorization_endpoint,
    failure: "Codex package does not declare the canonical package-owned BOS MCP binding"
  };
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
      package_binding: packageBindingReport,
      oauth_authorization_endpoint: product.oauth.authorization_endpoint,
      screenshot,
      review,
      failure: "version-matched BOS authentication-action screenshot is missing"
    };
  }
  const png = image.length > 1024 &&
    image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!png) return {
    schema_version: "1",
    ok: false,
    product_version: product.version,
    package_binding: packageBindingReport,
    oauth_authorization_endpoint: product.oauth.authorization_endpoint,
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
      package_binding: packageBindingReport,
      oauth_authorization_endpoint: product.oauth.authorization_endpoint,
      screenshot,
      review,
      failure: "version-matched Oracle visual review receipt is missing or invalid"
    };
  }
  const screenshotSha256 = createHash("sha256").update(image).digest("hex");
  const allowedActions = new Set(["Connect", "Sign in", "Authenticate", "Reconnect"]);
  const receiptValid = receipt.schema_version === "1" &&
    receipt.product_version === product.version &&
    receipt.screenshot === basename(screenshot) &&
    receipt.screenshot_sha256 === screenshotSha256 &&
    receipt.surface === "GPT_PLUGIN_DETAIL" &&
    allowedActions.has(receipt.visible_action) &&
    receipt.observed_authorization_target === product.oauth.authorization_endpoint &&
    receipt.reviewer === "ORACLE" &&
    receipt.verdict === "APPROVED";
  return {
    schema_version: "1",
    ok: receiptValid,
    product_version: product.version,
    package_binding: packageBindingReport,
    oauth_authorization_endpoint: product.oauth.authorization_endpoint,
    screenshot,
    review,
    screenshot_sha256: screenshotSha256,
    visible_action: receiptValid ? receipt.visible_action : null,
    observed_authorization_target: receiptValid ? receipt.observed_authorization_target : null,
    failure: receiptValid
      ? null
      : "Oracle visual review receipt does not match the screenshot, BOS authentication action, and exact BOS authorization target"
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await verifyCodexLoginEvidence(options);
  if (options.json) process.stdout.write(stableJson(report));
  else console.log(report.ok ? "Codex BOS login visual acceptance passed." : report.failure);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
