#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { probePublicOAuthDiscovery, compareDiscoveryReports } from "./lib/public-oauth-discovery-smoke.mjs";

import {
  CANONICAL_RESOURCE_URL,
  probeBosOAuthDiscovery
} from "./lib/bos-oauth-live-contract.mjs";

const args = process.argv.slice(2);
let resourceUrl = CANONICAL_RESOURCE_URL;
let format = "json";
let smoke = false;
let requireDocumentation = false;
let compare;

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--resource-url") {
    resourceUrl = args[index + 1] ?? "";
    index += 1;
  } else if (argument === "--format") {
    format = args[index + 1] ?? "";
    index += 1;
  } else if (argument === "--documentation") {
    requireDocumentation = true;
  } else if (argument === "--smoke") {
    smoke = true;
  } else if (argument === "--compare") {
    compare = args[++index];
    if (!compare) throw new Error("--compare requires a previous smoke report");
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

if (!resourceUrl) throw new Error("--resource-url must not be empty");
if (!new Set(["json", "text"]).has(format)) {
  throw new Error("--format must be json or text");
}

if (requireDocumentation && smoke) throw new Error("--documentation requires strict discovery mode");
if (compare && !smoke) throw new Error("--compare requires --smoke");
const result = smoke ? await probePublicOAuthDiscovery({ resourceUrl }) : await probeBosOAuthDiscovery({
  resourceUrl,
  requireDocumentation,
  debug: process.env.BOS_HTTP_DEBUG !== "0"
});
if (compare) result.comparison = compareDiscoveryReports(JSON.parse(await readFile(compare, "utf8")), result);
if (format === "json") {
  console.log(JSON.stringify(result, null, 2));
} else if (result.status === "passed") {
  console.log(`${result.contract_id ?? result.schema_version}: passed${smoke ? " (public discovery only; login unverified)" : ` (HTTP ${result.http_status})`}`);
} else {
  console.error(`${result.contract_id ?? result.schema_version}: ${result.status}`);
  for (const violation of result.violations ?? result.findings) {
    console.error(`${violation.code}: ${violation.message ?? `${violation.category} at ${violation.operation}`}`);
  }
}

if (result.status !== "passed") process.exitCode = 1;
