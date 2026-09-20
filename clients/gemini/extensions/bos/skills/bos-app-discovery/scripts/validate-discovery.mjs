#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import validateDraft202012Schema from "./validate-json-schema-2020-12.mjs";

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
  "context_id",
  "actor_role_id",
  "actor_user_id",
  "api_key",
  "app_id",
  "application_id",
  "authority_context",
  "client_idempotency_key",
  "connection_id",
  "context_handle",
  "execution_id",
  "grant_id",
  "idempotency_key",
  "internal_id",
  "oauth_token",
  "principal_context",
  "provider_error",
  "provider_id",
  "retry_state",
  "secret",
  "session_id",
  "token",
  "user_id",
  "access_token",
  "refresh_token",
  "bearer_token"
]);
const authorityTokens = new Set([
  "authority",
  "context",
  "grant",
  "principal",
  "tenant"
]);
const secretTokens = new Set([
  "authorization",
  "bearer",
  "credential",
  "credentials",
  "password",
  "secret",
  "secrets",
  "token",
  "tokens"
]);
const publicSecurityKeys = new Set([
  "application",
  "correlation_id",
  "context_header",
  "operation",
  "platform",
  "plugin",
  "provider",
  "public_selector",
  "reference",
  "required_authority",
  "selector",
  "service",
  "service_id",
  "source",
  "source_reference"
]);
const privateDiscoveryText = /(?:\bselect\b.+\bfrom\b|\binsert\s+into\b|\bdelete\s+from\b|traceback\s*\(most recent call last\)|\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b)/isu;

const goalClasses = new Set([
  "positive",
  "negative",
  "neutral",
  "non_terminal"
]);
const leadDirectorAppDescribe = Object.freeze({
  contractVersion: "lead-director-describe/v1",
  method: "POST",
  uri: "/bos/apps/lead-director/api/v1/organizations/{organization}/describe",
  maxOperations: 5
});
const operationIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const semanticOperationPattern = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/u;
const semanticVersionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/u;
const leadDirectorBoslUriPattern = /^bos:\/\/apps\/lead-director\/bosl\/([a-f0-9]{32})\/(schema|reference|examples)$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const bosContextHeader = "X-BOS-Context-Handle";

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

function requireAuthenticatedResourceUri(value, label) {
  requireString(value, label);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an authenticated resource URI`);
  }
  if (!["https:", "bos:"].includes(parsed.protocol) ||
      parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label} must be an authenticated resource URI`);
  }
}

function requireExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} has undeclared field ${key}`);
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizedSecurityKey(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function rejectRawAuthority(value, path = "descriptor", insideProvider = false) {
  if (typeof value === "string") {
    if (privateDiscoveryText.test(value)) {
      throw new Error(`${path} exposes private discovery text`);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizedSecurityKey(key);
    const tokens = new Set(normalized.split("_").filter(Boolean));
    const explicitlyPublic = key === "$id" || publicSecurityKeys.has(normalized);
    const providerDiagnostic =
      (insideProvider || tokens.has("provider")) &&
      ["error", "errors", "exception", "message", "response", "text"]
        .some((token) => tokens.has(token));
    if (!explicitlyPublic && (
      forbiddenAuthorityKeys.has(normalized) ||
      [...secretTokens].some((token) => tokens.has(token)) ||
      [...authorityTokens].some((token) => tokens.has(token)) ||
      providerDiagnostic
    )) {
      throw new Error(`${path}.${key} exposes a raw authority or credential identifier`);
    }
    rejectRawAuthority(child, `${path}.${key}`, insideProvider || tokens.has("provider"));
  }
}

export function validateAppContact(contact) {
  requireObject(contact, "app contact");
  rejectRawAuthority(contact, "app contact");
  for (const field of ["app_code", "display_name", "description", "mcp_resource", "contract_version", "discovery_epoch"]) {
    requireString(contact[field], `app contact.${field}`);
  }
  requireHttps(contact.mcp_resource, "app contact.mcp_resource");
  requireStringArray(contact.capability_families, "app contact.capability_families");
  requireStringArray(contact.required_scopes, "app contact.required_scopes");
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

export function validateAppDescribe(description) {
  requireObject(description, "app.describe response");
  rejectRawAuthority(description, "app.describe response");
  requireExactKeys(
    description,
    new Set(["application", "describe", "bosl"]),
    "app.describe response"
  );
  requireObject(description.application, "app.describe response.application");
  requireExactKeys(
    description.application,
    new Set(["platform", "application"]),
    "app.describe response.application"
  );
  requireString(description.application.platform, "app.describe response.application.platform");
  requireString(description.application.application, "app.describe response.application.application");
  if (description.application.platform !== "bos") {
    throw new Error("app.describe response.application.platform must be bos");
  }
  if (description.application.application !== "lead-director") {
    throw new Error("app.describe response.application.application must be lead-director");
  }
  requireObject(description.describe, "app.describe response.describe");
  requireExactKeys(
    description.describe,
    new Set(["contract_version", "method", "uri", "max_operations", "operations"]),
    "app.describe response.describe"
  );
  requireString(description.describe.contract_version, "app.describe response.describe.contract_version");
  if (description.describe.contract_version !== leadDirectorAppDescribe.contractVersion) {
    throw new Error(`app.describe response.describe.contract_version must be ${leadDirectorAppDescribe.contractVersion}`);
  }
  if (description.describe.method !== leadDirectorAppDescribe.method) {
    throw new Error(`app.describe response.describe.method must be ${leadDirectorAppDescribe.method}`);
  }
  requireString(description.describe.uri, "app.describe response.describe.uri");
  if (description.describe.uri !== leadDirectorAppDescribe.uri) {
    throw new Error(`app.describe response.describe.uri must be ${leadDirectorAppDescribe.uri}`);
  }
  if (description.describe.max_operations !== leadDirectorAppDescribe.maxOperations) {
    throw new Error(`app.describe response.describe.max_operations must be ${leadDirectorAppDescribe.maxOperations}`);
  }
  requireStringArray(description.describe.operations, "app.describe response.describe.operations");
  if (description.describe.operations.length > description.describe.max_operations ||
      new Set(description.describe.operations).size !== description.describe.operations.length) {
    throw new Error("app.describe response.describe.operations exceed or duplicate the published bound");
  }
  if (description.describe.operations.some((operation) => !operationIdPattern.test(operation))) {
    throw new Error("app.describe response.describe.operations contains an invalid operation identifier");
  }
  validateBoslDescriptor(description.bosl, "app.describe response.bosl");
  return description;
}

function validateBoslDescriptor(bosl, label) {
  requireObject(bosl, label);
  requireExactKeys(
    bosl,
    new Set(["schema_uri", "reference_uri", "examples_uri", "descriptor_etag"]),
    label
  );
  const expectedKinds = new Map([
    ["schema_uri", "schema"],
    ["reference_uri", "reference"],
    ["examples_uri", "examples"]
  ]);
  let partition;
  for (const [field, expectedKind] of expectedKinds) {
    requireString(bosl[field], `${label}.${field}`);
    const match = leadDirectorBoslUriPattern.exec(bosl[field]);
    if (!match || match[2] !== expectedKind) {
      throw new Error(`${label}.${field} must be a partitioned Lead Director BOSL ${expectedKind} URI`);
    }
    partition ??= match[1];
    if (match[1] !== partition) {
      throw new Error(`${label} BOSL resource URIs must use one shared partition`);
    }
  }
  requireString(bosl.descriptor_etag, `${label}.descriptor_etag`);
  if (!sha256Pattern.test(bosl.descriptor_etag)) {
    throw new Error(`${label}.descriptor_etag must be a lowercase 64-hex digest`);
  }
}

function validateServiceReference(reference, label) {
  requireObject(reference, label);
  requireExactKeys(
    reference,
    new Set(["platform", "application", "plugin"]),
    label
  );
  for (const field of ["platform", "application", "plugin"]) {
    requireString(reference[field], `${label}.${field}`);
  }
  if (reference.platform !== "bos") {
    throw new Error(`${label}.platform must be bos`);
  }
  return reference;
}

function validateCompactJourney(journey, label) {
  requireObject(journey, label);
  requireExactKeys(
    journey,
    new Set(["title", "inputs", "steps", "success"]),
    label
  );
  requireString(journey.title, `${label}.title`);
  requireStringArray(journey.inputs, `${label}.inputs`);
  requireString(journey.success, `${label}.success`);
  if (!Array.isArray(journey.steps) || journey.steps.length === 0) {
    throw new Error(`${label}.steps must be a non-empty array`);
  }
  const codes = new Set();
  for (const [index, step] of journey.steps.entries()) {
    const stepLabel = `${label}.steps[${index}]`;
    requireObject(step, stepLabel);
    requireExactKeys(step, new Set(["code", "type", "description"]), stepLabel);
    requireString(step.code, `${stepLabel}.code`);
    requireString(step.description, `${stepLabel}.description`);
    if (!["client", "server"].includes(step.type)) {
      throw new Error(`${stepLabel}.type must be client or server`);
    }
    if (codes.has(step.code)) throw new Error(`${label} has duplicate step ${step.code}`);
    codes.add(step.code);
  }
}

function validatePluginItem(plugin, index) {
  const label = `plugins.list response.plugins[${index}]`;
  requireObject(plugin, label);
  rejectRawAuthority(plugin, label);
  requireExactKeys(
    plugin,
    new Set([
      "reference",
      "name",
      "purpose",
      "journey",
      "describe",
      "descriptor_etag",
      "readiness"
    ]),
    label
  );
  validateServiceReference(plugin.reference, `${label}.reference`);
  requireString(plugin.name, `${label}.name`);
  requireString(plugin.purpose, `${label}.purpose`);
  validateCompactJourney(plugin.journey, `${label}.journey`);
  requireObject(plugin.describe, `${label}.describe`);
  requireExactKeys(
    plugin.describe,
    new Set(["capability", "input"]),
    `${label}.describe`
  );
  requireString(plugin.describe.capability, `${label}.describe.capability`);
  requireObject(plugin.describe.input, `${label}.describe.input`);
  requireExactKeys(
    plugin.describe.input,
    new Set(["service"]),
    `${label}.describe.input`
  );
  validateServiceReference(
    plugin.describe.input.service,
    `${label}.describe.input.service`
  );
  if (!sameJson(plugin.reference, plugin.describe.input.service)) {
    throw new Error(`${label}.describe.input.service must be the exact plugin reference`);
  }
  requireString(plugin.descriptor_etag, `${label}.descriptor_etag`);
  validateReadiness(plugin.readiness, `${label}.readiness`);
  return plugin;
}

function validateApplication(reference, label) {
  requireObject(reference, label);
  requireExactKeys(reference, new Set(["platform", "application"]), label);
  requireString(reference.platform, `${label}.platform`);
  requireString(reference.application, `${label}.application`);
  if (reference.platform !== "bos") {
    throw new Error(`${label}.platform must be bos`);
  }
}

function validateReadiness(readiness, label) {
  requireObject(readiness, label);
  requireExactKeys(readiness, new Set(["status", "requirements"]), label);
  if (!new Set([
    "ready",
    "authorization_required",
    "configuration_required",
    "temporarily_unavailable"
  ]).has(readiness.status)) {
    throw new Error(`${label}.status is invalid`);
  }
  if (!Array.isArray(readiness.requirements)) {
    throw new Error(`${label}.requirements must be an array`);
  }
  if ((readiness.status === "ready") !== (readiness.requirements.length === 0)) {
    throw new Error(`${label} readiness and requirements disagree`);
  }
  readiness.requirements.forEach((requirement, index) => {
    const requirementLabel = `${label}.requirements[${index}]`;
    requireObject(requirement, requirementLabel);
    requireExactKeys(
      requirement,
      new Set(["operation", "status", "requirements", "recovery"]),
      requirementLabel
    );
    requireString(requirement.operation, `${requirementLabel}.operation`);
    requireString(requirement.status, `${requirementLabel}.status`);
    requireObject(requirement.requirements, `${requirementLabel}.requirements`);
    requireObject(requirement.recovery, `${requirementLabel}.recovery`);
  });
}

function validateMcpPrivateMetadata(response, label) {
  if (Object.hasOwn(response, "ttlMs") &&
      (!Number.isInteger(response.ttlMs) || response.ttlMs < 0)) {
    throw new Error(`${label}.ttlMs must be a non-negative integer`);
  }
  if (Object.hasOwn(response, "cacheScope") && response.cacheScope !== "private") {
    throw new Error(`${label}.cacheScope must be private`);
  }
}

export function validatePluginsList(response) {
  requireObject(response, "plugins.list response");
  rejectRawAuthority(response, "plugins.list response");
  requireExactKeys(
    response,
    new Set(["application", "plugins", "ttlMs", "cacheScope"]),
    "plugins.list response"
  );
  validateApplication(response.application, "plugins.list response.application");
  validateMcpPrivateMetadata(response, "plugins.list response");
  if (!Array.isArray(response.plugins)) {
    throw new Error("plugins.list response.plugins must be an array");
  }
  response.plugins.forEach((plugin, index) => {
    validatePluginItem(plugin, index);
    if (plugin.reference.platform !== response.application.platform ||
        plugin.reference.application !== response.application.application) {
      throw new Error(
        `plugins.list response.plugins[${index}] must belong to the same application`
      );
    }
  });
  return response;
}

export function validateDiscoveryRefresh(response) {
  requireObject(response, "discovery.refresh response");
  rejectRawAuthority(response, "discovery.refresh response");
  requireExactKeys(
    response,
    new Set(["application", "bosl", "plugins", "ttlMs", "cacheScope"]),
    "discovery.refresh response"
  );
  validateApplication(response.application, "discovery.refresh response.application");
  validateBoslDescriptor(response.bosl, "discovery.refresh response.bosl");
  validateMcpPrivateMetadata(response, "discovery.refresh response");
  validatePluginsList({
    application: response.application,
    plugins: response.plugins,
    ...(Object.hasOwn(response, "ttlMs") ? { ttlMs: response.ttlMs } : {}),
    ...(Object.hasOwn(response, "cacheScope") ? { cacheScope: response.cacheScope } : {})
  });
  return response;
}

function validateOperationLimits(limits, label, { complete = false } = {}) {
  requireObject(limits, label);
  if (!Number.isInteger(limits.maximum_duration_seconds) ||
      limits.maximum_duration_seconds < 1 ||
      limits.maximum_duration_seconds > 900) {
    throw new Error(`${label}.maximum_duration_seconds must be an integer from 1 through 900`);
  }
  if (!Number.isInteger(limits.maximum_fan_out) ||
      limits.maximum_fan_out < 1 ||
      limits.maximum_fan_out > 100) {
    throw new Error(`${label}.maximum_fan_out must be an integer from 1 through 100`);
  }
  if (!complete) return;
  for (const field of ["max_targets", "max_results_per_source"]) {
    if (limits[field] !== null &&
        (!Number.isInteger(limits[field]) || limits[field] < 1)) {
      throw new Error(`${label}.${field} must be null or a positive integer`);
    }
  }
  for (const field of [
    "pagination_supported",
    "bulk_supported",
    "streaming_supported"
  ]) {
    if (limits[field] !== null && typeof limits[field] !== "boolean") {
      throw new Error(`${label}.${field} must be null or boolean`);
    }
  }
}

function validateSourceOperationLimits(limits, label) {
  requireObject(limits, label);
  requireExactKeys(
    limits,
    new Set([
      "max_targets",
      "max_results_per_source",
      "pagination_supported",
      "bulk_supported",
      "streaming_supported",
      "maximum_duration_seconds",
      "maximum_fan_out"
    ]),
    label
  );
  for (const field of ["pagination_supported", "bulk_supported", "streaming_supported"]) {
    if (!Object.hasOwn(limits, field)) throw new Error(`${label}.${field} is required`);
    if (limits[field] !== null && typeof limits[field] !== "boolean") {
      throw new Error(`${label}.${field} must be null or boolean`);
    }
  }
  for (const field of ["max_targets", "max_results_per_source"]) {
    if (Object.hasOwn(limits, field) && limits[field] !== null &&
        (!Number.isInteger(limits[field]) || limits[field] < 1)) {
      throw new Error(`${label}.${field} must be null or a positive integer`);
    }
  }
  if (Object.hasOwn(limits, "maximum_duration_seconds") &&
      (!Number.isInteger(limits.maximum_duration_seconds) ||
       limits.maximum_duration_seconds < 1 || limits.maximum_duration_seconds > 900)) {
    throw new Error(`${label}.maximum_duration_seconds must be an integer from 1 through 900`);
  }
  if (Object.hasOwn(limits, "maximum_fan_out") &&
      (!Number.isInteger(limits.maximum_fan_out) ||
       limits.maximum_fan_out < 1 || limits.maximum_fan_out > 100)) {
    throw new Error(`${label}.maximum_fan_out must be an integer from 1 through 100`);
  }
}

function validateOperationGuarantees(guarantees, label) {
  requireObject(guarantees, label);
  requireExactKeys(
    guarantees,
    new Set([
      "read_consistency",
      "per_source_atomicity",
      "cross_source_atomicity",
      "convergence",
      "idempotency"
    ]),
    label
  );
  for (const field of [
    "read_consistency",
    "per_source_atomicity",
    "cross_source_atomicity",
    "convergence"
  ]) {
    requireString(guarantees[field], `${label}.${field}`);
  }
  if (guarantees.idempotency !== "service_owned") {
    throw new Error(`${label}.idempotency must be service_owned`);
  }
}

function validateOperationSchema(schema, label) {
  requireObject(schema, label);
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
      schema.type !== "object" ||
      !Array.isArray(schema["x-bos-fields"])) {
    throw new Error(`${label} must be a published object schema using JSON Schema draft 2020-12`);
  }
}

function validateErrorContract(contract, label) {
  requireObject(contract, label);
  requireExactKeys(contract, new Set(["schema", "codes"]), label);
  requireString(contract.schema, `${label}.schema`);
  requireStringArray(contract.codes, `${label}.codes`);
  if (new Set(contract.codes).size !== contract.codes.length) {
    throw new Error(`${label}.codes must be unique`);
  }
}

function validateContractLink(contract, operation, label) {
  requireObject(contract, label);
  requireExactKeys(contract, new Set(["capability", "input"]), label);
  if (contract.capability !== "api.contract.get") {
    throw new Error(`${label}.capability must be api.contract.get`);
  }
  requireObject(contract.input, `${label}.input`);
  requireExactKeys(contract.input, new Set(["operation"]), `${label}.input`);
  if (contract.input.operation !== operation) {
    throw new Error(`${label}.input.operation must match the semantic operation`);
  }
}

function validateExecutionContract(execution, label) {
  requireObject(execution, label);
  requireExactKeys(
    execution,
    new Set(["method", "uri", "context_header", "transport"]),
    label
  );

  const hasHttpExecution = execution.method !== null && execution.method !== undefined;
  const hasJourneyRuntime = execution.transport !== null && execution.transport !== undefined;
  if (hasHttpExecution === hasJourneyRuntime) {
    throw new Error(`${label} must select exactly one HTTP or journey_runtime transport`);
  }

  if (hasJourneyRuntime) {
    if (execution.transport !== "journey_runtime") {
      throw new Error(`${label}.transport must be journey_runtime`);
    }
    for (const field of ["method", "uri", "context_header"]) {
      if (execution[field] !== null && execution[field] !== undefined) {
        throw new Error(`${label}.${field} must be null for journey_runtime`);
      }
    }
    return;
  }

  if (!new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]).has(execution.method)) {
    throw new Error(`${label}.method is invalid`);
  }
  requireString(execution.uri, `${label}.uri`);
  if (!execution.uri.startsWith("/") || execution.uri.startsWith("//") ||
      /[\s\\#]/u.test(execution.uri)) {
    throw new Error(`${label}.uri must be a safe returned origin-relative URI`);
  }

  // The original archived V1 fixtures predate identity-v2 context binding.
  // Keep validating that exact legacy shape until the immutable archive is
  // refreshed, while requiring the owner-approved header on every newly
  // described HTTP execution that declares the expanded execution contract.
  const expandedExecution = Object.hasOwn(execution, "context_header") ||
    Object.hasOwn(execution, "transport");
  if (expandedExecution && execution.context_header !== bosContextHeader) {
    throw new Error(`${label}.context_header must be ${bosContextHeader}`);
  }
  if (execution.transport !== null && execution.transport !== undefined) {
    throw new Error(`${label}.transport must be null for HTTP execution`);
  }
}

function validateEmbeddedSchema(schema, label) {
  requireObject(schema, label);
  if (Object.hasOwn(schema, "$schema") &&
      schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    throw new Error(`${label} must use JSON Schema draft 2020-12 when $schema is declared`);
  }
  if (!validateDraft202012Schema(schema)) {
    const detail = (validateDraft202012Schema.errors ?? [])
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new Error(`${label} must be a valid Draft 2020-12 JSON Schema: ${detail}`);
  }
}

function validateContractObjectSchema(schema, label) {
  validateEmbeddedSchema(schema, label);
  if (schema.type !== "object") {
    throw new Error(`${label} must describe a JSON object`);
  }
}

function validatePublicOperationError(error, label) {
  requireObject(error, label);
  requireExactKeys(
    error,
    new Set(["code", "message", "retryable", "http_status", "details_schema"]),
    label
  );
  requireString(error.code, `${label}.code`);
  if (!/^[A-Z][A-Z0-9_]*$/u.test(error.code)) {
    throw new Error(`${label}.code must be a public error code`);
  }
  requireString(error.message, `${label}.message`);
  if (typeof error.retryable !== "boolean") {
    throw new Error(`${label}.retryable must be boolean`);
  }
  if (!Number.isInteger(error.http_status) ||
      error.http_status < 400 || error.http_status > 599) {
    throw new Error(`${label}.http_status must be an integer from 400 through 599`);
  }
  if (Object.hasOwn(error, "details_schema")) {
    validateEmbeddedSchema(error.details_schema, `${label}.details_schema`);
  }
}

function validateOperationRecovery(recovery, label) {
  requireObject(recovery, label);
  requireExactKeys(
    recovery,
    new Set([
      "goal",
      "instruction",
      "operation",
      "requires_user_approval",
      "approval_scope"
    ]),
    label
  );
  requireString(recovery.goal, `${label}.goal`);
  requireString(recovery.instruction, `${label}.instruction`);
  if (recovery.operation !== null && recovery.operation !== undefined &&
      (!semanticOperationPattern.test(recovery.operation))) {
    throw new Error(`${label}.operation must be null or a semantic operation`);
  }
  if (typeof recovery.requires_user_approval !== "boolean") {
    throw new Error(`${label}.requires_user_approval must be boolean`);
  }
  if (!Array.isArray(recovery.approval_scope) ||
      recovery.approval_scope.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${label}.approval_scope must be an array of non-empty strings`);
  }
}

export function validateApiContractResponse(response, expected = {}) {
  const label = "api.contract.get response";
  requireObject(response, label);
  rejectRawAuthority(response, label);
  requireExactKeys(
    response,
    new Set([
      "operation",
      "contract_version",
      "source",
      "bosl_server_node",
      "node_type",
      "title",
      "description",
      "permission",
      "input_schema",
      "output_schema",
      "allowed_references",
      "effect",
      "approval",
      "limits",
      "guarantees",
      "execution",
      "retry_policy",
      "receipt_schema",
      "public_errors",
      "recovery",
      "provenance",
      "readiness",
      "ttlMs",
      "cacheScope"
    ]),
    label
  );
  for (const field of [
    "operation",
    "contract_version",
    "source",
    "bosl_server_node",
    "title",
    "description",
    "permission",
    "input_schema",
    "output_schema",
    "allowed_references",
    "effect",
    "approval",
    "limits",
    "guarantees",
    "execution",
    "retry_policy",
    "receipt_schema",
    "public_errors",
    "provenance",
    "readiness",
    "ttlMs",
    "cacheScope"
  ]) {
    if (!Object.hasOwn(response, field)) {
      throw new Error(`${label}.${field} is required`);
    }
  }

  requireString(response.operation, `${label}.operation`);
  if (!semanticOperationPattern.test(response.operation)) {
    throw new Error(`${label}.operation must be a dotted semantic operation`);
  }
  if (expected.operation !== undefined && response.operation !== expected.operation) {
    throw new Error(`${label}.operation must match the requested contract link`);
  }
  requireString(response.contract_version, `${label}.contract_version`);
  if (!semanticVersionPattern.test(response.contract_version)) {
    throw new Error(`${label}.contract_version must be semantic version text`);
  }
  validateServiceReference(response.source, `${label}.source`);
  if (response.source.application !== "lead-director") {
    throw new Error(`${label}.source.application must be lead-director`);
  }
  if (expected.source !== undefined && !sameJson(response.source, expected.source)) {
    throw new Error(`${label}.source must match the selected plugin`);
  }
  if (typeof response.bosl_server_node !== "boolean") {
    throw new Error(`${label}.bosl_server_node must be boolean`);
  }
  if (response.bosl_server_node) {
    if (response.node_type !== "server") {
      throw new Error(`${label}.node_type must be server for a BOSL server node`);
    }
  } else if (Object.hasOwn(response, "node_type")) {
    throw new Error(`${label}.node_type must be absent for a non-BOSL operation`);
  }
  for (const field of ["title", "description", "permission", "effect"]) {
    requireString(response[field], `${label}.${field}`);
  }
  validateContractObjectSchema(response.input_schema, `${label}.input_schema`);
  validateContractObjectSchema(response.output_schema, `${label}.output_schema`);
  validateContractObjectSchema(response.receipt_schema, `${label}.receipt_schema`);

  requireObject(response.allowed_references, `${label}.allowed_references`);
  const inputProperties = response.input_schema.properties ?? {};
  requireObject(inputProperties, `${label}.input_schema.properties`);
  if (!sameJson(Object.keys(response.allowed_references).sort(), Object.keys(inputProperties).sort())) {
    throw new Error(`${label}.allowed_references must cover every input property exactly`);
  }
  for (const [field, references] of Object.entries(response.allowed_references)) {
    if (!Array.isArray(references) ||
        references.some((item) => typeof item !== "string" || item.trim() === "") ||
        references.length !== new Set(references).size) {
      throw new Error(`${label}.allowed_references.${field} must contain unique reference names`);
    }
  }

  requireObject(response.approval, `${label}.approval`);
  if (typeof response.approval.required !== "boolean") {
    throw new Error(`${label}.approval.required must be boolean`);
  }
  validateOperationLimits(response.limits, `${label}.limits`, { complete: true });
  validateOperationGuarantees(response.guarantees, `${label}.guarantees`);
  validateExecutionContract(response.execution, `${label}.execution`);
  requireObject(response.retry_policy, `${label}.retry_policy`);
  if (!Number.isInteger(response.retry_policy.maximum_attempts) ||
      response.retry_policy.maximum_attempts < 1) {
    throw new Error(`${label}.retry_policy.maximum_attempts must be a positive integer`);
  }
  if (!Array.isArray(response.public_errors)) {
    throw new Error(`${label}.public_errors must be an array`);
  }
  const publicCodes = new Set();
  response.public_errors.forEach((error, index) => {
    validatePublicOperationError(error, `${label}.public_errors[${index}]`);
    if (publicCodes.has(error.code)) {
      throw new Error(`${label}.public_errors contains duplicate code ${error.code}`);
    }
    publicCodes.add(error.code);
  });
  if (response.recovery !== null && response.recovery !== undefined) {
    validateOperationRecovery(response.recovery, `${label}.recovery`);
  }
  requireObject(response.provenance, `${label}.provenance`);
  requireString(response.provenance.kind, `${label}.provenance.kind`);
  validateReadiness(response.readiness, `${label}.readiness`);
  if (response.ttlMs !== 0 || response.cacheScope !== "private") {
    throw new Error(`${label} must be fresh private MCP data`);
  }
  return response;
}

export function validateOperationDescription(response) {
  requireObject(response, "operation Describe response");
  rejectRawAuthority(response, "operation Describe response");
  requireExactKeys(
    response,
    new Set(["contract_version", "metadata_version", "observed_at", "operations"]),
    "operation Describe response"
  );
  requireString(response.contract_version, "operation Describe response.contract_version");
  requireString(response.metadata_version, "operation Describe response.metadata_version");
  requireString(response.observed_at, "operation Describe response.observed_at");
  if (Number.isNaN(Date.parse(response.observed_at))) {
    throw new Error("operation Describe response.observed_at must be a date-time");
  }
  if (!Array.isArray(response.operations) ||
      response.operations.length < 1 || response.operations.length > 5) {
    throw new Error("operation Describe response.operations must contain 1 through 5 items");
  }
  const identifiers = new Set();
  response.operations.forEach((operation, index) => {
    const label = `operation Describe response.operations[${index}]`;
    requireObject(operation, label);
    requireString(operation.operation, `${label}.operation`);
    if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(operation.operation)) {
      throw new Error(`${label}.operation is not a canonical semantic operation`);
    }
    if (identifiers.has(operation.operation)) {
      throw new Error(`operation Describe response duplicates ${operation.operation}`);
    }
    identifiers.add(operation.operation);
    if (operation.status === "not_available") {
      requireExactKeys(operation, new Set(["operation", "status"]), label);
      return;
    }
    if (operation.status !== "described") {
      throw new Error(`${label}.status is invalid`);
    }
    requireExactKeys(
      operation,
      new Set([
        "operation",
        "status",
        "effect",
        "limits",
        "guarantees",
        "execution",
        "input_schema",
        "output_schema",
        "error_contract",
        "sources"
      ]),
      label
    );
    requireString(operation.effect, `${label}.effect`);
    validateOperationLimits(operation.limits, `${label}.limits`, { complete: true });
    for (const field of [
      "max_targets",
      "max_results_per_source",
      "pagination_supported",
      "bulk_supported",
      "streaming_supported",
      "maximum_duration_seconds",
      "maximum_fan_out"
    ]) {
      if (!Object.hasOwn(operation.limits, field)) {
        throw new Error(`${label}.limits.${field} is required`);
      }
    }
    requireExactKeys(
      operation.limits,
      new Set([
        "max_targets",
        "max_results_per_source",
        "pagination_supported",
        "bulk_supported",
        "streaming_supported",
        "maximum_duration_seconds",
        "maximum_fan_out"
      ]),
      `${label}.limits`
    );
    validateOperationGuarantees(operation.guarantees, `${label}.guarantees`);
    validateExecutionContract(operation.execution, `${label}.execution`);
    validateOperationSchema(operation.input_schema, `${label}.input_schema`);
    validateOperationSchema(operation.output_schema, `${label}.output_schema`);
    validateErrorContract(operation.error_contract, `${label}.error_contract`);
    if (!Array.isArray(operation.sources) || operation.sources.length === 0) {
      throw new Error(`${label}.sources must be a non-empty array`);
    }
    operation.sources.forEach((source, sourceIndex) => {
      const sourceLabel = `${label}.sources[${sourceIndex}]`;
      requireObject(source, sourceLabel);
      const detailFields = [
        "input_schema",
        "output_schema",
        "receipt_schema",
        "limits",
        "guarantees",
        "error_contract"
      ];
      requireExactKeys(
        source,
        new Set(["source", "availability", ...detailFields]),
        sourceLabel
      );
      validateServiceReference(source.source, `${sourceLabel}.source`);
      if (!new Set([
        "ready",
        "authorization_required",
        "configuration_required",
        "temporarily_unavailable"
      ]).has(source.availability)) {
        throw new Error(`${sourceLabel}.availability is invalid`);
      }
      const presentDetails = detailFields.filter((field) => Object.hasOwn(source, field));
      if (presentDetails.length !== 0 && presentDetails.length !== detailFields.length) {
        throw new Error(`${sourceLabel} must include all source-specific contract fields together`);
      }
      if (presentDetails.length === detailFields.length) {
        validateOperationSchema(source.input_schema, `${sourceLabel}.input_schema`);
        validateOperationSchema(source.output_schema, `${sourceLabel}.output_schema`);
        validateOperationSchema(source.receipt_schema, `${sourceLabel}.receipt_schema`);
        validateSourceOperationLimits(source.limits, `${sourceLabel}.limits`);
        validateOperationGuarantees(source.guarantees, `${sourceLabel}.guarantees`);
        validateErrorContract(source.error_contract, `${sourceLabel}.error_contract`);
      }
    });
  });
  return response;
}

function validateDetailedJourney(journey, compactJourney) {
  requireObject(journey, "service.describe response.journey");
  requireExactKeys(
    journey,
    new Set([
      "title",
      "entry",
      "inputs",
      "limits",
      "required_authority",
      "steps",
      "outcomes",
      "public_errors"
    ]),
    "service.describe response.journey"
  );
  for (const field of [
    "title",
    "entry",
    "inputs",
    "limits",
    "required_authority",
    "steps",
    "outcomes",
    "public_errors"
  ]) {
    if (!Object.hasOwn(journey, field)) {
      throw new Error(`service.describe response.journey.${field} is required`);
    }
  }
  requireString(journey.title, "service.describe response.journey.title");
  requireString(journey.entry, "service.describe response.journey.entry");
  requireObject(journey.inputs, "service.describe response.journey.inputs");
  requireObject(journey.limits, "service.describe response.journey.limits");
  requireObject(journey.required_authority, "service.describe response.journey.required_authority");
  requireObject(journey.outcomes, "service.describe response.journey.outcomes");
  requireObject(journey.public_errors, "service.describe response.journey.public_errors");
  if (journey.title !== compactJourney.title) {
    throw new Error("service.describe response compact journey title does not agree");
  }
  const compactInputs = [...compactJourney.inputs].sort();
  const detailedInputs = Object.keys(journey.inputs).sort();
  if (!sameJson(compactInputs, detailedInputs)) {
    throw new Error("service.describe response compact journey inputs do not agree");
  }
  if (!Object.values(journey.outcomes).includes(compactJourney.success)) {
    throw new Error("service.describe response compact journey success does not agree");
  }
  if (!Array.isArray(journey.steps) || journey.steps.length === 0) {
    throw new Error("service.describe response.journey.steps must be a non-empty array");
  }
  const compactSteps = compactJourney.steps.map(({ code, type }) => ({ code, type }));
  const detailedSteps = journey.steps.map(({ code, type }) => ({ code, type }));
  if (!sameJson(compactSteps, detailedSteps)) {
    throw new Error("service.describe response compact journey steps do not agree");
  }
  for (const [index, step] of journey.steps.entries()) {
    if (step.title !== compactJourney.steps[index].description) {
      throw new Error("service.describe response compact journey step descriptions do not agree");
    }
  }
  for (const [index, step] of journey.steps.entries()) {
    const label = `service.describe response.journey.steps[${index}]`;
    requireObject(step, label);
    requireString(step.code, `${label}.code`);
    requireString(step.title, `${label}.title`);
    requireObject(step.inputs, `${label}.inputs`);
    requireObject(step.outputs, `${label}.outputs`);
    if (step.type === "client") {
      if (step.operation !== null && step.operation !== undefined) {
        throw new Error(`${label} mixes client and server ownership`);
      }
      requireObject(step.instruction, `${label}.instruction`);
    } else if (step.type === "server") {
      if (step.instruction !== null && step.instruction !== undefined) {
        throw new Error(`${label} mixes client and server ownership`);
      }
      if (step.terminal !== true) {
        requireString(step.operation, `${label}.operation`);
        requireString(step.effect, `${label}.effect`);
        validateContractLink(step.contract, step.operation, `${label}.contract`);
        validateOperationLimits(step.limits, `${label}.limits`);
        requireObject(step.approval, `${label}.approval`);
        if (!Array.isArray(step.public_errors)) {
          throw new Error(`${label}.public_errors must be an array`);
        }
        if (step.recovery !== null && step.recovery !== undefined) {
          requireObject(step.recovery, `${label}.recovery`);
        }
      }
    } else {
      throw new Error(`${label}.type must be client or server`);
    }
    const hasNext = typeof step.next === "string";
    const hasTransitions = step.transitions !== null && step.transitions !== undefined;
    if (step.terminal === true && (hasNext || hasTransitions)) {
      throw new Error(`${label} terminal step cannot select a successor`);
    }
    if (step.terminal !== true && hasNext === hasTransitions) {
      throw new Error(`${label} must declare exactly one successor form`);
    }
  }
  const codes = journey.steps.map(({ code }) => code);
  if (codes.length !== new Set(codes).size || !codes.includes(journey.entry)) {
    throw new Error("service.describe response.journey requires unique steps and a valid entry");
  }
}

export function validateServiceJourneyDescription(description, compactPlugin) {
  requireObject(description, "service.describe response");
  rejectRawAuthority(description, "service.describe response");
  requireExactKeys(
    description,
    new Set([
      "reference",
      "name",
      "purpose",
      "descriptor_etag",
      "journey",
      "queries",
      "readiness",
      "ttlMs",
      "cacheScope"
    ]),
    "service.describe response"
  );
  validateServiceReference(description.reference, "service.describe response.reference");
  if (!sameJson(description.reference, compactPlugin.reference)) {
    throw new Error("service.describe response reference must match plugins.list");
  }
  requireString(description.descriptor_etag, "service.describe response.descriptor_etag");
  requireString(description.name, "service.describe response.name");
  requireString(description.purpose, "service.describe response.purpose");
  if (description.name !== compactPlugin.name ||
      description.purpose !== compactPlugin.purpose ||
      description.descriptor_etag !== compactPlugin.descriptor_etag) {
    throw new Error("service.describe response must match the selected plugins.list descriptor");
  }
  validateMcpPrivateMetadata(description, "service.describe response");
  validateDetailedJourney(description.journey, compactPlugin.journey);
  if (!Array.isArray(description.queries)) {
    throw new Error("service.describe response.queries must be an array");
  }
  description.queries.forEach((query, index) => {
    const label = `service.describe response.queries[${index}]`;
    requireObject(query, label);
    requireExactKeys(query, new Set(["operation", "purpose", "contract"]), label);
    requireString(query.operation, `${label}.operation`);
    requireString(query.purpose, `${label}.purpose`);
    validateContractLink(query.contract, query.operation, `${label}.contract`);
  });
  validateReadiness(description.readiness, "service.describe response.readiness");
  return description;
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
  if (mode === "contact") validateAppContact(parsed);
  else if (mode === "service") validateServiceDescriptor(parsed);
  else if (mode === "graph") validateGraphDescription(parsed);
  else if (mode === "app-describe") validateAppDescribe(parsed);
  else if (mode === "plugins") validatePluginsList(parsed);
  else if (mode === "discovery-refresh") validateDiscoveryRefresh(parsed);
  else if (mode === "service-journey") {
    validateServiceJourneyDescription(parsed.description, parsed.compact_plugin);
  } else if (mode === "operation-describe") {
    validateOperationDescription(parsed);
  } else if (mode === "api-contract") {
    requireObject(parsed, "api-contract validation input");
    validateApiContractResponse(parsed.response, {
      operation: parsed.operation,
      source: parsed.source
    });
  } else {
    throw new Error(
      "usage: validate-discovery.mjs <contact|service|graph|app-describe|plugins|discovery-refresh|service-journey|operation-describe|api-contract>"
    );
  }
  process.stdout.write(JSON.stringify({ valid: true, kind: mode }) + "\n");
}

const invokedPath = process.argv[1];
if (invokedPath &&
    realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(invokedPath))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
