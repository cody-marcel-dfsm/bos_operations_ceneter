import { basename, join, relative, resolve } from "node:path";
import { readFile } from "node:fs/promises";

import {
  listProducts,
  materializeMcpUrl,
  oauthTargetContract,
  pathExists,
  productNamePattern,
  readJson
} from "./package-model.mjs";
import {
  authorizationScopePolicy,
  authenticationHandoffContract,
  externalProductDependencyContract
} from "./product-contracts.mjs";

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
    authorization_scope_policy: contract.authorization_scope_policy,
    external_product_contract: contract.external_product_contract,
    violations: unique
  };
}

function externalContractResult(requirements, metadata, violations) {
  const unique = [...new Map(
    violations.map((item) => [`${item.code}\0${item.path}\0${item.message}`, item])
  ).values()].sort((left, right) =>
    `${left.code}\0${left.path}`.localeCompare(`${right.code}\0${right.path}`)
  );
  return {
    schema_version: "1",
    contract_id: requirements?.contract_id ?? "bos.external-product-dependency",
    contract_version: requirements?.contract_version ?? "1",
    status: unique.length ? "failed" : "passed",
    external_product: metadata ? {
      name: metadata.name,
      client: metadata.client,
      connection_owner: metadata.connection_owner,
      authentication_manager: metadata.authentication_handoff?.authentication_manager,
      authorization_scope_policy: metadata.authorization_scope_policy,
      resource_url: metadata.resource_url
    } : undefined,
    violations: unique
  };
}

function validateExternalHandoff(metadata, requirements, metadataPath) {
  const violations = [];
  const handoff = metadata.authentication_handoff;
  const expected = authenticationHandoffContract(requirements.foundation_dependency);
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) {
    return [finding(
      "authentication_handoff",
      metadataPath,
      "External product metadata must declare the BOS authentication handoff contract."
    )];
  }
  const scalarChecks = [
    ["contract_id", expected.contract_id, "authentication_handoff_contract"],
    ["contract_version", expected.contract_version, "authentication_handoff_version"],
    ["authentication_manager", expected.authentication_manager, "authentication_manager"],
    ["credential_lifecycle_owner", expected.credential_lifecycle_owner, "credential_lifecycle_owner"],
    ["authorization_enforcement_owner", expected.authorization_enforcement_owner, "authorization_enforcement_owner"],
    ["delegation_policy", expected.delegation_policy, "authentication_delegation_policy"]
  ];
  for (const [field, expectedValue, code] of scalarChecks) {
    if (handoff[field] !== expectedValue) {
      violations.push(finding(
        code,
        metadataPath,
        `authentication_handoff.${field} must equal ${expectedValue}.`
      ));
    }
  }
  const categories = handoff.recognized_condition_categories;
  if (!Array.isArray(categories) || expected.recognized_condition_categories.some(
    (category) => !categories.includes(category)
  )) {
    violations.push(finding(
      "authentication_condition_categories",
      metadataPath,
      "Authentication handoff must recognize every BOS v1 authentication and recovery condition category."
    ));
  }
  for (const [field, expectedValue] of Object.entries(expected.readiness_result)) {
    if (JSON.stringify(handoff.readiness_result?.[field]) !== JSON.stringify(expectedValue)) {
      violations.push(finding(
        "readiness_result",
        metadataPath,
        `authentication_handoff.readiness_result.${field} must equal ${JSON.stringify(expectedValue)}.`
      ));
    }
  }
  const callerOwnedFields = [
    "connection_owner",
    "dependent_product",
    "product_code",
    "domain_operation",
    "business_operation",
    "continuation",
    "continuation_policy",
    "request_hash",
    "workflow_goal",
    "approval_binding",
    "idempotency_key",
    "completed_steps",
    "pending_step",
    "recovery_attempt",
    "reconciliation_state",
    "retry_state",
    "cache_state",
    "presentation"
  ];
  for (const field of callerOwnedFields) {
    if (field in handoff) {
      violations.push(finding(
        "authentication_handoff_scope",
        metadataPath,
        `authentication_handoff must not declare caller-owned field ${field}.`
      ));
    }
  }
  return violations;
}

function findCredentialFields(value, path = "") {
  if (!value || typeof value !== "object") return [];
  const allowedOwnershipFields = new Set([
    "authorization_enforcement_owner",
    "authorization_scope_policy",
    "credential_lifecycle_owner"
  ]);
  const fields = [];
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = path ? `${path}.${key}` : key;
    const normalizedKey = key
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .toLowerCase();
    const segments = normalizedKey.split("_").filter(Boolean);
    const isOpaqueCredentialContainer = ["env", "environment", "header", "headers"].includes(normalizedKey);
    const containsCredentialTerm = segments.some((segment) =>
      ["cookie", "credential", "credentials", "passphrase", "password", "secret", "token", "username"].includes(segment)
    );
    const containsAuthorization = segments.includes("authorization");
    const containsAuthenticationAlias = segments.includes("auth");
    const containsApiKey = segments.some((segment, index) =>
      segment === "api" && segments[index + 1] === "key"
    ) || normalizedKey === "apikey";
    const containsPrivateKey = segments.some((segment, index) =>
      segment === "private" && segments[index + 1] === "key"
    );
    if (!allowedOwnershipFields.has(normalizedKey) &&
        (isOpaqueCredentialContainer || containsCredentialTerm || containsAuthorization ||
          containsAuthenticationAlias || containsApiKey || containsPrivateKey)) {
      fields.push(nestedPath);
    }
    if (!isOpaqueCredentialContainer) fields.push(...findCredentialFields(nested, nestedPath));
  }
  return fields;
}

function normalizedResourceHref(value) {
  const resource = new URL(value);
  resource.pathname = resource.pathname.replace(/\/+$/, "") || "/";
  return resource.href;
}

function findCredentialTextMarkers(content) {
  const patterns = [
    [
      "Authorization",
      /(?:^|[\s{,])["']?(?:authorization|proxy[-_]authorization|auth(?:entication|orization)?[-_ ]?header)["']?\s*[:=]/gimu
    ],
    [
      "X-API-Key",
      /(?:^|[\s{,])["']?(?:x[-_ ]?api[-_ ]?key|api[-_ ]?key)["']?\s*[:=]/gimu
    ],
    [
      "token_or_secret",
      /(?:^|[\s{,])["']?[a-z0-9_-]*(?:token|secret|credential)[a-z0-9_-]*["']?\s*[:=]/gimu
    ],
    [
      "password_or_passphrase",
      /(?:^|[\s{,])["']?[a-z0-9_-]*(?:password|passphrase)[a-z0-9_-]*["']?\s*[:=]/gimu
    ],
    [
      "private_key",
      /(?:^|[\s{,])["']?[a-z0-9_-]*private[-_ ]?key[a-z0-9_-]*["']?\s*[:=]/gimu
    ],
    [
      "Cookie",
      /(?:^|[\s{,])["']?(?:cookie|set[-_ ]?cookie)["']?\s*[:=]/gimu
    ]
  ];
  return patterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([name]) => name);
}

async function inspectExternalConnectionArtifact(packageRoot, metadata) {
  const violations = [];
  const client = metadata.client;
  let artifact;
  if (client === "codex") artifact = ".mcp.json";
  else if (client === "claude") artifact = "CONNECTORS.md";
  else if (client === "copilot") artifact = ".github/mcp.json";
  else if (client === "gemini") artifact = "mcp_config.json";
  else return [finding("unsupported_client", ".bos-product.json", `Unsupported client ${client}.`)];

  const artifactPath = join(packageRoot, artifact);
  if (!await pathExists(artifactPath)) {
    return [finding(
      "missing_connection_artifact",
      artifact,
      `External ${client} package is missing its product-owned MCP connection artifact.`
    )];
  }
  if (client === "claude") {
    const content = await readFile(artifactPath, "utf8");
    for (const marker of findCredentialTextMarkers(content)) {
      violations.push(finding(
        "connection_credential_material",
        artifact,
        `Product MCP connection artifact must not manage authentication through ${marker}.`
      ));
    }
    if (!content.includes(metadata.resource_url) || !content.includes(metadata.mcp_group_name)) {
      violations.push(finding(
        "external_mcp_binding",
        artifact,
        "Claude connector metadata must identify the product MCP group and exact resource URL."
      ));
    }
    return violations;
  }

  let document;
  try {
    document = await readJson(artifactPath);
  } catch {
    return [finding("external_mcp_binding", artifact, "Product MCP connection artifact must be valid JSON.")];
  }
  const credentialFields = findCredentialFields(document);
  for (const field of credentialFields) {
    violations.push(finding(
      "connection_credential_material",
      artifact,
      `Product MCP connection artifact must not manage authentication through ${field}.`
    ));
  }
  const entries = Object.entries(document.mcpServers ?? {});
  const [name, server] = entries[0] ?? [];
  let valid = entries.length === 1 && name === metadata.mcp_group_name;
  if (client === "codex") {
    valid = valid && server?.type === "http" && server?.url === metadata.resource_url &&
      server?.oauth_resource === metadata.resource_url && server?.required === false;
    if (!Number.isInteger(server?.startup_timeout_sec) ||
        server.startup_timeout_sec < 180 ||
        !Number.isInteger(server?.tool_timeout_sec) ||
        server.tool_timeout_sec < 180) {
      violations.push(finding(
        "codex_mcp_timeout_budget",
        artifact,
        "Codex external product startup and tool timeout budgets must each be at least 180 seconds."
      ));
    }
  } else if (client === "copilot") {
    valid = valid && server?.type === "http" && server?.url === metadata.resource_url;
  } else if (client === "gemini") {
    valid = valid && server?.serverUrl === metadata.resource_url;
  }
  if (!valid) {
    violations.push(finding(
      "external_mcp_binding",
      artifact,
      "Product MCP connection artifact must bind exactly one product-owned server to the declared resource."
    ));
  }
  return violations;
}

export async function verifyExternalProductPackage({
  root,
  packageRoot,
  contractPath = join(root, "contracts", "product-mcp-connections.v1.json")
}) {
  const contract = await readJson(contractPath);
  const requirements = contract.external_product_contract;
  const violations = [];
  if (JSON.stringify(requirements) !== JSON.stringify(
    externalProductDependencyContract(contract.foundation_product)
  )) {
    violations.push(finding(
      "external_contract_shape",
      relative(root, contractPath),
      "External product dependency contract is missing or invalid."
    ));
    return externalContractResult(requirements, undefined, violations);
  }

  const resolvedPackageRoot = resolve(packageRoot);
  const metadataPath = join(resolvedPackageRoot, requirements.metadata_file);
  if (!await pathExists(metadataPath)) {
    violations.push(finding(
      "missing_external_metadata",
      requirements.metadata_file,
      "External product package is missing BOS dependency metadata."
    ));
    return externalContractResult(requirements, undefined, violations);
  }
  let metadata;
  try {
    metadata = await readJson(metadataPath);
  } catch {
    violations.push(finding(
      "external_metadata_json",
      requirements.metadata_file,
      "External product dependency metadata must be valid JSON."
    ));
    return externalContractResult(requirements, undefined, violations);
  }

  if (metadata.schema_version !== "1") {
    violations.push(finding("external_schema_version", requirements.metadata_file, "External product metadata schema_version must equal 1."));
  }
  if (!productNamePattern.test(metadata.name ?? "") || metadata.name === requirements.foundation_dependency) {
    violations.push(finding("external_product_name", requirements.metadata_file, "External dependent product name is invalid."));
  }
  if (typeof metadata.version !== "string" || !metadata.version) {
    violations.push(finding("external_product_version", requirements.metadata_file, "External product version must be a non-empty string."));
  }
  if (!productNamePattern.test(metadata.application_name ?? "") ||
      !productNamePattern.test(metadata.mcp_group_name ?? "")) {
    violations.push(finding("external_mcp_identity", requirements.metadata_file, "External product must declare valid application and MCP group names."));
  }
  try {
    const resource = new URL(metadata.resource_url);
    if (resource.protocol !== "https:" || resource.username || resource.password ||
        resource.search || resource.hash) {
      throw new Error("invalid resource");
    }
    const normalizedResource = normalizedResourceHref(resource.href);
    const foundationResource = contract.products.find(
      ({ name }) => name === requirements.foundation_dependency
    )?.resource_url;
    if (foundationResource &&
        normalizedResourceHref(foundationResource) === normalizedResource) {
      violations.push(finding(
        "foundation_resource_reuse",
        requirements.metadata_file,
        "External product must own a connection distinct from the BOS platform MCP."
      ));
    }
  } catch {
    violations.push(finding("external_resource_url", requirements.metadata_file, "External product resource_url must be an absolute credential-free HTTPS URL without query parameters or fragments."));
  }
  if (metadata.connection_owner !== metadata.name) {
    violations.push(finding("connection_owner", requirements.metadata_file, "External product must own its MCP connection."));
  }
  if (!Array.isArray(metadata.dependency_products) ||
      !metadata.dependency_products.includes(requirements.foundation_dependency)) {
    violations.push(finding("missing_foundation_dependency", requirements.metadata_file, "External product must require BOS."));
  }
  if (metadata.authentication !== "oauth_2_1") {
    violations.push(finding("authentication_protocol", requirements.metadata_file, "External product MCP must use OAuth 2.1."));
  }
  if (metadata.authorization_scope_policy !== authorizationScopePolicy) {
    violations.push(finding(
      "authorization_scope_policy",
      requirements.metadata_file,
      `External product authorization_scope_policy must equal ${authorizationScopePolicy}.`
    ));
  }
  if (metadata.client === "codex" && (
    !Number.isInteger(metadata.codex_mcp_startup_timeout_sec) ||
    metadata.codex_mcp_startup_timeout_sec < 180 ||
    !Number.isInteger(metadata.codex_mcp_tool_timeout_sec) ||
    metadata.codex_mcp_tool_timeout_sec < 180
  )) {
    violations.push(finding(
      "codex_metadata_timeout_budget",
      requirements.metadata_file,
      "Codex external product metadata must declare startup and tool timeout budgets of at least 180 seconds."
    ));
  }
  violations.push(...validateExternalHandoff(metadata, requirements, requirements.metadata_file));
  for (const field of findCredentialFields(metadata)) {
    violations.push(finding(
      "credential_material",
      requirements.metadata_file,
      `External product metadata must not contain credential field ${field}.`
    ));
  }
  violations.push(...await inspectExternalConnectionArtifact(resolvedPackageRoot, metadata));
  return externalContractResult(requirements, metadata, violations);
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
      contract.authorization_scope_policy !== authorizationScopePolicy ||
      JSON.stringify(contract.external_product_contract) !== JSON.stringify(
        externalProductDependencyContract(contract.foundation_product)
      ) ||
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
      authentication_handoff: authenticationHandoffContract(contract.foundation_product),
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
            server?.oauth_resource !== product.mcp_resource_url || server?.required !== false ||
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
          metadata.authentication !== "oauth_2_1" ||
          metadata.authorization_scope_policy !== authorizationScopePolicy ||
          JSON.stringify(metadata.authentication_handoff) !== JSON.stringify(
            authenticationHandoffContract(contract.foundation_product)
          )) {
        violations.push(finding("product_metadata_drift", metadataPath, "Generated metadata does not preserve product MCP ownership and dependencies."));
      }
    }
  }
  return contractResult(contract, violations);
}
