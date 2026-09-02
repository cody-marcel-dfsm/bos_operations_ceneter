#!/usr/bin/env node

import {
  CANONICAL_RESOURCE_URL,
  probeBosOAuthDiscovery
} from "./lib/bos-oauth-live-contract.mjs";

const args = process.argv.slice(2);
let resourceUrl = CANONICAL_RESOURCE_URL;
let format = "json";

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--resource-url") {
    resourceUrl = args[index + 1] ?? "";
    index += 1;
  } else if (argument === "--format") {
    format = args[index + 1] ?? "";
    index += 1;
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

if (!resourceUrl) throw new Error("--resource-url must not be empty");
if (!new Set(["json", "text"]).has(format)) {
  throw new Error("--format must be json or text");
}

const result = await probeBosOAuthDiscovery({
  resourceUrl,
  debug: process.env.BOS_HTTP_DEBUG !== "0"
});
if (format === "json") {
  console.log(JSON.stringify(result, null, 2));
} else if (result.status === "passed") {
  console.log(`${result.contract_id}: passed (HTTP ${result.http_status})`);
} else {
  console.error(`${result.contract_id}: failed`);
  for (const violation of result.violations) {
    console.error(`${violation.code}: ${violation.message}`);
  }
}

if (result.status !== "passed") process.exitCode = 1;
