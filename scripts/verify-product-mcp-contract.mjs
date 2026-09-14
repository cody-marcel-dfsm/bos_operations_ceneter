#!/usr/bin/env node

import { resolve } from "node:path";
import {
  verifyExternalProductPackage,
  verifyProductMcpContract
} from "./lib/product-mcp-contract.mjs";

const args = process.argv.slice(2);
let targetRoot = resolve(import.meta.dirname, "..");
let format = "json";
let oauthAuthorizeUrl;
let productName = "bos";
let externalProductRoot;

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--root") targetRoot = resolve(args[++index] ?? "");
  else if (argument === "--format") format = args[++index] ?? "";
  else if (argument === "--oauth-authorize-url") oauthAuthorizeUrl = args[++index] ?? "";
  else if (argument === "--product") productName = args[++index] ?? "";
  else if (argument === "--external-product-root") {
    externalProductRoot = resolve(args[++index] ?? "");
  }
  else throw new Error(`Unknown argument: ${argument}`);
}
if (!new Set(["json", "text"]).has(format)) throw new Error("--format must be json or text");
if (externalProductRoot && oauthAuthorizeUrl) {
  throw new Error("--external-product-root cannot be combined with --oauth-authorize-url");
}

const result = externalProductRoot
  ? await verifyExternalProductPackage({
    root: targetRoot,
    packageRoot: externalProductRoot
  })
  : await verifyProductMcpContract({
    root: targetRoot,
    oauthAuthorizeUrl,
    productName
  });
if (format === "json") console.log(JSON.stringify(result, null, 2));
else if (result.status === "passed") console.log(`${result.contract_id}: passed`);
else {
  console.error(`${result.contract_id}: failed`);
  for (const violation of result.violations) {
    console.error(`${violation.code}: ${violation.path}: ${violation.message}`);
  }
}
if (result.status !== "passed") process.exitCode = 1;
