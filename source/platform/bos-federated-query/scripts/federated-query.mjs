#!/usr/bin/env node

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const PLAN_VERSION = "bos-query-plan/v2";
const RESULT_VERSION = "bos-query-result/v2";
const EVENT_VERSION = "bos-execution-event/v2";
const MODES = new Set(["per_source", "federated", "merged_view", "synchronize_from"]);
const ORIGINS = new Set(["cache", "live", "mixed"]);
const USAGE_SCOPES = new Set(["host_measured", "client_visible_estimate", "unavailable"]);
const CLIENT_EVENT_TYPES = new Set([
  "plan_created", "discovery_contract_cache_used", "discovery_contract_refreshed",
  "dataset_cache_hit", "dataset_cache_stale", "service_invocation_started",
  "aggregation_started", "query_finalized"
]);
const SERVER_EVENT_TYPES = new Set([
  "source_completed", "source_failed", "federation_completed"
]);
const CRM_SEARCH_SCHEMA_VERSION = "lead-director-crm-search/v1";
const CRM_GET_SCHEMA_VERSION = "lead-director-crm-get/v1";
const CRM_MUTATION_SCHEMA_VERSION = "lead-director-crm-mutation/v1";
const CRM_SYNC_PLAN_SCHEMA_VERSION = "lead-director-crm-sync-plan/v1";
const CRM_SYNC_APPLY_SCHEMA_VERSION = "lead-director-crm-sync-apply/v1";
const CRM_SOURCE_STATUSES = new Set([
  "ready", "reconnect_required", "configuration_missing",
  "provider_unavailable", "provider_tenant_mismatch", "unsupported"
]);
const CRM_SOURCE_CAPABILITIES = new Set(["search", "get", "create", "update"]);
const CRM_CHANGE_FIELDS = new Set([
  "displayName", "firstName", "lastName", "email", "phone", "lifecycle", "attributes"
]);

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function forbidUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown field ${unknown[0]}`);
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function instant(value, label) {
  const parsed = new Date(text(value, label));
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${label} must be an ISO instant`);
  return parsed;
}

function credentialFreeHttps(value, label) {
  const raw = text(value, label);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${label} must be a credential-free HTTPS URL`);
  }
  return raw;
}

function jsonShape(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return { type: "array", count: value.length };
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, jsonShape(value[key])])
    );
  }
  return typeof value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateDiscoveredService(service) {
  object(service, "service");
  for (const field of ["serviceId", "summary", "ownerKind", "version", "apiBaseUrl", "contractUri"]) {
    text(service[field], `service.${field}`);
  }
  credentialFreeHttps(service.apiBaseUrl, "service.apiBaseUrl");
  credentialFreeHttps(service.contractUri, "service.contractUri");
  if (!Array.isArray(service.entityTypes) || service.entityTypes.length === 0) {
    throw new Error("service.entityTypes must be a non-empty array");
  }
  if (!Array.isArray(service.requiredScopes) || service.requiredScopes.length === 0) {
    throw new Error("service.requiredScopes must be a non-empty array");
  }
  if (!Array.isArray(service.requiredCapabilities)) {
    throw new Error("service.requiredCapabilities must be an array");
  }
  object(service.authScheme, "service.authScheme");
  object(service.provenance, "service.provenance");
  if (!Array.isArray(service.failureContract)) {
    throw new Error("service.failureContract must be an array");
  }
  if (!Array.isArray(service.operations) || service.operations.length === 0) {
    throw new Error("service.operations must be a non-empty array");
  }
  for (const [index, operation] of service.operations.entries()) {
    object(operation, `service.operations[${index}]`);
    for (const field of ["operationId", "capability", "method", "endpoint", "sideEffect"]) {
      text(operation[field], `service.operations[${index}].${field}`);
    }
    if (!new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]).has(operation.method)) {
      throw new Error(`service.operations[${index}].method is invalid`);
    }
    credentialFreeHttps(operation.endpoint, `service.operations[${index}].endpoint`);
    if (!["read", "write"].includes(operation.sideEffect)) {
      throw new Error(`service.operations[${index}].sideEffect is invalid`);
    }
    if (typeof operation.idempotent !== "boolean") {
      throw new Error(`service.operations[${index}].idempotent must be a boolean`);
    }
    if (!Array.isArray(operation.requiredScopes) || operation.requiredScopes.length === 0) {
      throw new Error(`service.operations[${index}].requiredScopes must be a non-empty array`);
    }
    if (!Array.isArray(operation.requiredCapabilities)) {
      throw new Error(`service.operations[${index}].requiredCapabilities must be an array`);
    }
  }
  return service;
}

function usage(value = { scope: "unavailable" }) {
  object(value, "usage");
  const scope = text(value.scope ?? "unavailable", "usage.scope");
  if (!USAGE_SCOPES.has(scope)) throw new Error("usage.scope is invalid");
  const result = { scope };
  for (const field of ["input_tokens", "output_tokens", "total_tokens"]) {
    if (value[field] === undefined) continue;
    if (!Number.isInteger(value[field]) || value[field] < 0) {
      throw new Error(`usage.${field} must be a non-negative integer`);
    }
    result[field] = value[field];
  }
  if (result.total_tokens === undefined &&
      Number.isInteger(result.input_tokens) && Number.isInteger(result.output_tokens)) {
    result.total_tokens = result.input_tokens + result.output_tokens;
  }
  return result;
}

function sourceSelection(input) {
  if (input.sourceHandles === undefined) {
    return { scope: "all_enabled_authorized" };
  }
  if (!Array.isArray(input.sourceHandles) || input.sourceHandles.length === 0 ||
      input.sourceHandles.length > 100) {
    throw new Error("sourceHandles must be omitted or contain 1 through 100 items");
  }
  const handles = input.sourceHandles.map((handle, index) => {
    const validated = text(handle, `sourceHandles[${index}]`);
    if (!/^crm_src_[0-9a-f]{64}$/.test(validated)) {
      throw new Error(`sourceHandles[${index}] must be a current opaque CRM source handle`);
    }
    return validated;
  });
  if (new Set(handles).size !== handles.length) {
    throw new Error("sourceHandles must not contain duplicates");
  }
  if (!Array.isArray(input.discoveredSources)) {
    throw new Error("explicit sourceHandles require current discoveredSources");
  }
  const discoveredHandles = new Set(input.discoveredSources.map((source, index) =>
    validateCrmSource(source, `discoveredSources[${index}]`).sourceHandle
  ));
  if (handles.some((handle) => !discoveredHandles.has(handle))) {
    throw new Error("sourceHandles contains a handle absent from current source discovery");
  }
  return { scope: "selected", sourceHandles: handles };
}

function crmQuery(value) {
  const query = object(value, "query");
  const allowed = new Set(["text", "email", "phone"]);
  const unknown = Object.keys(query).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(`query contains unsupported field ${unknown[0]}`);
  }
  const supplied = [...allowed].filter((key) => query[key] !== undefined && query[key] !== null);
  if (supplied.length !== 1) {
    throw new Error("query requires exactly one of text, email, or phone");
  }
  const key = supplied[0];
  const raw = query[key];
  const bounds = key === "text" ? [1, 2000] : key === "email" ? [3, 320] : [3, 100];
  if (typeof raw !== "string" || raw.length < bounds[0] || raw.length > bounds[1]) {
    throw new Error(`query.${key} must contain ${bounds[0]} through ${bounds[1]} characters`);
  }
  const normalized = raw.trim().split(/\s+/).filter(Boolean).join(" ");
  if (!normalized) throw new Error(`query.${key} must contain searchable text`);
  return { [key]: normalized };
}

function boundedText(value, label, minimum, maximum) {
  const normalized = text(value, label);
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(`${label} must contain ${minimum} through ${maximum} characters`);
  }
  return normalized;
}

function validateSourceHandle(value, label) {
  const handle = boundedText(value, label, 72, 72);
  if (!/^crm_src_[0-9a-f]{64}$/.test(handle)) {
    throw new Error(`${label} must be a current opaque CRM source handle`);
  }
  return handle;
}

function validateRecordHandle(value, label, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  const handle = boundedText(value, label, 9, 2048);
  if (!/^crm_rec_[A-Za-z0-9_-]+={0,2}$/.test(handle)) {
    throw new Error(`${label} must be a current opaque CRM record handle`);
  }
  return handle;
}

function validateSyncPlanHandle(value, label) {
  const handle = boundedText(value, label, 10, 100000);
  if (!/^crm_plan_[A-Za-z0-9_-]+={0,2}$/.test(handle)) {
    throw new Error(`${label} must be a current opaque CRM synchronization plan handle`);
  }
  return handle;
}

function validateCrmSource(source, label = "source") {
  object(source, label);
  forbidUnknownKeys(
    source,
    new Set(["sourceHandle", "displayName", "status", "capabilities"]),
    label
  );
  const sourceHandle = validateSourceHandle(source.sourceHandle, `${label}.sourceHandle`);
  const displayName = boundedText(source.displayName, `${label}.displayName`, 1, 300);
  if (!CRM_SOURCE_STATUSES.has(source.status)) {
    throw new Error(`${label}.status is invalid`);
  }
  if (!Array.isArray(source.capabilities) ||
      source.capabilities.some((capability) => !CRM_SOURCE_CAPABILITIES.has(capability))) {
    throw new Error(`${label}.capabilities is invalid`);
  }
  return {
    sourceHandle,
    displayName,
    status: source.status,
    capabilities: [...source.capabilities]
  };
}

function validateCrmError(value, label) {
  if (value === null || value === undefined) return null;
  const error = object(value, label);
  forbidUnknownKeys(error, new Set(["code", "message", "retriable"]), label);
  if (typeof error.retriable !== "boolean") {
    throw new Error(`${label}.retriable must be a boolean`);
  }
  return {
    code: boundedText(error.code, `${label}.code`, 1, 100),
    message: boundedText(error.message, `${label}.message`, 1, 1000),
    retriable: error.retriable
  };
}

function validateCrmProvenance(value, options, label) {
  const provenance = object(value, label);
  forbidUnknownKeys(
    provenance,
    new Set(["correlationId", "authorityEpoch", "observedAt", "graphDigest", "sourceService"]),
    label
  );
  const correlationId = boundedText(provenance.correlationId, `${label}.correlationId`, 1, 128);
  if (!Number.isInteger(provenance.authorityEpoch) || provenance.authorityEpoch < 0) {
    throw new Error(`${label}.authorityEpoch must be a non-negative integer`);
  }
  if (!Number.isInteger(options.expectedAuthorityEpoch) || options.expectedAuthorityEpoch < 0) {
    throw new Error("options.expectedAuthorityEpoch must be a non-negative integer");
  }
  if (provenance.authorityEpoch !== options.expectedAuthorityEpoch) {
    throw new Error(`${label}.authorityEpoch does not match the active authority context`);
  }
  const observedAt = instant(provenance.observedAt, `${label}.observedAt`).toISOString();
  const sourceService = boundedText(provenance.sourceService, `${label}.sourceService`, 1, 100);
  if (sourceService !== text(options.expectedSourceService, "options.expectedSourceService")) {
    throw new Error(`${label}.sourceService does not match the discovered service`);
  }
  return {
    correlation_id: correlationId,
    authority_epoch: provenance.authorityEpoch,
    observed_at: observedAt,
    source_service: sourceService
  };
}

function validateRecordSource(value, label) {
  const source = object(value, label);
  forbidUnknownKeys(
    source,
    new Set(["sourceHandle", "recordHandle", "recordType", "observedAt", "version"]),
    label
  );
  const version = source.version === null || source.version === undefined
    ? null
    : boundedText(source.version, `${label}.version`, 1, 500);
  return {
    sourceHandle: validateSourceHandle(source.sourceHandle, `${label}.sourceHandle`),
    recordHandle: validateRecordHandle(source.recordHandle, `${label}.recordHandle`),
    recordType: boundedText(source.recordType, `${label}.recordType`, 1, 100),
    observedAt: instant(source.observedAt, `${label}.observedAt`).toISOString(),
    version
  };
}

function optionalBoundedText(value, label, maximum) {
  if (value === null || value === undefined) return null;
  return boundedText(value, label, 1, maximum);
}

function validateCrmRecord(value, label = "record") {
  const record = object(value, label);
  forbidUnknownKeys(
    record,
    new Set([
      "recordRef", "displayName", "email", "phone", "lifecycle", "sources",
      "matchConfidence", "attributes"
    ]),
    label
  );
  if (!Array.isArray(record.sources) || record.sources.length < 1 || record.sources.length > 100) {
    throw new Error(`${label}.sources must contain 1 through 100 items`);
  }
  if (!["exact", "probable", "ambiguous", "none"].includes(record.matchConfidence)) {
    throw new Error(`${label}.matchConfidence is invalid`);
  }
  return {
    recordRef: (() => {
      const reference = boundedText(record.recordRef, `${label}.recordRef`, 1, 200);
      if (!/^crm_ref_[0-9a-f]{64}$/.test(reference)) {
        throw new Error(`${label}.recordRef must be an opaque CRM reference`);
      }
      return reference;
    })(),
    displayName: optionalBoundedText(record.displayName, `${label}.displayName`, 500),
    email: optionalBoundedText(record.email, `${label}.email`, 320),
    phone: optionalBoundedText(record.phone, `${label}.phone`, 100),
    lifecycle: optionalBoundedText(record.lifecycle, `${label}.lifecycle`, 200),
    sources: record.sources.map((source, index) =>
      validateRecordSource(source, `${label}.sources[${index}]`)
    ),
    matchConfidence: record.matchConfidence,
    attributes: { ...object(record.attributes, `${label}.attributes`) }
  };
}

function validateChanges(value, label = "changes") {
  const changes = object(value, label);
  const unknown = Object.keys(changes).filter((key) => !CRM_CHANGE_FIELDS.has(key));
  if (unknown.length > 0) throw new Error(`${label} contains unsupported field ${unknown[0]}`);
  const normalized = {};
  const maximums = {
    displayName: 500,
    firstName: 200,
    lastName: 200,
    email: 320,
    phone: 100,
    lifecycle: 200
  };
  for (const [field, maximum] of Object.entries(maximums)) {
    if (changes[field] !== undefined && changes[field] !== null) {
      const minimum = ["email", "phone"].includes(field) ? 3 : 1;
      normalized[field] = boundedText(changes[field], `${label}.${field}`, minimum, maximum);
    }
  }
  if (changes.attributes !== undefined) {
    const attributes = object(changes.attributes, `${label}.attributes`);
    if (Object.keys(attributes).length > 100) {
      throw new Error(`${label}.attributes must contain at most 100 fields`);
    }
    normalized.attributes = { ...attributes };
  }
  if (Object.keys(normalized).length === 0 ||
      (Object.keys(normalized).length === 1 && normalized.attributes &&
       Object.keys(normalized.attributes).length === 0)) {
    throw new Error(`${label} requires at least one CRM field`);
  }
  return normalized;
}

function validateIdempotencyKey(value, label = "idempotencyKey") {
  return boundedNoEdgeWhitespace(value, label, 8, 200);
}

function boundedNoEdgeWhitespace(value, label, minimum, maximum) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} must contain ${minimum} through ${maximum} characters`);
  }
  if (/^\s|\s$/.test(value)) {
    throw new Error(`${label} must not start or end with whitespace`);
  }
  return value;
}

function selectOperation(input) {
  const service = object(input.service, "service");
  if (!Array.isArray(service.operations) || service.operations.length === 0) {
    throw new Error("service.operations must be a non-empty array");
  }
  const capability = text(input.operationCapability, "operationCapability");
  const matches = service.operations.filter((operation, index) => {
    object(operation, `service.operations[${index}]`);
    return operation.capability === capability;
  });
  if (matches.length !== 1) {
    throw new Error("operationCapability must resolve to exactly one discovered service operation");
  }
  const selected = matches[0];
  if (!Array.isArray(selected.requiredCapabilities)) {
    throw new Error("selected operation.requiredCapabilities must be an array");
  }
  return {
    operationId: text(selected.operationId, "selected operation.operationId"),
    capability,
    method: text(selected.method, "selected operation.method"),
    endpoint: text(selected.endpoint, "selected operation.endpoint"),
    sideEffect: text(selected.sideEffect, "selected operation.sideEffect"),
    idempotent: selected.idempotent,
    requiredCapabilities: [...selected.requiredCapabilities]
  };
}

function crmOperationEnvelope(
  input,
  capability,
  expectedSideEffect,
  expectedMethod,
  expectedIdempotent = true
) {
  const app = object(input.app, "app");
  if (!Number.isInteger(app.authority_epoch) || app.authority_epoch < 0) {
    throw new Error("app.authority_epoch must be a non-negative integer");
  }
  const service = validateDiscoveredService(object(input.service, "service"));
  const invocation = selectOperation({ service, operationCapability: capability });
  if (invocation.sideEffect !== expectedSideEffect) {
    throw new Error(`${capability} must advertise sideEffect ${expectedSideEffect}`);
  }
  if (invocation.method !== expectedMethod) {
    throw new Error(`${capability} must advertise method ${expectedMethod}`);
  }
  if (invocation.idempotent !== expectedIdempotent) {
    throw new Error(`${capability} must advertise idempotent ${expectedIdempotent}`);
  }
  return {
    product: text(input.product, "product"),
    app: {
      app_code: text(app.app_code, "app.app_code"),
      context_id: text(app.context_id, "app.context_id"),
      authority_epoch: app.authority_epoch,
      contract_version: text(app.contract_version, "app.contract_version"),
      discovery_epoch: text(app.discovery_epoch, "app.discovery_epoch")
    },
    service: {
      serviceId: text(service.serviceId, "service.serviceId"),
      version: text(service.version, "service.version"),
      contractUri: text(service.contractUri, "service.contractUri")
    },
    invocation: { count: 1, owner: "app_service", ...invocation }
  };
}

function requireReadySource(source, capability, label = "source") {
  const validated = validateCrmSource(source, label);
  if (validated.status !== "ready") throw new Error(`${label} must currently be ready`);
  if (!validated.capabilities.includes(capability)) {
    throw new Error(`${label} does not advertise ${capability}`);
  }
  return validated;
}

function recordOperationTarget(input, capability) {
  const source = requireReadySource(input.source, capability);
  const recordSource = validateRecordSource(input.recordSource, "recordSource");
  if (recordSource.sourceHandle !== source.sourceHandle) {
    throw new Error("recordSource.sourceHandle does not match the selected discovered source");
  }
  return { source, recordSource };
}

export function buildCrmRecordOperationPlan(input) {
  object(input, "input");
  const intent = text(input.intent, "intent");
  const capabilityByIntent = {
    get: "crm.records.get",
    create: "crm.records.create",
    update: "crm.records.update"
  };
  const capability = capabilityByIntent[intent];
  if (!capability) throw new Error("intent must be get, create, or update");
  const mutating = intent !== "get";
  const methodByIntent = { get: "POST", create: "POST", update: "PATCH" };
  const envelope = crmOperationEnvelope(
    input,
    capability,
    mutating ? "write" : "read",
    methodByIntent[intent]
  );
  let source;
  let request;
  if (intent === "create") {
    source = requireReadySource(input.source, "create");
    request = {
      sourceHandle: source.sourceHandle,
      changes: validateChanges(input.changes),
      idempotencyKey: validateIdempotencyKey(input.idempotencyKey)
    };
  } else {
    const target = recordOperationTarget(input, intent);
    source = target.source;
    request = { recordHandle: target.recordSource.recordHandle };
    if (intent === "update") {
      const expectedVersion = boundedText(input.expectedVersion, "expectedVersion", 1, 500);
      if (target.recordSource.version === null || expectedVersion !== target.recordSource.version) {
        throw new Error("expectedVersion must equal the current server-returned record version");
      }
      request = {
        ...request,
        expectedVersion,
        changes: validateChanges(input.changes),
        idempotencyKey: validateIdempotencyKey(input.idempotencyKey)
      };
    }
  }
  const planBase = {
    plan_version: "bos-crm-record-operation-plan/v1",
    ...envelope,
    intent,
    source: {
      source_handle_digest: hash(source.sourceHandle).slice(0, 16),
      display_name: source.displayName
    },
    request
  };
  const confirmationId = mutating ? operationConfirmationId(planBase) : null;
  const confirmation = {
    required: mutating,
    confirmation_id: confirmationId,
    confirmed: mutating ? input.confirmationId === confirmationId : true
  };
  const material = {
    ...planBase,
    confirmation,
    execution_ready: confirmation.confirmed
  };
  return { ...material, plan_id: `bos_crm_op_${hash(material).slice(0, 24)}` };
}

export function assertCrmOperationExecutable(plan) {
  object(plan, "plan");
  if (plan.invocation?.count !== 1 || plan.invocation?.owner !== "app_service") {
    throw new Error("CRM operation must contain exactly one app-service invocation");
  }
  const requiresConfirmation =
    (plan.plan_version === "bos-crm-record-operation-plan/v1" &&
      ["create", "update"].includes(plan.intent)) ||
    plan.plan_version === "bos-crm-sync-apply-plan/v1";
  if (requiresConfirmation && plan.confirmation?.required !== true) {
    throw new Error("CRM mutation plan cannot downgrade its confirmation requirement");
  }
  const prefix = plan.plan_version === "bos-crm-record-operation-plan/v1"
    ? "bos_crm_op_"
    : plan.plan_version === "bos-crm-sync-apply-plan/v1"
      ? "bos_crm_sync_apply_" : null;
  if (prefix === null) throw new Error("CRM operation plan version is invalid");
  const material = { ...plan };
  delete material.plan_id;
  if (plan.plan_id !== `${prefix}${hash(material).slice(0, 24)}`) {
    throw new Error("CRM operation plan integrity check failed");
  }
  if (requiresConfirmation && plan.confirmation?.confirmed !== true) {
    throw new Error("explicit user confirmation is required before CRM mutation execution");
  }
  if (requiresConfirmation &&
      plan.confirmation.confirmation_id !== operationConfirmationId(plan)) {
    throw new Error("CRM mutation confirmation does not match the current operation plan");
  }
  if (plan.execution_ready !== true) throw new Error("CRM operation is not execution ready");
  return plan;
}

function operationConfirmationId(plan) {
  return `bos_confirm_${hash({
    plan_version: plan.plan_version,
    app: plan.app,
    service: plan.service,
    invocation: plan.invocation,
    intent: plan.intent ?? null,
    request: plan.request,
    target_ids: plan.target_ids ?? null,
    target_closure: plan.target_closure ?? null,
    atomicity: plan.atomicity ?? null
  }).slice(0, 32)}`;
}

function explainInvocation(invocation) {
  return {
    count: invocation.count,
    owner: invocation.owner,
    operation_id: invocation.operationId,
    capability: invocation.capability,
    method: invocation.method,
    endpoint_digest: hash(invocation.endpoint).slice(0, 16),
    side_effect: invocation.sideEffect,
    idempotent: invocation.idempotent,
    required_capabilities: [...invocation.requiredCapabilities]
  };
}

export function explainCrmOperationPlan(plan) {
  object(plan, "plan");
  return {
    plan_version: plan.plan_version,
    plan_id: text(plan.plan_id, "plan.plan_id"),
    intent: text(plan.intent, "plan.intent"),
    app: {
      app_code: plan.app.app_code,
      context_digest: hash(plan.app.context_id).slice(0, 16),
      authority_epoch: plan.app.authority_epoch,
      contract_version: plan.app.contract_version,
      discovery_epoch: plan.app.discovery_epoch
    },
    service: {
      service_id: plan.service.serviceId,
      version: plan.service.version,
      contract_uri_digest: hash(plan.service.contractUri).slice(0, 16)
    },
    invocation: explainInvocation(plan.invocation),
    source: { ...plan.source },
    request_shape: jsonShape(plan.request),
    changed_fields: plan.request.changes ? Object.keys(plan.request.changes).sort() : [],
    confirmation: { ...plan.confirmation },
    execution_ready: plan.execution_ready,
    executes_data_call: false
  };
}

export function buildQueryPlan(input) {
  object(input, "input");
  const mode = text(input.mode ?? "federated", "mode");
  if (!MODES.has(mode)) throw new Error("mode is invalid");
  const app = object(input.app, "app");
  if (!Number.isInteger(app.authority_epoch) || app.authority_epoch < 0) {
    throw new Error("app.authority_epoch must be a non-negative integer");
  }
  const service = validateDiscoveredService(object(input.service, "service"));
  const selectedOperation = selectOperation(input);
  if (selectedOperation.capability !== "crm.search" ||
      selectedOperation.method !== "POST" ||
      selectedOperation.sideEffect !== "read" ||
      selectedOperation.idempotent !== true) {
    throw new Error("query plan requires discovered crm.search POST read idempotent true");
  }
  const selection = sourceSelection(input);
  const maxAge = input.maxAgeSeconds ?? 300;
  if (!Number.isInteger(maxAge) || maxAge < 0) {
    throw new Error("maxAgeSeconds must be a non-negative integer");
  }
  const limitPerSource = input.limitPerSource ?? 50;
  if (!Number.isInteger(limitPerSource) || limitPerSource < 1 || limitPerSource > 100) {
    throw new Error("limitPerSource must be an integer from 1 through 100");
  }
  const material = {
    plan_version: PLAN_VERSION,
    product: text(input.product, "product"),
    app: {
      app_code: text(app.app_code, "app.app_code"),
      display_name: text(app.display_name, "app.display_name"),
      context_id: text(app.context_id, "app.context_id"),
      authority_epoch: app.authority_epoch,
      contract_version: text(app.contract_version, "app.contract_version"),
      discovery_epoch: text(app.discovery_epoch, "app.discovery_epoch")
    },
    service: {
      serviceId: text(service.serviceId, "service.serviceId"),
      version: text(service.version, "service.version"),
      contractUri: text(service.contractUri, "service.contractUri")
    },
    skills: (input.skills ?? []).map((item, index) => text(item, `skills[${index}]`)),
    dataset: text(input.dataset, "dataset"),
    request: {
      query: crmQuery(input.query),
      limitPerSource,
      ...(selection.scope === "selected" ? { sourceHandles: selection.sourceHandles } : {})
    },
    source_selection: selection,
    invocation: { count: 1, owner: "app_service", ...selectedOperation },
    cache_policy: {
      max_age_seconds: maxAge,
      allow_stale_on_error: input.allowStaleOnError === true
    },
    aggregation: { mode, preserve_per_source: true }
  };
  return { ...material, plan_id: `bos_plan_${hash(material).slice(0, 24)}` };
}

function explainSourceSelection(selection) {
  if (selection.scope === "all_enabled_authorized") {
    return {
      scope: "all_enabled_authorized",
      resolution_owner: "server",
      source_handle_digests: []
    };
  }
  return {
    scope: "selected",
    resolution_owner: "server",
    source_handle_digests: selection.sourceHandles.map((handle) => hash(handle).slice(0, 16))
  };
}

function explainServerPlan(serverPlan, plan) {
  if (serverPlan === undefined || serverPlan === null) {
    return { status: "deferred_to_server", sources: [] };
  }
  object(serverPlan, "serverPlan");
  forbidUnknownKeys(
    serverPlan,
    new Set([
      "schemaVersion", "contextId", "query", "sourceSelection", "sources",
      "execution", "mergeStrategy", "mutationSemantics", "provenance"
    ]),
    "serverPlan"
  );
  if (serverPlan.schemaVersion !== "lead-director-crm-explain/v1") {
    throw new Error("serverPlan.schemaVersion must be lead-director-crm-explain/v1");
  }
  if (!Array.isArray(serverPlan.sources) || serverPlan.sources.length > 100) {
    throw new Error("serverPlan.sources must be an array with at most 100 items");
  }
  if (text(serverPlan.contextId, "serverPlan.contextId") !== plan.app.context_id) {
    throw new Error("serverPlan.contextId does not match the selected app context");
  }
  if (JSON.stringify(crmQuery(serverPlan.query)) !== JSON.stringify(plan.request.query)) {
    throw new Error("serverPlan.query does not match the planned CRM query");
  }
  const expectedSelection = plan.source_selection.scope === "all_enabled_authorized"
    ? "all_authorized" : "explicit_handles";
  if (serverPlan.sourceSelection !== expectedSelection) {
    throw new Error("serverPlan.sourceSelection does not match the client plan");
  }
  if (!Array.isArray(serverPlan.execution) || serverPlan.execution.length > 10) {
    throw new Error("serverPlan.execution must be an array with at most 10 items");
  }
  if (serverPlan.mergeStrategy !== "exact_normalized_email_or_phone") {
    throw new Error("serverPlan.mergeStrategy is invalid");
  }
  if (serverPlan.mutationSemantics !== "single_source_underlying_guarantee") {
    throw new Error("serverPlan.mutationSemantics is invalid");
  }
  const provenance = object(serverPlan.provenance, "serverPlan.provenance");
  forbidUnknownKeys(
    provenance,
    new Set(["correlationId", "authorityEpoch", "observedAt", "graphDigest", "sourceService"]),
    "serverPlan.provenance"
  );
  boundedText(provenance.correlationId, "serverPlan.provenance.correlationId", 1, 128);
  if (!Number.isInteger(provenance.authorityEpoch) || provenance.authorityEpoch < 0) {
    throw new Error("serverPlan.provenance.authorityEpoch must be a non-negative integer");
  }
  if (provenance.authorityEpoch !== plan.app.authority_epoch) {
    throw new Error("serverPlan.provenance.authorityEpoch does not match the active authority context");
  }
  instant(provenance.observedAt, "serverPlan.provenance.observedAt");
  if (text(provenance.sourceService, "serverPlan.provenance.sourceService") !==
      plan.service.serviceId) {
    throw new Error("serverPlan.provenance.sourceService does not match the discovered service");
  }
  const sources = serverPlan.sources.map((source, index) => {
    const validated = validateCrmSource(source, `serverPlan.sources[${index}]`);
    return {
      source_handle: validated.sourceHandle,
      source_handle_digest: hash(validated.sourceHandle).slice(0, 16),
      source_label: validated.displayName,
      status: validated.status,
      capabilities: validated.capabilities
    };
  });
  if (plan.source_selection.scope === "selected") {
    const expectedHandles = [...plan.source_selection.sourceHandles].sort();
    const actualHandles = sources.map((source) => source.source_handle).sort();
    if (JSON.stringify(actualHandles) !== JSON.stringify(expectedHandles)) {
      throw new Error("serverPlan.sources do not match the explicit client source selection");
    }
  }
  return {
    status: "available",
    schema_version: text(serverPlan.schemaVersion, "serverPlan.schemaVersion"),
    source_selection: text(serverPlan.sourceSelection, "serverPlan.sourceSelection"),
    execution: serverPlan.execution.map((step, index) =>
      text(step, `serverPlan.execution[${index}]`)
    ),
    merge_strategy: text(serverPlan.mergeStrategy, "serverPlan.mergeStrategy"),
    mutation_semantics: text(serverPlan.mutationSemantics, "serverPlan.mutationSemantics"),
    sources: sources.map(({ source_handle: _sourceHandle, ...source }) => source)
  };
}

export function explainQueryPlan(plan, serverPlan) {
  object(plan, "plan");
  return {
    plan_version: plan.plan_version,
    plan_id: plan.plan_id,
    product: plan.product,
    app: {
      display_name: plan.app.display_name,
      app_code: plan.app.app_code,
      context_digest: hash(plan.app.context_id).slice(0, 16),
      authority_epoch: plan.app.authority_epoch,
      contract_version: plan.app.contract_version,
      discovery_epoch: plan.app.discovery_epoch
    },
    service: {
      service_id: plan.service.serviceId,
      version: plan.service.version,
      contract_uri_digest: hash(plan.service.contractUri).slice(0, 16)
    },
    skills: plan.skills,
    dataset: plan.dataset,
    request_shape: jsonShape(plan.request),
    source_selection: explainSourceSelection(plan.source_selection),
    invocation: explainInvocation(plan.invocation),
    cache_policy: plan.cache_policy,
    aggregation: plan.aggregation,
    server_source_plan: explainServerPlan(serverPlan, plan),
    executes_data_call: false
  };
}

export function executionEvent(input) {
  object(input, "event");
  if (!Number.isInteger(input.sequence) || input.sequence < 1) {
    throw new Error("event.sequence must be a positive integer");
  }
  const producer = text(input.producer ?? "client", "event.producer");
  if (!new Set(["client", "server"]).has(producer)) {
    throw new Error("event.producer must be client or server");
  }
  const eventType = text(input.event_type, "event.event_type");
  const allowed = producer === "client" ? CLIENT_EVENT_TYPES : SERVER_EVENT_TYPES;
  if (!allowed.has(eventType)) {
    throw new Error(`event type ${eventType} is not valid for ${producer}`);
  }
  return {
    event_version: EVENT_VERSION,
    sequence: input.sequence,
    producer,
    event_type: eventType,
    occurred_at: instant(input.occurred_at ?? new Date().toISOString(), "event.occurred_at").toISOString(),
    source_handle_digest: input.source_handle
      ? hash(text(input.source_handle, "event.source_handle")).slice(0, 16)
      : null,
    details: object(input.details ?? {}, "event.details")
  };
}

export function normalizeSourceResult(input, options = {}) {
  object(input, "source result");
  const origin = text(input.origin, "origin");
  if (!ORIGINS.has(origin)) throw new Error("origin is invalid");
  const updated = instant(input.last_updated_at, "last_updated_at");
  const now = options.now ? new Date(options.now) : new Date();
  const ageSeconds = Math.max(0, Math.floor((now.valueOf() - updated.valueOf()) / 1000));
  const maxAge = input.max_age_seconds;
  if (!Number.isInteger(maxAge) || maxAge < 0) {
    throw new Error("max_age_seconds must be a non-negative integer");
  }
  const stale = ageSeconds > maxAge;
  const staleFallbackAllowed = input.allow_stale_on_error === true && input.refresh_error === true;
  const cacheUsable = origin !== "cache" || !stale || staleFallbackAllowed;
  return {
    source_handle: text(input.source_handle, "source_handle"),
    source_label: text(input.source_label, "source_label"),
    status: cacheUsable ? text(input.status ?? "completed", "status") : "refresh_required",
    origin,
    freshness: {
      status: stale ? "stale" : "fresh",
      last_updated_at: updated.toISOString(),
      local_label: new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium", timeStyle: "short", ...(options.timeZone ? { timeZone: options.timeZone } : {})
      }).format(updated),
      age_seconds: ageSeconds,
      age_label: ageSeconds < 60
        ? `${ageSeconds} seconds ago`
        : ageSeconds < 3600
          ? `${Math.floor(ageSeconds / 60)} minutes ago`
          : `${Math.floor(ageSeconds / 3600)} hours ago`,
      max_age_seconds: maxAge
    },
    stale_fallback_used: origin === "cache" && staleFallbackAllowed,
    coverage: object(input.coverage ?? { complete: true }, "coverage"),
    records: cacheUsable && Array.isArray(input.records) ? input.records : [],
    error: input.error ?? null,
    elapsed_ms: Number.isInteger(input.elapsed_ms) && input.elapsed_ms >= 0 ? input.elapsed_ms : null,
    usage: usage(input.usage)
  };
}

export function normalizeSearchResponse(response, options = {}) {
  object(response, "search response");
  forbidUnknownKeys(
    response,
    new Set([
      "schemaVersion", "contextId", "query", "complete", "sourceResults",
      "records", "events", "provenance"
    ]),
    "search response"
  );
  if (response.schemaVersion !== CRM_SEARCH_SCHEMA_VERSION) {
    throw new Error(`search response.schemaVersion must be ${CRM_SEARCH_SCHEMA_VERSION}`);
  }
  const expectedContextId = text(options.expectedContextId, "options.expectedContextId");
  if (text(response.contextId, "search response.contextId") !== expectedContextId) {
    throw new Error("search response.contextId does not match the selected app context");
  }
  const responseQuery = crmQuery(response.query);
  const expectedQuery = crmQuery(options.expectedQuery);
  if (JSON.stringify(responseQuery) !== JSON.stringify(expectedQuery)) {
    throw new Error("search response.query does not match the requested CRM query");
  }
  if (!Array.isArray(response.sourceResults) || response.sourceResults.length > 100) {
    throw new Error("search response.sourceResults must be an array with at most 100 items");
  }
  if (!Array.isArray(response.records) || response.records.length > 10000) {
    throw new Error("search response.records must be an array with at most 10000 items");
  }
  if (!Array.isArray(response.events) || response.events.length > 101) {
    throw new Error("search response.events must be an array with at most 101 items");
  }
  if (typeof response.complete !== "boolean") {
    throw new Error("search response.complete must be a boolean");
  }
  const provenance = validateCrmProvenance(
    response.provenance,
    options,
    "search response.provenance"
  );
  const observedAt = provenance.observed_at;
  const maxAgeSeconds = options.maxAgeSeconds ?? 300;
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 0) {
    throw new Error("options.maxAgeSeconds must be a non-negative integer");
  }
  const sourceResults = response.sourceResults.map((item, index) => {
    object(item, `search response.sourceResults[${index}]`);
    forbidUnknownKeys(
      item,
      new Set(["source", "status", "records", "observedAt", "freshness", "error"]),
      `search response.sourceResults[${index}]`
    );
    const source = validateCrmSource(
      item.source,
      `search response.sourceResults[${index}].source`
    );
    if (!new Set(["succeeded", "failed"]).has(item.status)) {
      throw new Error(`search response.sourceResults[${index}].status is invalid`);
    }
    if (item.freshness !== "live") {
      throw new Error(`search response.sourceResults[${index}].freshness is invalid`);
    }
    if (!Array.isArray(item.records) || item.records.length > 100) {
      throw new Error(
        `search response.sourceResults[${index}].records must be an array with at most 100 items`
      );
    }
    const resultError = validateCrmError(
      item.error,
      `search response.sourceResults[${index}].error`
    );
    if ((item.status === "succeeded") !== (resultError === null)) {
      throw new Error(`search response.sourceResults[${index}].status and error are inconsistent`);
    }
    const records = item.records.map((record, recordIndex) =>
      validateCrmRecord(record, `search response.sourceResults[${index}].records[${recordIndex}]`)
    );
    if (records.some((record) =>
      record.sources.some((recordSource) => recordSource.sourceHandle !== source.sourceHandle))) {
      throw new Error(`search response.sourceResults[${index}] contains cross-source record provenance`);
    }
    return {
      ...normalizeSourceResult({
        source_handle: text(source.sourceHandle, `search response.sourceResults[${index}].source.sourceHandle`),
        source_label: text(source.displayName, `search response.sourceResults[${index}].source.displayName`),
        status: item.status === "succeeded" ? "completed" : "failed",
        origin: "live",
        last_updated_at: instant(
          item.observedAt,
          `search response.sourceResults[${index}].observedAt`
        ).toISOString(),
        max_age_seconds: maxAgeSeconds,
        records,
        coverage: { complete: item.status === "succeeded" },
        error: resultError,
        usage: { scope: "unavailable" }
      }, options),
      source_status: text(source.status, `search response.sourceResults[${index}].source.status`),
      capabilities: [...source.capabilities]
    };
  });
  const sourceHandles = new Set(sourceResults.map((item) => item.source_handle));
  if (sourceHandles.size !== sourceResults.length) {
    throw new Error("search response.sourceResults contains duplicate source handles");
  }
  if (options.expectedSourceHandles !== undefined) {
    if (!Array.isArray(options.expectedSourceHandles) ||
        options.expectedSourceHandles.length < 1 || options.expectedSourceHandles.length > 100) {
      throw new Error("options.expectedSourceHandles must contain 1 through 100 items");
    }
    const expectedHandles = options.expectedSourceHandles.map((handle, index) =>
      validateSourceHandle(handle, `options.expectedSourceHandles[${index}]`)
    );
    if (JSON.stringify([...sourceHandles].sort()) !== JSON.stringify([...expectedHandles].sort())) {
      throw new Error("search response sourceResults do not match the explicit source selection");
    }
  }
  const allSucceeded = sourceResults.every((item) => item.status === "completed");
  if ((response.complete === true) !== allSucceeded) {
    throw new Error("search response.complete conflicts with source result statuses");
  }
  const records = response.records.map((record, index) =>
    validateCrmRecord(record, `search response.records[${index}]`)
  );
  if (records.some((record) =>
    record.sources.some((recordSource) => !sourceHandles.has(recordSource.sourceHandle)))) {
    throw new Error("search response.records contains provenance outside sourceResults");
  }
  const executionLedger = response.events.map((event, index) => {
    object(event, `search response.events[${index}]`);
    forbidUnknownKeys(
      event,
      new Set(["type", "sourceHandle", "resultCount"]),
      `search response.events[${index}]`
    );
    if (!Number.isInteger(event.resultCount) || event.resultCount < 0) {
      throw new Error(`search response.events[${index}].resultCount must be a non-negative integer`);
    }
    if (event.type === "federation_completed") {
      if (event.sourceHandle !== null || event.resultCount !== records.length) {
        throw new Error("federation_completed must describe the top-level federated records");
      }
    } else if (!sourceHandles.has(event.sourceHandle)) {
      throw new Error(`search response.events[${index}].sourceHandle is not in sourceResults`);
    }
    return executionEvent({
      sequence: index + 1,
      producer: "server",
      event_type: text(event.type, `search response.events[${index}].type`),
      occurred_at: observedAt,
      ...(event.sourceHandle ? { source_handle: event.sourceHandle } : {}),
      details: { result_count: event.resultCount }
    });
  });
  const federationEvents = response.events.filter((event) => event.type === "federation_completed");
  if (federationEvents.length !== 1 || response.events.at(-1)?.type !== "federation_completed") {
    throw new Error("search response must end with exactly one federation_completed event");
  }
  const sourceEvents = response.events.filter((event) => event.type !== "federation_completed");
  if (sourceEvents.length !== sourceResults.length ||
      new Set(sourceEvents.map((event) => event.sourceHandle)).size !== sourceResults.length) {
    throw new Error("search response must contain exactly one lifecycle event per source result");
  }
  for (const sourceResult of sourceResults) {
    const event = sourceEvents.find((candidate) => candidate.sourceHandle === sourceResult.source_handle);
    const expectedType = sourceResult.status === "completed" ? "source_completed" : "source_failed";
    if (!event || event.type !== expectedType || event.resultCount !== sourceResult.records.length) {
      throw new Error("search response source lifecycle event conflicts with its source result");
    }
  }
  return {
    schema_version: response.schemaVersion,
    complete: response.complete === true,
    query: responseQuery,
    source_results: sourceResults,
    records,
    execution_ledger: executionLedger,
    observed_at: observedAt,
    provenance: {
      ...provenance
    },
    usage: usage(options.usage)
  };
}

export function normalizeCrmGetResponse(response, options = {}) {
  object(response, "CRM get response");
  forbidUnknownKeys(
    response,
    new Set(["schemaVersion", "contextId", "record", "provenance"]),
    "CRM get response"
  );
  if (response.schemaVersion !== CRM_GET_SCHEMA_VERSION) {
    throw new Error(`CRM get response.schemaVersion must be ${CRM_GET_SCHEMA_VERSION}`);
  }
  const expectedContextId = text(options.expectedContextId, "options.expectedContextId");
  if (text(response.contextId, "CRM get response.contextId") !== expectedContextId) {
    throw new Error("CRM get response.contextId does not match the selected app context");
  }
  const provenance = validateCrmProvenance(
    response.provenance,
    options,
    "CRM get response.provenance"
  );
  const record = validateCrmRecord(response.record, "CRM get response.record");
  if (options.expectedRecordHandle !== undefined &&
      !record.sources.some((source) => source.recordHandle === options.expectedRecordHandle)) {
    throw new Error("CRM get response.record does not contain the requested record handle");
  }
  return {
    schema_version: response.schemaVersion,
    record,
    observed_at: provenance.observed_at,
    provenance,
    usage: usage(options.usage)
  };
}

export function normalizeCrmSourceListResponse(response, options = {}) {
  object(response, "CRM source-list response");
  forbidUnknownKeys(
    response,
    new Set(["schemaVersion", "contextId", "sources", "provenance"]),
    "CRM source-list response"
  );
  if (response.schemaVersion !== "lead-director-crm-sources/v1") {
    throw new Error(
      "CRM source-list response.schemaVersion must be lead-director-crm-sources/v1"
    );
  }
  if (text(response.contextId, "CRM source-list response.contextId") !==
      text(options.expectedContextId, "options.expectedContextId")) {
    throw new Error("CRM source-list response.contextId does not match the selected app context");
  }
  if (!Array.isArray(response.sources) || response.sources.length > 100) {
    throw new Error("CRM source-list response.sources must contain at most 100 items");
  }
  const sources = response.sources.map((source, index) =>
    validateCrmSource(source, `CRM source-list response.sources[${index}]`)
  );
  if (new Set(sources.map((source) => source.sourceHandle)).size !== sources.length) {
    throw new Error("CRM source-list response.sources contains duplicate source handles");
  }
  const provenance = validateCrmProvenance(
    response.provenance,
    options,
    "CRM source-list response.provenance"
  );
  return {
    schema_version: response.schemaVersion,
    sources,
    provenance
  };
}

export function normalizeCrmMutationResponse(response, options = {}) {
  object(response, "CRM mutation response");
  forbidUnknownKeys(
    response,
    new Set([
      "schemaVersion", "contextId", "operation", "complete", "atomicity",
      "source", "receipt", "error", "provenance"
    ]),
    "CRM mutation response"
  );
  if (response.schemaVersion !== CRM_MUTATION_SCHEMA_VERSION) {
    throw new Error(`CRM mutation response.schemaVersion must be ${CRM_MUTATION_SCHEMA_VERSION}`);
  }
  const expectedContextId = text(options.expectedContextId, "options.expectedContextId");
  if (text(response.contextId, "CRM mutation response.contextId") !== expectedContextId) {
    throw new Error("CRM mutation response.contextId does not match the selected app context");
  }
  const expectedOperation = text(options.expectedOperation, "options.expectedOperation");
  if (!["create", "update"].includes(response.operation) || response.operation !== expectedOperation) {
    throw new Error("CRM mutation response.operation does not match the requested operation");
  }
  if (typeof response.complete !== "boolean") {
    throw new Error("CRM mutation response.complete must be a boolean");
  }
  if (response.atomicity !== "underlying_source_guarantee") {
    throw new Error("CRM mutation response.atomicity is invalid");
  }
  const source = validateCrmSource(response.source, "CRM mutation response.source");
  if (source.sourceHandle !== text(options.expectedSourceHandle, "options.expectedSourceHandle")) {
    throw new Error("CRM mutation response source does not match the selected source");
  }
  if (!source.capabilities.includes(expectedOperation)) {
    throw new Error("CRM mutation response source does not advertise the completed operation");
  }
  let receipt = null;
  if (response.receipt !== null && response.receipt !== undefined) {
    const value = object(response.receipt, "CRM mutation response.receipt");
    forbidUnknownKeys(
      value,
      new Set(["recordHandle", "version", "succeeded"]),
      "CRM mutation response.receipt"
    );
    if (typeof value.succeeded !== "boolean") {
      throw new Error("CRM mutation response.receipt.succeeded must be a boolean");
    }
    receipt = {
      record_handle: validateRecordHandle(
        value.recordHandle,
        "CRM mutation response.receipt.recordHandle",
        true
      ),
      version: optionalBoundedText(value.version, "CRM mutation response.receipt.version", 500),
      succeeded: value.succeeded
    };
  }
  const error = validateCrmError(response.error, "CRM mutation response.error");
  if (response.complete !== (receipt?.succeeded === true) ||
      (response.complete && error !== null) || (!response.complete && error === null)) {
    throw new Error("CRM mutation response completion, receipt, and error are inconsistent");
  }
  const provenance = validateCrmProvenance(
    response.provenance,
    options,
    "CRM mutation response.provenance"
  );
  return {
    schema_version: response.schemaVersion,
    operation: response.operation,
    complete: response.complete,
    state: response.complete ? "committed" : "failed",
    atomicity: response.atomicity,
    source: {
      source_handle: source.sourceHandle,
      source_label: source.displayName,
      status: source.status,
      capabilities: source.capabilities
    },
    receipt,
    error,
    observed_at: provenance.observed_at,
    provenance,
    cache_invalidation_required: response.complete,
    usage: usage(options.usage)
  };
}

function buildSyncTarget(target, index) {
  const label = `targets[${index}]`;
  object(target, label);
  const targetId = boundedNoEdgeWhitespace(target.targetId, `${label}.targetId`, 1, 100);
  const operation = text(target.operation, `${label}.operation`);
  if (!["create", "update"].includes(operation)) {
    throw new Error(`${label}.operation must be create or update`);
  }
  const allowedKeys = operation === "create"
    ? new Set(["targetId", "operation", "source", "changes", "idempotencyKey"])
    : new Set([
      "targetId", "operation", "source", "recordSource", "expectedVersion",
      "changes", "idempotencyKey"
    ]);
  const unknown = Object.keys(target).filter((key) => !allowedKeys.has(key));
  if (unknown.length > 0) throw new Error(`${label} contains unsupported field ${unknown[0]}`);
  const source = requireReadySource(target.source, operation, `${label}.source`);
  const common = {
    targetId,
    operation,
    changes: validateChanges(target.changes, `${label}.changes`),
    idempotencyKey: validateIdempotencyKey(target.idempotencyKey, `${label}.idempotencyKey`)
  };
  if (operation === "create") {
    return { ...common, sourceHandle: source.sourceHandle };
  }
  const recordSource = validateRecordSource(target.recordSource, `${label}.recordSource`);
  if (recordSource.sourceHandle !== source.sourceHandle) {
    throw new Error(`${label}.recordSource does not match its discovered source`);
  }
  const expectedVersion = boundedText(target.expectedVersion, `${label}.expectedVersion`, 1, 500);
  if (recordSource.version === null || expectedVersion !== recordSource.version) {
    throw new Error(`${label}.expectedVersion must equal the current server-returned record version`);
  }
  return {
    ...common,
    recordHandle: recordSource.recordHandle,
    expectedVersion
  };
}

export function buildCrmSyncPlan(input) {
  object(input, "input");
  const envelope = crmOperationEnvelope(input, "crm.sync.plan", "write", "POST", false);
  const applicationId = boundedNoEdgeWhitespace(input.applicationId, "applicationId", 8, 200);
  if (!Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > 50) {
    throw new Error("targets must contain 1 through 50 items");
  }
  const targets = input.targets.map(buildSyncTarget);
  if (new Set(targets.map((target) => target.targetId)).size !== targets.length) {
    throw new Error("targets must contain unique targetId values");
  }
  if (new Set(targets.map((target) => target.idempotencyKey)).size !== targets.length) {
    throw new Error("targets must contain unique idempotencyKey values");
  }
  const updateHandles = targets
    .filter((target) => target.operation === "update")
    .map((target) => target.recordHandle);
  if (new Set(updateHandles).size !== updateHandles.length) {
    throw new Error("update targets must contain unique recordHandle values");
  }
  const request = { applicationId, targets };
  const targetClosure = targets.map((target) => ({
    target_id: target.targetId,
    operation: target.operation,
    source_handle_digest: hash(
      target.operation === "create"
        ? target.sourceHandle
        : input.targets.find((candidate) => candidate.targetId === target.targetId).source.sourceHandle
    ).slice(0, 16)
  }));
  const material = {
    plan_version: "bos-crm-sync-request-plan/v1",
    ...envelope,
    request,
    target_closure: targetClosure,
    execution_ready: true
  };
  return { ...material, plan_id: `bos_crm_sync_plan_${hash(material).slice(0, 24)}` };
}

export function normalizeCrmSyncPlanResponse(response, options = {}) {
  object(response, "CRM sync plan response");
  forbidUnknownKeys(
    response,
    new Set([
      "schemaVersion", "contextId", "applicationId", "planHandle", "expiresAt",
      "atomicity", "targets", "provenance"
    ]),
    "CRM sync plan response"
  );
  if (response.schemaVersion !== CRM_SYNC_PLAN_SCHEMA_VERSION) {
    throw new Error(`CRM sync plan response.schemaVersion must be ${CRM_SYNC_PLAN_SCHEMA_VERSION}`);
  }
  if (text(response.contextId, "CRM sync plan response.contextId") !==
      text(options.expectedContextId, "options.expectedContextId")) {
    throw new Error("CRM sync plan response.contextId does not match the selected app context");
  }
  const applicationId = boundedNoEdgeWhitespace(
    response.applicationId,
    "CRM sync plan response.applicationId",
    8,
    200
  );
  if (applicationId !== boundedNoEdgeWhitespace(
    options.expectedApplicationId,
    "options.expectedApplicationId",
    8,
    200
  )) {
    throw new Error("CRM sync plan response.applicationId does not match the request");
  }
  const planHandle = validateSyncPlanHandle(
    response.planHandle,
    "CRM sync plan response.planHandle"
  );
  const expiresAt = instant(response.expiresAt, "CRM sync plan response.expiresAt").toISOString();
  if (response.atomicity !== "non_atomic_per_source") {
    throw new Error("CRM sync plan response.atomicity is invalid");
  }
  if (!Array.isArray(response.targets) || response.targets.length < 1 || response.targets.length > 50) {
    throw new Error("CRM sync plan response.targets must contain 1 through 50 items");
  }
  const targets = response.targets.map((target, index) => {
    const label = `CRM sync plan response.targets[${index}]`;
    object(target, label);
    forbidUnknownKeys(
      target,
      new Set(["targetId", "operation", "source", "status", "error"]),
      label
    );
    if (!["create", "update"].includes(target.operation)) {
      throw new Error(`${label}.operation is invalid`);
    }
    if (!["planned", "rejected"].includes(target.status)) {
      throw new Error(`${label}.status is invalid`);
    }
    const error = validateCrmError(target.error, `${label}.error`);
    if ((target.status === "rejected") !== (error !== null)) {
      throw new Error(`${label}.status and error are inconsistent`);
    }
    const source = validateCrmSource(target.source, `${label}.source`);
    return {
      target_id: boundedNoEdgeWhitespace(target.targetId, `${label}.targetId`, 1, 100),
      operation: target.operation,
      source: {
        source_handle_digest: hash(source.sourceHandle).slice(0, 16),
        source_label: source.displayName,
        status: source.status,
        capabilities: source.capabilities
      },
      status: target.status,
      error
    };
  });
  if (new Set(targets.map((target) => target.target_id)).size !== targets.length) {
    throw new Error("CRM sync plan response targets contain duplicate targetId values");
  }
  const expectedTargets = options.expectedTargets;
  const actualClosure = targets.map((target) => ({
    target_id: target.target_id,
    operation: target.operation,
    source_handle_digest: target.source.source_handle_digest
  }));
  const sortClosure = (items) => [...items].sort((left, right) =>
    left.target_id.localeCompare(right.target_id)
  );
  if (!Array.isArray(expectedTargets) ||
      JSON.stringify(sortClosure(expectedTargets)) !== JSON.stringify(sortClosure(actualClosure))) {
    throw new Error("CRM sync plan response targets do not match the requested target closure");
  }
  const provenance = validateCrmProvenance(
    response.provenance,
    options,
    "CRM sync plan response.provenance"
  );
  return {
    schema_version: response.schemaVersion,
    application_id: applicationId,
    plan_handle: planHandle,
    plan_handle_digest: hash(planHandle).slice(0, 16),
    expires_at: expiresAt,
    atomicity: response.atomicity,
    targets,
    provenance,
    binding: {
      context_id: text(options.expectedContextId, "options.expectedContextId"),
      authority_epoch: provenance.authority_epoch,
      discovery_epoch: text(options.expectedDiscoveryEpoch, "options.expectedDiscoveryEpoch"),
      service_id: text(options.expectedSourceService, "options.expectedSourceService"),
      service_version: text(options.expectedServiceVersion, "options.expectedServiceVersion"),
      contract_uri: credentialFreeHttps(
        options.expectedContractUri,
        "options.expectedContractUri"
      )
    }
  };
}

export function buildCrmSyncApplyPlan(input) {
  object(input, "input");
  const envelope = crmOperationEnvelope(input, "crm.sync.apply", "write", "POST");
  const serverPlan = object(input.serverPlan, "serverPlan");
  if (serverPlan.schema_version !== CRM_SYNC_PLAN_SCHEMA_VERSION) {
    throw new Error("serverPlan must be a normalized CRM synchronization plan");
  }
  const binding = object(serverPlan.binding, "serverPlan.binding");
  if (binding.context_id !== envelope.app.context_id ||
      binding.authority_epoch !== envelope.app.authority_epoch ||
      binding.discovery_epoch !== envelope.app.discovery_epoch ||
      binding.service_id !== envelope.service.serviceId ||
      binding.service_version !== envelope.service.version ||
      binding.contract_uri !== envelope.service.contractUri) {
    throw new Error("serverPlan is stale or outside the current discovered service authority");
  }
  const now = input.now ? new Date(input.now) : new Date();
  if (Number.isNaN(now.valueOf()) || instant(serverPlan.expires_at, "serverPlan.expires_at") <= now) {
    throw new Error("serverPlan has expired and must be refreshed");
  }
  const plannedTargetIds = serverPlan.targets
    .filter((target) => target.status === "planned")
    .map((target) => target.target_id);
  const targetClosure = serverPlan.targets
    .filter((target) => target.status === "planned")
    .map((target) => ({
      target_id: target.target_id,
      operation: target.operation,
      source_handle_digest: target.source.source_handle_digest
    }));
  if (plannedTargetIds.length === 0) {
    throw new Error("serverPlan contains no executable targets");
  }
  const request = {
    applicationId: boundedNoEdgeWhitespace(
      serverPlan.application_id,
      "serverPlan.application_id",
      8,
      200
    ),
    planHandle: validateSyncPlanHandle(serverPlan.plan_handle, "serverPlan.plan_handle")
  };
  const planBase = {
    plan_version: "bos-crm-sync-apply-plan/v1",
    ...envelope,
    request,
    target_ids: plannedTargetIds,
    target_closure: targetClosure,
    atomicity: "non_atomic_per_source"
  };
  const confirmationId = operationConfirmationId(planBase);
  const confirmed = input.confirmationId === confirmationId;
  const material = {
    ...planBase,
    confirmation: {
      required: true,
      confirmation_id: confirmationId,
      confirmed
    },
    execution_ready: confirmed
  };
  return { ...material, plan_id: `bos_crm_sync_apply_${hash(material).slice(0, 24)}` };
}

export function explainCrmSyncApplyPlan(plan) {
  object(plan, "plan");
  return {
    plan_version: plan.plan_version,
    plan_id: text(plan.plan_id, "plan.plan_id"),
    app: {
      app_code: plan.app.app_code,
      context_digest: hash(plan.app.context_id).slice(0, 16),
      authority_epoch: plan.app.authority_epoch,
      contract_version: plan.app.contract_version,
      discovery_epoch: plan.app.discovery_epoch
    },
    service: {
      service_id: plan.service.serviceId,
      version: plan.service.version,
      contract_uri_digest: hash(plan.service.contractUri).slice(0, 16)
    },
    invocation: explainInvocation(plan.invocation),
    application_id_digest: hash(plan.request.applicationId).slice(0, 16),
    plan_handle_digest: hash(plan.request.planHandle).slice(0, 16),
    target_count: plan.target_ids.length,
    confirmation: { ...plan.confirmation },
    execution_ready: plan.execution_ready,
    atomicity: plan.atomicity,
    executes_data_call: false
  };
}

export function normalizeCrmSyncApplyResponse(response, options = {}) {
  object(response, "CRM sync apply response");
  forbidUnknownKeys(
    response,
    new Set([
      "schemaVersion", "contextId", "applicationId", "complete", "atomicity",
      "consistency", "receipts", "provenance"
    ]),
    "CRM sync apply response"
  );
  if (response.schemaVersion !== CRM_SYNC_APPLY_SCHEMA_VERSION) {
    throw new Error(`CRM sync apply response.schemaVersion must be ${CRM_SYNC_APPLY_SCHEMA_VERSION}`);
  }
  if (text(response.contextId, "CRM sync apply response.contextId") !==
      text(options.expectedContextId, "options.expectedContextId")) {
    throw new Error("CRM sync apply response.contextId does not match the selected app context");
  }
  const applicationId = boundedNoEdgeWhitespace(
    response.applicationId,
    "CRM sync apply response.applicationId",
    8,
    200
  );
  if (applicationId !== boundedNoEdgeWhitespace(
    options.expectedApplicationId,
    "options.expectedApplicationId",
    8,
    200
  )) {
    throw new Error("CRM sync apply response.applicationId does not match the confirmed plan");
  }
  if (typeof response.complete !== "boolean") {
    throw new Error("CRM sync apply response.complete must be a boolean");
  }
  if (response.atomicity !== "non_atomic_per_source") {
    throw new Error("CRM sync apply response.atomicity is invalid");
  }
  if (!["converged", "partial_failure", "reconciliation_required"].includes(response.consistency)) {
    throw new Error("CRM sync apply response.consistency is invalid");
  }
  if (!Array.isArray(response.receipts) || response.receipts.length < 1 ||
      response.receipts.length > 50) {
    throw new Error("CRM sync apply response.receipts must contain 1 through 50 items");
  }
  const receipts = response.receipts.map((receipt, index) => {
    const label = `CRM sync apply response.receipts[${index}]`;
    object(receipt, label);
    forbidUnknownKeys(
      receipt,
      new Set([
        "targetId", "operation", "source", "status", "recordHandle", "version",
        "observedAt", "error", "reconciliationAction"
      ]),
      label
    );
    if (!["create", "update"].includes(receipt.operation)) {
      throw new Error(`${label}.operation is invalid`);
    }
    if (!["committed", "failed", "uncertain"].includes(receipt.status)) {
      throw new Error(`${label}.status is invalid`);
    }
    if (!["none", "get_record", "manual_verification_required"].includes(receipt.reconciliationAction)) {
      throw new Error(`${label}.reconciliationAction is invalid`);
    }
    const error = validateCrmError(receipt.error, `${label}.error`);
    if ((receipt.status === "committed") !== (error === null)) {
      throw new Error(`${label}.status and error are inconsistent`);
    }
    if ((receipt.status === "uncertain") !== (receipt.reconciliationAction !== "none")) {
      throw new Error(`${label}.status and reconciliationAction are inconsistent`);
    }
    const source = validateCrmSource(receipt.source, `${label}.source`);
    return {
      target_id: boundedNoEdgeWhitespace(receipt.targetId, `${label}.targetId`, 1, 100),
      operation: receipt.operation,
      source: {
        source_handle_digest: hash(source.sourceHandle).slice(0, 16),
        source_label: source.displayName
      },
      status: receipt.status,
      record_handle: validateRecordHandle(receipt.recordHandle, `${label}.recordHandle`, true),
      version: optionalBoundedText(receipt.version, `${label}.version`, 500),
      observed_at: instant(receipt.observedAt, `${label}.observedAt`).toISOString(),
      error,
      reconciliation_action: receipt.reconciliationAction
    };
  });
  if (new Set(receipts.map((receipt) => receipt.target_id)).size !== receipts.length) {
    throw new Error("CRM sync apply response receipts contain duplicate targetId values");
  }
  const receiptClosure = receipts.map((receipt) => ({
    target_id: receipt.target_id,
    operation: receipt.operation,
    source_handle_digest: receipt.source.source_handle_digest
  }));
  const sortClosure = (items) => [...items].sort((left, right) =>
    left.target_id.localeCompare(right.target_id)
  );
  if (!Array.isArray(options.expectedTargets) ||
      JSON.stringify(sortClosure(options.expectedTargets)) !==
      JSON.stringify(sortClosure(receiptClosure))) {
    throw new Error("CRM sync apply response receipts do not match the confirmed target closure");
  }
  const allCommitted = receipts.length > 0 && receipts.every((receipt) => receipt.status === "committed");
  const anyUncertain = receipts.some((receipt) => receipt.status === "uncertain");
  const expectedConsistency = allCommitted
    ? "converged"
    : anyUncertain ? "reconciliation_required" : "partial_failure";
  if (response.complete !== allCommitted || response.consistency !== expectedConsistency) {
    throw new Error("CRM sync apply response completion and consistency are invalid for its receipts");
  }
  const provenance = validateCrmProvenance(
    response.provenance,
    options,
    "CRM sync apply response.provenance"
  );
  return {
    schema_version: response.schemaVersion,
    application_id: applicationId,
    complete: response.complete,
    atomicity: response.atomicity,
    consistency: response.consistency,
    receipts,
    provenance,
    cache_invalidation_required: receipts.some((receipt) => receipt.status === "committed"),
    usage: usage(options.usage)
  };
}

export function buildDatasetCacheDescriptor(plan) {
  object(plan, "plan");
  if (!Number.isInteger(plan.app?.authority_epoch) || plan.app.authority_epoch < 0) {
    throw new Error("plan.app.authority_epoch must be a non-negative integer");
  }
  const material = {
    product: text(plan.product, "plan.product"),
    app_code: text(plan.app?.app_code, "plan.app.app_code"),
    app_context: text(plan.app?.context_id, "plan.app.context_id"),
    app_authority_epoch: plan.app.authority_epoch,
    app_contract_version: text(plan.app?.contract_version, "plan.app.contract_version"),
    app_discovery_epoch: text(plan.app?.discovery_epoch, "plan.app.discovery_epoch"),
    service_id: text(plan.service?.serviceId, "plan.service.serviceId"),
    service_version: text(plan.service?.version, "plan.service.version"),
    contract_uri: text(plan.service?.contractUri, "plan.service.contractUri"),
    operation_id: text(plan.invocation?.operationId, "plan.invocation.operationId"),
    dataset: text(plan.dataset, "plan.dataset"),
    source_selection: object(plan.source_selection, "plan.source_selection"),
    request: object(plan.request, "plan.request")
  };
  return {
    cache_key: `bos_query_${hash(material).slice(0, 40)}`,
    dataset: plan.dataset,
    query_digest: hash(plan.request),
    source_scope: plan.source_selection.scope,
    freshness_policy: plan.cache_policy
  };
}

function aggregateUsage(sourceResults) {
  if (sourceResults.length === 0) return { scope: "unavailable" };
  const values = sourceResults.map((item) => usage(item.usage));
  if (values.some((item) => item.scope === "unavailable" ||
      !Number.isInteger(item.input_tokens) || !Number.isInteger(item.output_tokens))) {
    return { scope: "unavailable" };
  }
  const inputTokens = values.reduce((total, item) => total + item.input_tokens, 0);
  const outputTokens = values.reduce((total, item) => total + item.output_tokens, 0);
  return {
    scope: values.every((item) => item.scope === "host_measured")
      ? "host_measured" : "client_visible_estimate",
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens
  };
}

export function aggregateQueryResult(input) {
  object(input, "aggregate input");
  const plan = object(input.plan, "plan");
  if (plan.invocation?.count !== 1 || plan.invocation?.owner !== "app_service") {
    throw new Error("plan must contain exactly one app-service invocation");
  }
  if (!Array.isArray(input.source_results)) {
    throw new Error("source_results must be an array");
  }
  if (!Array.isArray(input.records)) {
    throw new Error("records must be the server-returned federated record array");
  }
  const failed = input.source_results.filter((item) => item.status !== "completed");
  const mode = plan.aggregation?.mode ?? "federated";
  return {
    result_version: RESULT_VERSION,
    plan_id: text(plan.plan_id, "plan.plan_id"),
    invocation_count: 1,
    complete: failed.length === 0,
    mode,
    sources: input.source_results,
    record_count: input.records.length,
    failed_source_count: failed.length,
    records: input.records,
    merged_view: mode === "merged_view"
      ? { resolution_owner: "server", records: input.records }
      : null,
    execution_ledger: Array.isArray(input.execution_ledger) ? input.execution_ledger : [],
    usage: usage(input.usage ?? aggregateUsage(input.source_results))
  };
}

async function runCli() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const operation = text(input.operation, "operation");
  let result;
  if (operation === "plan") result = buildQueryPlan(input);
  else if (operation === "explain") result = explainQueryPlan(buildQueryPlan(input), input.server_plan);
  else if (operation === "crm_record_plan") result = buildCrmRecordOperationPlan(input);
  else if (operation === "crm_record_explain") {
    result = explainCrmOperationPlan(buildCrmRecordOperationPlan(input));
  }
  else if (operation === "crm_get_response") {
    result = normalizeCrmGetResponse(input.response, input.options);
  }
  else if (operation === "crm_sources_response") {
    result = normalizeCrmSourceListResponse(input.response, input.options);
  }
  else if (operation === "crm_mutation_response") {
    result = normalizeCrmMutationResponse(input.response, input.options);
  }
  else if (operation === "crm_sync_plan") result = buildCrmSyncPlan(input);
  else if (operation === "crm_sync_plan_response") {
    result = normalizeCrmSyncPlanResponse(input.response, input.options);
  }
  else if (operation === "crm_sync_apply_plan") result = buildCrmSyncApplyPlan(input);
  else if (operation === "crm_sync_apply_explain") {
    result = explainCrmSyncApplyPlan(buildCrmSyncApplyPlan(input));
  }
  else if (operation === "crm_sync_apply_response") {
    result = normalizeCrmSyncApplyResponse(input.response, input.options);
  }
  else if (operation === "event") result = executionEvent(input.event);
  else if (operation === "source_result") result = normalizeSourceResult(input.result, input.options);
  else if (operation === "search_response") result = normalizeSearchResponse(input.response, input.options);
  else if (operation === "cache_key") result = buildDatasetCacheDescriptor(buildQueryPlan(input));
  else if (operation === "aggregate") result = aggregateQueryResult(input);
  else throw new Error("operation is not supported by the federated query helper");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : null;
if (invoked && fileURLToPath(import.meta.url) === invoked) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
