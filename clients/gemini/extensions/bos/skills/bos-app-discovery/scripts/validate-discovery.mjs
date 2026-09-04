#!/usr/bin/env node

const forbiddenAuthorityKeys = new Set([
  "organization_id",
  "org_id",
  "membership_id",
  "role_id",
  "installation_id",
  "installed_app_id",
  "plugin_id",
  "provider_account_id",
  "tenant_id",
  "database_id",
  "credential_id",
  "access_token",
  "refresh_token",
  "bearer_token"
]);

const goalClasses = new Set([
  "positive",
  "negative",
  "neutral",
  "non_terminal"
]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${label} must be a non-empty array of non-empty strings`);
  }
}

function requireHttps(value, label) {
  requireString(value, label);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${label} must be a credential-free HTTPS URL`);
  }
}

function rejectRawAuthority(value, path = "descriptor") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenAuthorityKeys.has(key.toLowerCase())) {
      throw new Error(`${path}.${key} exposes a raw authority or credential identifier`);
    }
    rejectRawAuthority(child, `${path}.${key}`);
  }
}

export function validateAppContact(contact, expectedAppContextId) {
  requireObject(contact, "app contact");
  rejectRawAuthority(contact, "app contact");
  for (const field of ["app_code", "display_name", "description", "mcp_resource", "context_id", "contract_version", "discovery_epoch"]) {
    requireString(contact[field], `app contact.${field}`);
  }
  requireHttps(contact.mcp_resource, "app contact.mcp_resource");
  requireStringArray(contact.capability_families, "app contact.capability_families");
  requireStringArray(contact.required_scopes, "app contact.required_scopes");
  if (expectedAppContextId !== undefined && contact.context_id !== expectedAppContextId) {
    throw new Error("app context does not match the current BOS app-directory contact");
  }
  return contact;
}

export function validateServiceDescriptor(service) {
  requireObject(service, "service descriptor");
  rejectRawAuthority(service, "service descriptor");
  for (const field of ["service_id", "summary", "owner_kind", "contract_uri", "version"]) {
    requireString(service[field], `service descriptor.${field}`);
  }
  requireStringArray(service.entity_types, "service descriptor.entity_types");
  requireHttps(service.contract_uri, "service descriptor.contract_uri");
  requireString(service.api_base_url, "service descriptor.api_base_url");
  if (service.api_base_url.startsWith("https://")) {
    requireHttps(service.api_base_url, "service descriptor.api_base_url");
  } else if (service.api_base_url.includes("://")) {
    throw new Error("service descriptor.api_base_url must be HTTPS or an opaque base reference");
  }
  requireObject(service.auth_scheme, "service descriptor.auth_scheme");
  requireStringArray(service.required_scopes, "service descriptor.required_scopes");
  requireObject(service.provenance, "service descriptor.provenance");
  requireObject(service.failure_contract, "service descriptor.failure_contract");
  if (!Array.isArray(service.operations) || service.operations.length === 0) {
    throw new Error("service descriptor.operations must be a non-empty array");
  }
  for (const [index, operation] of service.operations.entries()) {
    requireObject(operation, `service descriptor.operations[${index}]`);
    requireString(operation.operation_id, `service descriptor.operations[${index}].operation_id`);
    if (!["read", "propose", "mutate"].includes(operation.side_effect_class)) {
      throw new Error(`service descriptor.operations[${index}].side_effect_class is invalid`);
    }
  }
  return service;
}

export function validateGraphDescription(graph) {
  requireObject(graph, "graph description");
  rejectRawAuthority(graph, "graph description");
  for (const field of ["graph_id", "schema_version", "content_digest", "discovery_epoch"]) {
    requireString(graph[field], `graph description.${field}`);
  }
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new Error("graph description.nodes must be a non-empty array");
  }
  const nodeIds = new Set();
  for (const [index, node] of graph.nodes.entries()) {
    requireObject(node, `graph description.nodes[${index}]`);
    requireString(node.node_id, `graph description.nodes[${index}].node_id`);
    requireString(node.label, `graph description.nodes[${index}].label`);
    if (nodeIds.has(node.node_id)) throw new Error(`duplicate graph node ${node.node_id}`);
    nodeIds.add(node.node_id);
    if (node.goal_class !== null && node.goal_class !== undefined && !goalClasses.has(node.goal_class)) {
      throw new Error(`graph node ${node.node_id} has an invalid canonical goal class`);
    }
    if (["is_goal", "is_positive_goal", "is_negative_goal"].some((key) => key in node)) {
      throw new Error(`graph node ${node.node_id} uses conflicting legacy goal metadata`);
    }
  }
  if (!Array.isArray(graph.transitions)) {
    throw new Error("graph description.transitions must be an array");
  }
  for (const [index, transition] of graph.transitions.entries()) {
    requireObject(transition, `graph description.transitions[${index}]`);
    requireString(transition.from_node_id, `graph description.transitions[${index}].from_node_id`);
    requireString(transition.to_node_id, `graph description.transitions[${index}].to_node_id`);
    requireString(transition.label, `graph description.transitions[${index}].label`);
    if (!nodeIds.has(transition.from_node_id) || !nodeIds.has(transition.to_node_id)) {
      throw new Error(`graph transition ${index} references an unknown node`);
    }
  }
  return graph;
}

async function main() {
  const mode = process.argv[2];
  const input = await new Promise((resolve, reject) => {
    let value = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { value += chunk; });
    process.stdin.on("end", () => resolve(value));
    process.stdin.on("error", reject);
  });
  const parsed = JSON.parse(input);
  if (mode === "contact") validateAppContact(parsed, process.argv[3]);
  else if (mode === "service") validateServiceDescriptor(parsed);
  else if (mode === "graph") validateGraphDescription(parsed);
  else throw new Error("usage: validate-discovery.mjs <contact|service|graph> [expected-app-context-id]");
  process.stdout.write(JSON.stringify({ valid: true, kind: mode }) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
