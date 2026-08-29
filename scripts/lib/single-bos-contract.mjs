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

function validateContractShape(contract, contractPath) {
  const findings = [];
  const requiredStrings = [
    "contract_id",
    "owner_product",
    "application_name",
    "mcp_group_name",
    "resource_url",
    "codex_app_id"
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
  contractPath = join(root, "contracts", "single-bos-mcp-connection.v1.json")
}) {
  const violations = [];
  const contract = await readJson(contractPath);
  violations.push(...validateContractShape(contract, relative(root, contractPath)));
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

  for (const base of [join(root, "source"), join(root, "clients")]) {
    for (const path of await walkFiles(base)) {
      const content = await readFile(path, "utf8");
      violations.push(...inspectForbiddenIdentifiers(
        content,
        relative(root, path),
        contract.forbidden_subservice_connection_identifiers
      ));
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
