import { basename, join, relative } from "node:path";
import { readFile } from "node:fs/promises";

import {
  listProducts,
  materializeMcpUrl,
  oauthTargetContract,
  pathExists,
  readJson
} from "./package-model.mjs";

function finding(code, path, message) {
  return { code, path: path.replaceAll("\\", "/"), message };
}

export function inspectOAuthAuthorizeTarget(authorizeUrl, resourceUrl, oauth) {
  if (!authorizeUrl) return [];
  let actual;
  let expected;
  try {
    actual = new URL(authorizeUrl);
    expected = new URL(oauth.authorization_endpoint);
  } catch {
    return [finding("oauth_authorize_url", "oauth-authorize-url", "OAuth authorization evidence must be an absolute URL.")];
  }
  const findings = [];
  if (actual.protocol !== expected.protocol || actual.host !== expected.host ||
      actual.pathname !== expected.pathname || actual.username || actual.password || actual.hash) {
    findings.push(finding(
      "oauth_authorize_target",
      "oauth-authorize-url",
      `OAuth authorization must use ${expected.origin}${expected.pathname}.`
    ));
  }
  const resources = actual.searchParams.getAll("resource");
  if (resources.length !== 1 || resources[0] !== resourceUrl) {
    findings.push(finding(
      "oauth_resource_target",
      "oauth-authorize-url",
      `OAuth resource must equal ${resourceUrl}.`
    ));
  }
  return findings;
}

function contractResult(contract, violations) {
  const unique = [...new Map(
    violations.map((item) => [`${item.code}\0${item.path}\0${item.message}`, item])
  ).values()].sort((left, right) =>
    `${left.code}\0${left.path}`.localeCompare(`${right.code}\0${right.path}`)
  );
  return {
    schema_version: "1",
    contract_id: contract.contract_id ?? "bos.product-mcp-connections",
    status: unique.length ? "failed" : "passed",
    foundation_product: contract.foundation_product,
    products: contract.products,
    request_time_authentication: contract.request_time_authentication,
    violations: unique
  };
}

export async function verifyProductMcpContract({
  root,
  contractPath = join(root, "contracts", "product-mcp-connections.v1.json"),
  oauthAuthorizeUrl,
  productName = "bos"
}) {
  const contract = await readJson(contractPath);
  const violations = [];
  if (contract.schema_version !== "1" ||
      contract.contract_id !== "bos.product-mcp-connections" ||
      contract.foundation_product !== "bos" ||
      contract.dependency_policy !== "DEPENDENT_PRODUCTS_REQUIRE_BOS" ||
      contract.connection_policy !== "EACH_PRODUCT_OWNS_ONE_SCOPED_MCP" ||
      !Array.isArray(contract.products) || contract.products.length === 0) {
    violations.push(finding("contract_shape", relative(root, contractPath), "Product MCP contract shape is invalid."));
    return contractResult(contract, violations);
  }

  const allProducts = (await listProducts(root)).map(({ manifest }) => manifest);
  const activeProducts = allProducts.filter(({ release_status }) => release_status === "active");
  const expectedProducts = activeProducts.filter(({ runtime }) => runtime)
    .sort((left, right) => left.name.localeCompare(right.name));
  const contractNames = contract.products.map(({ name }) => name);
  if (JSON.stringify(contractNames) !== JSON.stringify(expectedProducts.map(({ name }) => name))) {
    violations.push(finding("product_inventory", relative(root, contractPath), "Contract runtime-product inventory differs from active product manifests."));
  }

  const selected = contract.products.find(({ name }) => name === productName);
  if (oauthAuthorizeUrl && !selected) {
    violations.push(finding("unknown_product", "oauth-authorize-url", `Unknown contract product ${productName}.`));
  } else if (oauthAuthorizeUrl) {
    violations.push(...inspectOAuthAuthorizeTarget(
      oauthAuthorizeUrl,
      selected.resource_url,
      selected.oauth
    ));
  }

  const routes = new Set();
  const resources = new Set();
  for (const product of expectedProducts) {
    const entry = contract.products.find(({ name }) => name === product.name);
    const expectedEntry = {
      name: product.name,
      dependencies: product.dependencies,
      application_name: product.application_name,
      mcp_group_name: product.mcp_group_name,
      resource_url: materializeMcpUrl(product),
      oauth: oauthTargetContract(product),
      authentication: product.authentication,
      codex_mcp_startup_timeout_sec: product.codex_mcp_startup_timeout_sec,
      codex_mcp_tool_timeout_sec: product.codex_mcp_tool_timeout_sec,
      connection_artifacts: [
        `clients/claude/plugins/${product.name}/CONNECTORS.md`,
        `clients/codex/plugins/${product.name}/.mcp.json`,
        `clients/copilot/products/${product.name}/.github/mcp.json`,
        `clients/gemini/extensions/${product.name}/mcp_config.json`
      ]
    };
    if (JSON.stringify(entry) !== JSON.stringify(expectedEntry)) {
      violations.push(finding("product_contract_drift", `products/${product.name}/product.json`, "Generated product MCP contract differs from its manifest."));
      continue;
    }
    if (product.name !== contract.foundation_product && !product.dependencies.includes(contract.foundation_product)) {
      violations.push(finding("missing_foundation_dependency", `products/${product.name}/product.json`, "Dependent product must require BOS."));
    }
    const route = `${product.application_name}/${product.mcp_group_name}`;
    if (routes.has(route) || resources.has(product.mcp_resource_url)) {
      violations.push(finding("duplicate_product_route", `products/${product.name}/product.json`, "Every product must own a unique MCP route and resource."));
    }
    routes.add(route);
    resources.add(product.mcp_resource_url);

    for (const artifact of entry.connection_artifacts) {
      const path = join(root, artifact);
      if (!await pathExists(path)) {
        violations.push(finding("missing_connection_artifact", artifact, "Product-owned MCP artifact is missing."));
        continue;
      }
      const content = await readFile(path, "utf8");
      if (!content.includes(product.mcp_resource_url)) {
        violations.push(finding("resource_url_drift", artifact, "Product MCP artifact does not contain its product resource URL."));
      }
      if (basename(path) === ".mcp.json") {
        const mcp = JSON.parse(content);
        const entries = Object.entries(mcp.mcpServers ?? {});
        const [name, server] = entries[0] ?? [];
        if (entries.length !== 1 || name !== product.mcp_group_name ||
            server?.type !== "http" || server?.url !== product.mcp_resource_url ||
            server?.oauth_resource !== product.mcp_resource_url || server?.required !== true ||
            server?.startup_timeout_sec !== product.codex_mcp_startup_timeout_sec ||
            server?.tool_timeout_sec !== product.codex_mcp_tool_timeout_sec) {
          violations.push(finding("codex_mcp_binding", artifact, "Codex MCP binding differs from the product manifest."));
        }
      }
    }

    for (const [client, metadataPath] of Object.entries({
      codex: `clients/codex/plugins/${product.name}/.bos-product.json`,
      claude: `clients/claude/plugins/${product.name}/.bos-product.json`,
      copilot: `clients/copilot/products/${product.name}/.bos-product.json`,
      gemini: `clients/gemini/extensions/${product.name}/.bos-product.json`
    })) {
      const metadata = await readJson(join(root, metadataPath));
      if (metadata.client !== client || metadata.connection_owner !== product.name ||
          JSON.stringify(metadata.dependency_products) !== JSON.stringify(product.dependencies) ||
          metadata.resource_url !== product.mcp_resource_url ||
          metadata.application_name !== product.application_name ||
          metadata.mcp_group_name !== product.mcp_group_name ||
          metadata.authentication !== "oauth_2_1") {
        violations.push(finding("product_metadata_drift", metadataPath, "Generated metadata does not preserve product MCP ownership and dependencies."));
      }
    }
  }
  return contractResult(contract, violations);
}
