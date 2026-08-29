import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";

const CONNECTION_ARTIFACT_NAMES = new Set([
  ".app.json",
  ".mcp.json",
  "CONNECTORS.md",
  "mcp.json",
  "mcp_config.json"
]);

function portable(path) {
  return path.split("\\").join("/");
}

function isInspectableTextFile(path) {
  return /\.(?:json|md|mjs|js|py|txt|ya?ml)$/i.test(path) &&
    !portable(path).includes("/__pycache__/");
}

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error?.code === "EISDIR") return true;
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function walkFiles(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function finding(code, path, message) {
  return { code, path: portable(path), message };
}

export function inspectSubserviceAgentDescriptor(content, path) {
  const findings = [];
  if (/^\s*-\s*type:\s*["']?mcp["']?\s*$/m.test(content)) {
    findings.push(finding(
      "subservice_mcp_dependency",
      path,
      "Subservice agents/openai.yaml declares an MCP dependency."
    ));
  }
  if (/^\s*(?:url|serverUrl|httpUrl):\s*["']?https:\/\/[^\s"']+\/mcp\//m.test(content)) {
    findings.push(finding(
      "subservice_mcp_url",
      path,
      "Subservice agents/openai.yaml declares an MCP resource URL."
    ));
  }
  return findings;
}

export function inspectForbiddenIdentifiers(content, path, identifiers) {
  return identifiers
    .filter((identifier) => content.includes(identifier))
    .map((identifier) => finding(
      "subservice_connection_identifier",
      path,
      `Forbidden subservice connection identifier: ${identifier}`
    ));
}

export function inspectMcpResourceUrls(content, path, canonicalResourceUrl) {
  const resources = content.match(/https:\/\/dfsm\.ai\/mcp\/apps\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]+/g) ?? [];
  return [...new Set(resources)]
    .filter((resource) => resource !== canonicalResourceUrl)
    .map((resource) => finding(
      "subservice_mcp_resource",
      path,
      `Forbidden MCP resource URL: ${resource}`
    ));
}

export function inspectOAuthAuthorizeTarget(authorizeUrl, canonicalResourceUrl) {
  if (!authorizeUrl) return [];
  let parsed;
  try {
    parsed = new URL(authorizeUrl);
  } catch {
    return [finding(
      "oauth_authorize_url",
      "oauth-authorize-url",
      "OAuth authorize evidence must be an absolute URL."
    )];
  }
  const resource = parsed.searchParams.get("resource");
  if (resource !== canonicalResourceUrl) {
    return [finding(
      "oauth_resource_target",
      "oauth-authorize-url",
      `OAuth resource must equal ${canonicalResourceUrl}; found ${resource ?? "missing"}.`
    )];
  }
  return [];
}

function containsConnectionBinding(value) {
  if (!value || typeof value !== "object") return false;
  if (Object.hasOwn(value, "apps") || Object.hasOwn(value, "mcpServers")) return true;
  return Object.values(value).some(containsConnectionBinding);
}

function validateContractShape(contract, contractPath) {
  const findings = [];
  const requiredStrings = [
    "contract_id",
    "owner_product",
    "application_name",
    "mcp_group_name",
    "resource_url",
    "codex_app_id",
    "owner_authentication_policy",
    "provider_account_selection_policy",
    "identity_organization_resolution_policy",
    "subservice_authentication_policy"
  ];
  if (contract.schema_version !== "1") {
    findings.push(finding("contract_schema", contractPath, "schema_version must be 1."));
  }
  for (const field of requiredStrings) {
    if (typeof contract[field] !== "string" || !contract[field]) {
      findings.push(finding("contract_shape", contractPath, `${field} must be a non-empty string.`));
    }
  }
  for (const field of [
    "subservice_products",
    "connection_artifacts",
    "forbidden_subservice_connection_identifiers"
  ]) {
    if (!Array.isArray(contract[field]) || contract[field].length === 0) {
      findings.push(finding("contract_shape", contractPath, `${field} must be a non-empty array.`));
    }
  }
  return findings;
}

export async function verifySingleBosContract({
  root,
  contractPath = join(root, "contracts", "single-bos-mcp-connection.v1.json"),
  oauthAuthorizeUrl
}) {
  const violations = [];
  const contract = await readJson(contractPath);
  violations.push(...validateContractShape(contract, relative(root, contractPath)));
  violations.push(...inspectOAuthAuthorizeTarget(oauthAuthorizeUrl, contract.resource_url));
  if (violations.length) return contractResult(contract, violations);

  const productFiles = (await readdir(join(root, "products"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, "products", entry.name, "product.json"));
  const products = await Promise.all(productFiles.map(readJson));
  const owner = products.find((product) => product.name === contract.owner_product);
  if (!owner) {
    violations.push(finding("missing_connection_owner", "products", "BOS owner product is missing."));
  } else {
    for (const [field, expected] of [
      ["runtime", "bos"],
      ["application_name", contract.application_name],
      ["mcp_group_name", contract.mcp_group_name],
      ["codex_app_id", contract.codex_app_id]
    ]) {
      if (owner[field] !== expected) {
        violations.push(finding(
          "owner_manifest_mismatch",
          `products/${owner.name}/product.json`,
          `${field} must equal ${expected}.`
        ));
      }
    }
  }

  const forbiddenProductFields = [
    "runtime",
    "application_name",
    "mcp_group_name",
    "codex_app_id"
  ];
  for (const product of products.filter(({ name }) => name !== contract.owner_product)) {
    for (const field of forbiddenProductFields) {
      if (product[field] !== undefined) {
        violations.push(finding(
          "subservice_transport_owner",
          `products/${product.name}/product.json`,
          `Subservice product declares forbidden transport field ${field}.`
        ));
      }
    }
    for (const include of product.includes ?? []) {
      const descriptorPath = join(root, "source", include, "agents", "openai.yaml");
      if (!await pathExists(descriptorPath)) continue;
      violations.push(...inspectSubserviceAgentDescriptor(
        await readFile(descriptorPath, "utf8"),
        relative(root, descriptorPath)
      ));
    }
  }

  const runtimePath = join(root, "source", "runtime", "bos", ".mcp.json");
  const runtime = await readJson(runtimePath);
  const runtimeServers = Object.values(runtime.mcpServers ?? {});
  if (runtimeServers.length !== 1 || runtimeServers[0]?.url !== contract.resource_url) {
    violations.push(finding(
      "root_runtime_mismatch",
      relative(root, runtimePath),
      "The BOS runtime must declare exactly the canonical root resource URL."
    ));
  }

  const clientFiles = await walkFiles(join(root, "clients"));
  const actualArtifacts = clientFiles
    .filter((path) => CONNECTION_ARTIFACT_NAMES.has(basename(path)))
    .map((path) => portable(relative(root, path)))
    .sort();
  const expectedArtifacts = [...contract.connection_artifacts].sort();
  if (JSON.stringify(actualArtifacts) !== JSON.stringify(expectedArtifacts)) {
    violations.push(finding(
      "connection_artifact_inventory",
      "clients",
      `Expected ${expectedArtifacts.join(", ")}; found ${actualArtifacts.join(", ")}.`
    ));
  }

  for (const artifact of expectedArtifacts) {
    if (!await pathExists(join(root, artifact))) {
      violations.push(finding("missing_connection_artifact", artifact, "Required BOS connection artifact is missing."));
    }
  }

  const appPath = join(root, "clients", "codex", "plugins", "bos", ".app.json");
  if (await pathExists(appPath)) {
    const app = await readJson(appPath);
    if (
      Object.keys(app.apps ?? {}).length !== 1 ||
      app.apps?.bos?.id !== contract.codex_app_id ||
      app.apps?.bos?.required !== true
    ) {
      violations.push(finding(
        "codex_app_binding",
        relative(root, appPath),
        "Codex must bind exactly one required BOS registered app."
      ));
    }
  }

  for (const artifact of expectedArtifacts.filter((path) => path !== portable(relative(root, appPath)))) {
    const content = await readFile(join(root, artifact), "utf8");
    if (!content.includes(contract.resource_url)) {
      violations.push(finding(
        "root_resource_url",
        artifact,
        "BOS connection artifact does not contain the canonical resource URL."
      ));
    }
  }

  const metadataFiles = clientFiles.filter((path) => basename(path) === ".bos-product.json");
  const ownerClientRoots = [];
  for (const metadataPath of metadataFiles) {
    const metadata = await readJson(metadataPath);
    if (metadata.name === contract.owner_product) {
      ownerClientRoots.push(metadataPath.slice(0, -"/.bos-product.json".length));
      continue;
    }
    const relativeMetadata = portable(relative(root, metadataPath));
    if (metadata.connection_owner !== contract.owner_product || metadata.authentication !== "bos_managed") {
      violations.push(finding(
        "subservice_connection_metadata",
        relativeMetadata,
        "Subservice metadata must reference BOS-managed authentication."
      ));
    }
    for (const field of ["application_name", "mcp_group_name", "codex_app_id", "resource_url"] ) {
      if (metadata[field] !== undefined) {
        violations.push(finding(
          "subservice_connection_metadata",
          relativeMetadata,
          `Subservice metadata declares forbidden connection field ${field}.`
        ));
      }
    }

    const productRoot = metadataPath.slice(0, -"/.bos-product.json".length);
    for (const manifestName of [
      ".codex-plugin/plugin.json",
      ".claude-plugin/plugin.json",
      "gemini-extension.json",
      "plugin.json"
    ]) {
      const manifestPath = join(productRoot, manifestName);
      if (!await pathExists(manifestPath)) continue;
      const manifest = await readJson(manifestPath);
      if (containsConnectionBinding(manifest)) {
        violations.push(finding(
          "subservice_inline_connection",
          relative(root, manifestPath),
          "Subservice manifest declares an inline app or MCP server binding."
        ));
      }
    }
    for (const path of (await walkFiles(productRoot)).filter((candidate) => candidate.endsWith("/agents/openai.yaml"))) {
      violations.push(...inspectSubserviceAgentDescriptor(
        await readFile(path, "utf8"),
        relative(root, path)
      ));
    }
  }

  for (const path of clientFiles.filter((candidate) => candidate.endsWith("/agents/openai.yaml"))) {
    if (ownerClientRoots.some((ownerRoot) => path.startsWith(`${ownerRoot}/`))) continue;
    violations.push(...inspectSubserviceAgentDescriptor(
      await readFile(path, "utf8"),
      relative(root, path)
    ));
  }

  for (const base of [
    join(root, "source"),
    join(root, "clients"),
    join(root, "products"),
    join(root, ".agents")
  ]) {
    for (const path of await walkFiles(base)) {
      if (!isInspectableTextFile(path)) continue;
      const content = await readFile(path, "utf8");
      violations.push(...inspectForbiddenIdentifiers(
        content,
        relative(root, path),
        contract.forbidden_subservice_connection_identifiers
      ));
      violations.push(...inspectMcpResourceUrls(
        content,
        relative(root, path),
        contract.resource_url
      ));
    }
  }

  for (const marketplacePath of [
    join(root, ".agents", "plugins", "marketplace.json"),
    join(root, "clients", "codex", ".agents", "plugins", "marketplace.json")
  ]) {
    if (!await pathExists(marketplacePath)) continue;
    const marketplace = await readJson(marketplacePath);
    for (const entry of marketplace.plugins ?? []) {
      const expectedAuthentication = entry.name === contract.owner_product
        ? contract.owner_authentication_policy
        : contract.subservice_authentication_policy;
      if (entry.policy?.authentication !== expectedAuthentication) {
        violations.push(finding(
          "marketplace_authentication_policy",
          relative(root, marketplacePath),
          `${entry.name} authentication must equal ${expectedAuthentication}.`
        ));
      }
      if (
        entry.name !== contract.owner_product &&
        (containsConnectionBinding(entry) ||
          "codex_app_id" in entry ||
          "resource_url" in entry)
      ) {
        violations.push(finding(
          "marketplace_subservice_connection",
          relative(root, marketplacePath),
          `${entry.name} marketplace entry declares a connection binding.`
        ));
      }
    }
  }

  return contractResult(contract, violations);
}

function contractResult(contract, violations) {
  const unique = [...new Map(
    violations.map((item) => [`${item.code}\0${item.path}\0${item.message}`, item])
  ).values()].sort((left, right) =>
    `${left.code}\0${left.path}`.localeCompare(`${right.code}\0${right.path}`)
  );
  return {
    schema_version: "1",
    contract_id: contract.contract_id ?? "bos.single-mcp-connection",
    status: unique.length ? "failed" : "passed",
    resource_url: contract.resource_url,
    owner_product: contract.owner_product,
    violations: unique
  };
}
