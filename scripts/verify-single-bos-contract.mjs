#!/usr/bin/env node

import { resolve } from "node:path";

import { verifySingleBosContract } from "./lib/single-bos-contract.mjs";

const args = process.argv.slice(2);
let targetRoot = resolve(import.meta.dirname, "..");
let format = "json";
let oauthAuthorizeUrl;

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--root") {
    targetRoot = resolve(args[index + 1] ?? "");
    index += 1;
  } else if (argument === "--format") {
    format = args[index + 1] ?? "";
    index += 1;
  } else if (argument === "--oauth-authorize-url") {
    oauthAuthorizeUrl = args[index + 1] ?? "";
    index += 1;
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

if (!new Set(["json", "text"]).has(format)) {
  throw new Error("--format must be json or text");
}

const result = await verifySingleBosContract({
  root: targetRoot,
  oauthAuthorizeUrl
});
if (format === "json") {
  console.log(JSON.stringify(result, null, 2));
} else if (result.status === "passed") {
  console.log(`${result.contract_id}: passed (${result.resource_url})`);
} else {
  console.error(`${result.contract_id}: failed`);
  for (const violation of result.violations) {
    console.error(`${violation.code}: ${violation.path}: ${violation.message}`);
  }
}

if (result.status !== "passed") process.exitCode = 1;
