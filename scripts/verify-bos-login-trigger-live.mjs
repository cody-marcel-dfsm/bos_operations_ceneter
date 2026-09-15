#!/usr/bin/env node

import {
  probeBosCodexStaleRefreshRecovery,
  probeBosNativeLoginTrigger
} from "./lib/bos-oauth-live-contract.mjs";
import { join } from "node:path";
import { listProducts, readJson, root } from "./lib/package-model.mjs";

const args = process.argv.slice(2);
let resourceUrl = null;
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

if (!new Set(["json", "text"]).has(format)) {
  throw new Error("--format must be json or text");
}

const resourceUrls = resourceUrl
  ? [resourceUrl]
  : (await readJson(join(root, "contracts", "product-mcp-connections.v1.json")))
    .products.map((product) => product.resource_url);
if (resourceUrls.some((value) => !value)) {
  throw new Error("--resource-url must not be empty");
}
const products = await listProducts();
const businessToolsByResource = new Map(products.map(({ manifest }) => [
  manifest.mcp_resource_url,
  manifest.runtime_verification_tools?.find((name) => name !== "bos_get_context")
]));
const probes = [];
for (const target of resourceUrls) {
  const loginTrigger = await probeBosNativeLoginTrigger({
    resourceUrl: target,
    debug: process.env.BOS_HTTP_DEBUG !== "0"
  });
  const staleRefreshRecovery = await probeBosCodexStaleRefreshRecovery({
    resourceUrl: target,
    businessToolName:
      businessToolsByResource.get(target) ?? "bos_list_plugin_services",
    verifyNonCodexControl: true,
    verifyCodexNearMatchControls: true,
    debug: process.env.BOS_HTTP_DEBUG !== "0"
  });
  probes.push({
    ...loginTrigger,
    status: loginTrigger.status === "passed" &&
      staleRefreshRecovery.status === "passed"
      ? "passed"
      : "failed",
    violations: [
      ...loginTrigger.violations,
      ...staleRefreshRecovery.violations
    ],
    stale_refresh_recovery: staleRefreshRecovery
  });
}
const result = resourceUrl
  ? probes[0]
  : {
      schema_version: "1",
      contract_id: "bos.oauth-native-login-trigger-suite",
      status: probes.every(({ status }) => status === "passed") ? "passed" : "failed",
      products: probes
    };
if (format === "json") {
  console.log(JSON.stringify(result, null, 2));
} else if (result.status === "passed") {
  console.log(`${result.contract_id}: passed (${resourceUrl ?? "all product resources"})`);
} else {
  console.error(`${result.contract_id}: failed`);
  for (const probe of probes) {
    for (const violation of probe.violations) {
      console.error(`${probe.resource_url} ${violation.code}: ${violation.message}`);
    }
  }
}

if (result.status !== "passed") process.exitCode = 1;
