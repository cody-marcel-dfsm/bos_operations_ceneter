#!/usr/bin/env node

import {
  DEFAULT_AUTH_TOOL,
  probeBosToolAuthentication
} from "./lib/bos-tool-auth-live-contract.mjs";
import { CANONICAL_RESOURCE_URL } from "./lib/bos-oauth-live-contract.mjs";

const args = process.argv.slice(2);
let resourceUrl = CANONICAL_RESOURCE_URL;
let toolName = DEFAULT_AUTH_TOOL;
let format = "json";

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--resource-url") {
    resourceUrl = args[index + 1] ?? "";
    index += 1;
  } else if (argument === "--tool") {
    toolName = args[index + 1] ?? "";
    index += 1;
  } else if (argument === "--format") {
    format = args[index + 1] ?? "";
    index += 1;
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

if (!resourceUrl) throw new Error("--resource-url must not be empty");
if (!toolName) throw new Error("--tool must not be empty");
if (!new Set(["json", "text"]).has(format)) {
  throw new Error("--format must be json or text");
}

const probe = await probeBosToolAuthentication({
  resourceUrl,
  toolName,
  debug: process.env.BOS_HTTP_DEBUG !== "0"
});

if (format === "json") {
  console.log(JSON.stringify(probe, null, 2));
} else if (probe.status === "passed") {
  console.log(`${probe.contract_id}: passed (${probe.tool_name})`);
} else {
  console.error(`${probe.contract_id}: failed`);
  for (const violation of probe.violations) {
    console.error(`${violation.code}: ${violation.message}`);
  }
}

if (probe.status !== "passed") process.exitCode = 1;
