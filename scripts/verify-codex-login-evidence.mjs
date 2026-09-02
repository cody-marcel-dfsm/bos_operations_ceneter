#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
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
    screenshot,
    review,
    screenshot_sha256: screenshotSha256,
    visible_action: receiptValid ? receipt.visible_action : null,
    failure: receiptValid
      ? null
      : "Oracle visual review receipt does not match the screenshot and Connect/Reconnect contract"
  };
}

const options = parseArgs(process.argv.slice(2));
const report = await verifyCodexLoginEvidence(options);
if (options.json) process.stdout.write(stableJson(report));
else console.log(report.ok ? "Codex Login visual acceptance passed." : report.failure);
if (!report.ok) process.exitCode = 1;
