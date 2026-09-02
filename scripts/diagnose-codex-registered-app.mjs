#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createCodexAccountPluginClient } from "./lib/codex-account-plugin-client.mjs";
import { redactDebugValue } from "./lib/http-debug-log.mjs";
import { root } from "./lib/package-model.mjs";

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
};
const product = JSON.parse(await readFile(
  join(root, "products", "bos", "product.json"),
  "utf8"
));
const appId = value("--app-id") ?? product.codex_connector.id;
const format = value("--format") ?? "json";
if (!new Set(["json", "text"]).has(format)) {
  throw new Error("--format must be json or text");
}

const canonicalAppId = appId.replace(/^plugin_/, "");
const client = createCodexAccountPluginClient({
  debug: process.env.BOS_HTTP_DEBUG !== "0"
});
const result = {
  schema_version: "1",
  contract_id: "bos.codex-registered-app-diagnostic",
  app_id: appId,
  canonical_app_id: canonicalAppId,
  local_package_version: product.version,
  local_plugin: null,
  app_content: null,
  app_listing: null,
  metadata_visibility: null,
  account_plugins: null,
  connector: null,
  errors: []
};

try {
  const localPlugin = await client.readPlugin({
    pluginName: "bos",
    marketplacePath: join(root, ".agents", "plugins", "marketplace.json")
  });
  result.local_plugin = {
    id: localPlugin.plugin.summary.id,
    version: localPlugin.plugin.summary.localVersion,
    installed: localPlugin.plugin.summary.installed,
    enabled: localPlugin.plugin.summary.enabled,
    apps: localPlugin.plugin.apps,
    app_templates: localPlugin.plugin.appTemplates,
    mcp_servers: localPlugin.plugin.mcpServers
  };
} catch (error) {
  result.errors.push({ stage: "plugin/read", message: error.message });
}
try {
  result.app_content = await client.inspectAppContent(canonicalAppId);
} catch (error) {
  result.errors.push({ stage: "app/read", message: error.message });
}
try {
  result.app_listing = await client.inspectAppListing(canonicalAppId);
} catch (error) {
  result.errors.push({ stage: "app/list", message: error.message });
}
try {
  result.account_plugins = await client.inspect(canonicalAppId);
} catch (error) {
  result.errors.push({ stage: "plugin/list", message: error.message });
}
try {
  result.connector = await client.inspectConnector(appId);
} catch (error) {
  result.errors.push({ stage: "connector/read", message: error.message });
}
const visibleApp = result.app_content?.apps?.find(({ id }) => id === canonicalAppId);
const listedApp = result.app_listing?.app ?? null;
result.metadata_visibility = {
  visible: Boolean(visibleApp?.name && visibleApp.name !== visibleApp.id),
  source: visibleApp ? "app/read" : null,
  name: visibleApp?.name ?? null,
  description: visibleApp?.description ?? null,
  listing_visible: Boolean(listedApp?.name && listedApp.name !== listedApp.id),
  listing_accessible: listedApp?.isAccessible ?? null,
  listing_name: listedApp?.name ?? null,
  listing_description: listedApp?.description ?? null,
  listing_distribution_channel: listedApp?.distributionChannel ?? null
};
result.status = result.errors.length === 0 &&
  result.metadata_visibility.visible &&
  result.metadata_visibility.listing_visible
  ? "passed"
  : "failed";

if (format === "json") {
  console.log(JSON.stringify(redactDebugValue(result), null, 2));
} else {
  console.log(`${result.contract_id}: ${result.status}`);
  console.log(`app: ${result.app_id}`);
  console.log(`declared apps: ${result.local_plugin?.apps?.length ?? "unavailable"}`);
  console.log(`app content: ${result.app_content?.apps?.length ?? "unavailable"}`);
  console.log(`metadata visible: ${result.metadata_visibility.visible}`);
  console.log(`app-list metadata visible: ${result.metadata_visibility.listing_visible}`);
  console.log(`app-list accessible: ${result.metadata_visibility.listing_accessible}`);
  console.log(`connector HTTP: ${result.connector?.http_status ?? "unavailable"}`);
  for (const error of result.errors) {
    console.error(`${error.stage}: ${error.message}`);
  }
}

if (result.status !== "passed") process.exitCode = 1;
