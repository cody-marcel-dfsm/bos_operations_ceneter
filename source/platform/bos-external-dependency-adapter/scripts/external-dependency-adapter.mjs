import Ajv2020 from "./vendor/ajv2020.bundle.mjs";
import discoveredOperationRequestSchema from "./discovered-operation-request.schema.mjs";
import {validateSafeBosExecutionUri} from "./safe-execution-uri.mjs";

export const authenticationConditionCodes = Object.freeze([
  "MISSING_GRANT",
  "EXPIRED_TOKEN",
  "REVOKED_GRANT",
  "INVALID_CLIENT",
  "INVALID_GRANT",
  "RESOURCE_MISMATCH",
  "REAUTHENTICATION_REQUIRED",
  "AUTHORIZATION_REQUIRED",
  "MCP_WWW_AUTHENTICATE",
  "MCP_SESSION_CLOSED",
  "PROVIDER_AUTHORIZATION_REQUIRED"
]);

const conditionCodeSet = new Set(authenticationConditionCodes);
const publicErrorFields = ["code", "message", "retryable", "correlation_id", "details"];
const conditionCategories = new Set(["authentication", "mcp_session"]);
const conditionSources = new Set(["protected_resource", "bos_platform", "client_host"]);
const readinessStatuses = new Set(["READY", "HOST_ACTION_REQUIRED", "NOT_READY"]);
const returnedActionVerbs = new Set(["start", "complete", "step", "failed"]);
const actionFields = new Set(["verb", "method", "href", "payload_schema"]);
const contextFields = new Set([
  "context_handle",
  "organization_name",
  "application_name",
  "installation_name",
  "role_label",
  "is_default"
]);
const contextHandlePattern = /^bos_ctx_v2_[a-f0-9]{64}$/u;
const requiredContextHeader = "X-BOS-Context-Handle";
const safeResponseHeaders = new Set(["content-type", "retry-after", "x-correlation-id"]);
const sensitiveKeys = new Set([
  "access_token", "refresh_token", "bearer_token", "authorization", "authorization_header",
  "context_handle", "opaque_context", "authority_context", "grant_id", "organization_id",
  "application_id", "installation_id", "installed_app_id", "role_id", "resource_group_id",
  "provider_error"
]);
const publicErrorPrivateKeys = new Set([
  ...sensitiveKeys,
  "journey_id", "execution_id", "graph_id", "snapshot_id", "compiled_snapshot",
  "compiled_fingerprint", "digest", "revision", "state_version", "node_occurrence",
  "occurrence", "idempotency_key", "client_idempotency_key", "retry_count", "retry_state",
  "action_id", "artifact_ref", "object_name", "provider", "provider_id",
  "provider_account_id", "provider_message", "provider_payload",
  "provider_response", "database_id", "sql", "stack_trace", "attendee", "attendees",
  "email", "emails", "email_address", "email_addresses", "recipient", "recipients",
  "oauth_token", "api_key", "credential_id", "secret", "token", "context_handle",
  "context_id", "opaque_context", "principal_context", "authority_context", "grant_id",
  "session_id", "connection_id", "internal_id", "organization_id", "org_id", "tenant_id",
  "membership_id", "application_id", "app_id", "app_code", "installation_id",
  "installed_app_id", "plugin_id", "role_id", "actor_role_id", "user_id", "actor_user_id",
  "resource_group_id", "actor_id", "delegated_role_id", "client_secret", "private_key",
  "cookie", "credential", "credentials", "password", "passwords", "passphrase",
  "passphrases", "secret", "secrets", "token", "tokens", "handler", "handlers",
  "service_account", "service_account_key", "approval_id", "client_id",
  "request_fingerprint", "retry_id", "source_id", "authority", "context", "grant",
  "oauth", "principal", "tenant"
]);
const publicErrorPrivateTokens = new Set([
  "accesstoken", "apikey", "authorization", "authority", "credential", "databaseid",
  "actionid", "appid", "applicationid", "approvalid", "clientid", "context",
  "executionid", "grant", "idempotencykey", "installationid", "internalid",
  "journeyid", "oauth", "organizationid", "principal", "providererror", "providerid",
  "providerpayload", "refreshtoken", "requestfingerprint", "retrycount", "retryid",
  "roleid", "email", "emailaddress", "graphid", "handler", "orgid", "password",
  "pluginid", "providermessage", "sql", "stacktrace", "secret", "sessionid",
  "sourceid", "tenant", "token", "userid"
]);
const discoveredOperationValidator = new Ajv2020({allErrors: true, strict: false})
  .compile(discoveredOperationRequestSchema);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requireExactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unsupported field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label}.${key} is required`);
  }
}

function requireSafeString(value, label, maximum = 512) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum ||
      /[\r\n\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label} must be a bounded printable string`);
  }
  return value;
}

function exactHttpsResource(value, label = "protected_resource") {
  requireSafeString(value, label, 2048);
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError(`${label} must be an exact HTTPS resource`); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.href !== value) {
    throw new TypeError(`${label} must be an exact HTTPS resource without query or fragment`);
  }
  return value;
}

function requireSafeExecutionUri(value, label) {
  requireSafeString(value, label, 4096);
  return validateSafeBosExecutionUri(value, label);
}

function normalizeKey(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function rejectPrivateTransportData(value, path = "value") {
  if (typeof value === "string" && (contextHandlePattern.test(value) || /^Bearer\s+/iu.test(value))) {
    throw new TypeError(`${path} exposes private BOS transport data`);
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPrivateTransportData(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (sensitiveKeys.has(normalizeKey(key))) {
      throw new TypeError(`${path}.${key} exposes private BOS transport data`);
    }
    rejectPrivateTransportData(nested, `${path}.${key}`);
  }
}

function rejectPrivatePublicErrorDetail(value, path) {
  if (typeof value === "string" && (contextHandlePattern.test(value) || /^Bearer\s+/iu.test(value))) {
    throw new TypeError(`${path} exposes private BOS transport data`);
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPrivatePublicErrorDetail(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    const keyTokens = normalizedKey.split("_").filter(Boolean);
    const compactKey = keyTokens.join("");
    if (publicErrorPrivateKeys.has(normalizedKey) ||
        publicErrorPrivateTokens.has(compactKey) ||
        keyTokens.some((token) => publicErrorPrivateTokens.has(token))) {
      throw new TypeError(`${path}.${key} exposes private BOS transport data`);
    }
    rejectPrivatePublicErrorDetail(nested, `${path}.${key}`);
  }
}

function structuredSnapshot(value, label) {
  try {
    return structuredClone(value);
  } catch {
    throw new TypeError(`${label} must be structured-cloneable`);
  }
}

function validateCondition(value, label = "condition") {
  requireObject(value, label);
  requireExactKeys(value, ["category", "code", "source"], [], label);
  if (!conditionCategories.has(value.category)) throw new TypeError(`${label}.category is invalid`);
  if (typeof value.code !== "string" || !/^[A-Z][A-Z0-9_]{1,127}$/u.test(value.code)) {
    throw new TypeError(`${label}.code is invalid`);
  }
  if (!conditionSources.has(value.source)) throw new TypeError(`${label}.source is invalid`);
  return structuredClone(value);
}

function normalizeCondition(value) {
  if (typeof value !== "string") return validateCondition(value);
  if (!conditionCodeSet.has(value)) {
    throw new TypeError("An unknown authentication condition requires a structured condition");
  }
  return {
    category: value === "MCP_SESSION_CLOSED" ? "mcp_session" : "authentication",
    code: value,
    source: "protected_resource"
  };
}

export function validateAuthenticationHandoffMessage(value, { messageType } = {}) {
  requireObject(value, "authentication handoff message");
  if (!new Set(["request", "result"]).has(value.message_type)) {
    throw new TypeError("authentication handoff message_type is invalid");
  }
  if (messageType !== undefined && value.message_type !== messageType) {
    throw new TypeError(`authentication handoff message_type must be ${messageType}`);
  }
  if (value.schema_version !== "bos.authentication-handoff/v1") {
    throw new TypeError("authentication handoff schema_version is invalid");
  }
  const optional = value.message_type === "request"
    ? ["host_correlation"]
    : ["condition", "host_correlation"];
  const required = value.message_type === "request"
    ? ["schema_version", "message_type", "protected_resource", "condition"]
    : ["schema_version", "message_type", "protected_resource", "status"];
  requireExactKeys(value, required, optional, "authentication handoff message");
  exactHttpsResource(value.protected_resource);
  if (value.message_type === "request" || value.condition !== undefined) validateCondition(value.condition);
  if (value.message_type === "result" && !readinessStatuses.has(value.status)) {
    throw new TypeError("authentication handoff status is invalid");
  }
  if (value.host_correlation !== undefined) {
    requireSafeString(value.host_correlation, "host_correlation");
  }
  rejectPrivateTransportData(value, "authentication handoff message");
  return structuredClone(value);
}

export function buildAuthenticationHandoffRequest({
  resource,
  condition,
  host_correlation
}) {
  const request = {
    schema_version: "bos.authentication-handoff/v1",
    message_type: "request",
    protected_resource: exactHttpsResource(resource),
    condition: normalizeCondition(condition),
    ...(host_correlation === undefined ? {} : { host_correlation })
  };
  return validateAuthenticationHandoffMessage(request, { messageType: "request" });
}

function validateAction(value, { state = false } = {}) {
  requireObject(value, "returned action");
  requireExactKeys(value, [...actionFields], [], "returned action");
  const verbs = state ? new Set(["state"]) : returnedActionVerbs;
  if (!verbs.has(value.verb)) throw new TypeError("returned action verb is invalid");
  const method = value.verb === "state" ? "GET" : "POST";
  if (value.method !== method) throw new TypeError(`returned ${value.verb} action method must be ${method}`);
  requireSafeExecutionUri(value.href, "returned action href");
  if (!(value.payload_schema === null ||
      (value.payload_schema && typeof value.payload_schema === "object" && !Array.isArray(value.payload_schema)))) {
    throw new TypeError("returned action payload_schema must be an object or null");
  }
  if (["start", "step", "state"].includes(value.verb) && value.payload_schema !== null) {
    throw new TypeError(`returned ${value.verb} action must be bodyless`);
  }
  rejectPrivateTransportData(value, "returned action");
  return structuredClone(value);
}

function validatePayload(payload, schema) {
  const snapshot = structuredSnapshot(payload, "returned action payload");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(snapshot)) throw new TypeError("returned action payload does not match payload_schema");
  rejectPrivateTransportData(snapshot, "returned action payload");
  return snapshot;
}

function validateDiscoveredOperation(value, payloadSupplied, payload) {
  const request = structuredSnapshot(
    {contact: value, ...(payloadSupplied ? {payload} : {})},
    "discovered operation request"
  );
  if (!discoveredOperationValidator(request)) {
    throw new TypeError("discovered operation request does not match the immutable public schema");
  }
  requireSafeExecutionUri(
    request.contact.execution.uri,
    "discovered operation execution URI"
  );
  rejectPrivateTransportData(request.contact.execution, "discovered operation.execution");
  return request;
}

function validateFreshContext(value) {
  requireObject(value, "current BOS context descriptor");
  if (value.contract_version === "bos-identity-mcp/v1") {
    requireExactKeys(value, ["contract_version"], [], "current BOS context descriptor");
    return null;
  }
  if (value.contract_version !== "bos-identity-mcp/v2") {
    throw new TypeError("current BOS context contract_version is unsupported");
  }
  requireExactKeys(value, ["contract_version", "context"], [], "current BOS context descriptor");
  requireObject(value.context, "current BOS context");
  requireExactKeys(value.context, [...contextFields], [], "current BOS context");
  if (!contextHandlePattern.test(value.context.context_handle)) {
    throw new TypeError("current BOS context handle is invalid");
  }
  for (const key of ["organization_name", "application_name", "installation_name", "role_label"]) {
    requireSafeString(value.context[key], `current BOS context.${key}`, 200);
  }
  if (typeof value.context.is_default !== "boolean") throw new TypeError("current BOS context.is_default is invalid");
  return value.context.context_handle;
}

function validateExecutionContextHeader(value) {
  if (value !== requiredContextHeader) {
    throw new TypeError(`discovered execution context header must be ${requiredContextHeader}`);
  }
  return value;
}

function requirePublicErrorMessage(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("BOS public error.message must be a nonempty string");
  }
  let length = 0;
  for (const ignored of value) {
    void ignored;
    length += 1;
    if (length > 2048) {
      throw new TypeError("BOS public error.message must contain at most 2048 characters");
    }
  }
  return value;
}

function validatePublicError(value) {
  requireObject(value, "BOS public error");
  requireExactKeys(value, publicErrorFields, [], "BOS public error");
  if (typeof value.code !== "string" || !/^[a-z][a-z0-9_]{0,127}$/u.test(value.code)) {
    throw new TypeError("BOS public error.code is invalid");
  }
  requirePublicErrorMessage(value.message);
  if (typeof value.retryable !== "boolean") throw new TypeError("BOS public error.retryable is invalid");
  requireSafeString(value.correlation_id, "BOS public error.correlation_id", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.correlation_id)) {
    throw new TypeError("BOS public error.correlation_id is invalid");
  }
  if (!Array.isArray(value.details)) throw new TypeError("BOS public error.details must be an array");
  value.details.forEach((detail, index) => {
    requireObject(detail, `BOS public error.details[${index}]`);
    rejectPrivatePublicErrorDetail(detail, `BOS public error.details[${index}]`);
  });
  return value;
}

function canonicalPublicErrorResponse(value) {
  const error = value?.body?.error;
  if (error === undefined || error === null) return null;
  validatePublicError(error);
  return {
    error,
    response: publicResponse(value)
  };
}

function headerValue(headers, target) {
  if (!headers || typeof headers !== "object") return undefined;
  return Object.entries(headers).find(([key]) => key.toLowerCase() === target)?.[1];
}

function authenticationCondition(value) {
  const status = Number(value?.status ?? value?.details?.status);
  const code = String(value?.body?.error?.code ?? value?.code ?? "").toUpperCase();
  if (conditionCodeSet.has(code)) return code;
  if (status === 401 && headerValue(value?.headers, "www-authenticate")) return "MCP_WWW_AUTHENTICATE";
  if (status === 401) return "AUTHORIZATION_REQUIRED";
  return null;
}

function validateErrorMember(value, path, canonicalErrors) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Object.hasOwn(value, "error") || value.error === null) return;
  validatePublicError(value.error);
  canonicalErrors.add(value.error);
}

function validateReadbackAndReceiptErrors(value, path, canonicalErrors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of ["readback", "receipt"]) {
    const nested = value[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      validateErrorMember(nested, `${path}.${key}`, canonicalErrors);
    }
  }
}

function validateRecordErrors(value, path, canonicalErrors) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Array.isArray(value.records)) return;
  value.records.forEach((record, index) => {
    const recordPath = `${path}.records[${index}]`;
    validateErrorMember(record, recordPath, canonicalErrors);
    validateReadbackAndReceiptErrors(record, recordPath, canonicalErrors);
  });
}

function validateSanctionedResponseErrors(body) {
  const canonicalErrors = new WeakSet();
  if (!body || typeof body !== "object" || Array.isArray(body)) return canonicalErrors;

  validateErrorMember(body, "BOS transport response.body", canonicalErrors);
  validateRecordErrors(body, "BOS transport response.body", canonicalErrors);

  if (Array.isArray(body.source_results)) {
    body.source_results.forEach((sourceResult, index) => {
      const path = `BOS transport response.body.source_results[${index}]`;
      validateErrorMember(sourceResult, path, canonicalErrors);
      validateRecordErrors(sourceResult, path, canonicalErrors);
    });
  }

  if (Array.isArray(body.outcomes)) {
    body.outcomes.forEach((outcome, index) => {
      const path = `BOS transport response.body.outcomes[${index}]`;
      validateErrorMember(outcome, path, canonicalErrors);
      validateReadbackAndReceiptErrors(outcome, path, canonicalErrors);
      validateRecordErrors(outcome, path, canonicalErrors);
    });
  }
  return canonicalErrors;
}

function rejectPublicResponseData(
  value,
  path = "BOS transport response.body",
  canonicalErrors = new WeakSet()
) {
  if (typeof value === "string" &&
      (contextHandlePattern.test(value) || /^Bearer\s+/iu.test(value))) {
    throw new TypeError(`${path} exposes private BOS transport data`);
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      rejectPublicResponseData(entry, `${path}[${index}]`, canonicalErrors));
    return;
  }

  const entries = Object.entries(value);
  for (const [key] of entries) {
    if (sensitiveKeys.has(normalizeKey(key))) {
      throw new TypeError(`${path}.${key} exposes private BOS transport data`);
    }
  }

  if (canonicalErrors.has(value)) {
    for (const [key, nested] of entries) {
      if (key !== "message") {
        rejectPublicResponseData(nested, `${path}.${key}`, canonicalErrors);
      }
    }
    return;
  }

  for (const [key, nested] of entries) {
    rejectPublicResponseData(nested, `${path}.${key}`, canonicalErrors);
  }
}

function publicResponse(value) {
  requireObject(value, "BOS transport response");
  if (!Number.isInteger(value.status) || value.status < 100 || value.status > 599) {
    throw new TypeError("BOS transport response.status is invalid");
  }
  const canonicalErrors = validateSanctionedResponseErrors(value.body);
  rejectPublicResponseData(value.body, "BOS transport response.body", canonicalErrors);
  const headers = {};
  if (value.headers && typeof value.headers === "object" && !Array.isArray(value.headers)) {
    for (const [name, header] of Object.entries(value.headers)) {
      const normalized = name.toLowerCase();
      if (safeResponseHeaders.has(normalized) && typeof header === "string") headers[normalized] = header;
    }
  }
  return {
    status: value.status,
    body: structuredClone(value.body),
    ...(Object.keys(headers).length ? { headers } : {})
  };
}

export class BosDependencyAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = "BosDependencyAdapterError";
  }
}

class BosTransportThrown extends Error {
  constructor(cause) {
    super("The BOS host transport threw", {cause});
    this.name = "BosTransportThrown";
  }
}

export function createBosExternalDependencyAdapter({
  hostTransport,
  contextProvider
}) {
  for (const method of ["request", "recoverAuthentication", "getProtectedResource"]) {
    if (typeof hostTransport?.[method] !== "function") throw new TypeError(`hostTransport.${method} is required`);
  }
  if (typeof contextProvider?.getCurrentContext !== "function") {
    throw new TypeError("contextProvider.getCurrentContext is required");
  }
  if (typeof contextProvider?.getExecutionContextHeader !== "function") {
    throw new TypeError("contextProvider.getExecutionContextHeader is required");
  }
  const handoffInput = async ({ resource, condition, host_correlation }) => {
    const selected = resource ?? await hostTransport.getProtectedResource();
    return { resource: selected, condition, host_correlation };
  };

  const validateMatchingResult = (value, request) => {
    const result = validateAuthenticationHandoffMessage(value, { messageType: "result" });
    if (result.protected_resource !== request.protected_resource ||
        (request.host_correlation !== undefined &&
          result.host_correlation !== request.host_correlation)) {
      throw new BosDependencyAdapterError("BOS authentication handoff result does not match its request");
    }
    return result;
  };

  const recoverAuthentication = async (input) => {
    const request = buildAuthenticationHandoffRequest(await handoffInput(input));
    return validateMatchingResult(await hostTransport.recoverAuthentication(request), request);
  };

  const waitForAuthentication = async (input) => {
    if (typeof hostTransport.waitForAuthentication !== "function") {
      throw new BosDependencyAdapterError("BOS authentication recovery remains active");
    }
    const request = buildAuthenticationHandoffRequest(await handoffInput(input));
    return validateMatchingResult(await hostTransport.waitForAuthentication(request), request);
  };

  const completeAuthenticationRecovery = async ({resource, condition}) => {
    let readiness = await recoverAuthentication({resource, condition});
    if (readiness.status !== "READY") {
      readiness = await waitForAuthentication({
        resource: readiness.protected_resource,
        condition: readiness.condition ?? condition,
        host_correlation: readiness.host_correlation
      });
    }
    if (readiness.status !== "READY") {
      throw new BosDependencyAdapterError("BOS authentication recovery remains active");
    }
  };

  const buildRequest = async (action, payloadSupplied, payload, state) => {
    const current = validateAction(action, { state });
    if (current.payload_schema === null && payloadSupplied) throw new TypeError("bodyless returned action cannot receive a payload");
    if (current.payload_schema !== null && !payloadSupplied) throw new TypeError("returned action payload is required");
    const currentPayload = current.payload_schema === null
      ? undefined
      : validatePayload(payload, current.payload_schema);
    let contextHandle;
    let contextHeader;
    try {
      contextHandle = validateFreshContext(await contextProvider.getCurrentContext());
      contextHeader = contextHandle === null
        ? null
        : validateExecutionContextHeader(await contextProvider.getExecutionContextHeader());
    } catch {
      throw new BosDependencyAdapterError("The current BOS execution context is unavailable");
    }
    return {
      method: current.method,
      href: current.href,
      headers: {
        ...(current.payload_schema === null ? {} : { "content-type": "application/json" }),
        ...(contextHandle === null ? {} : { [contextHeader]: contextHandle })
      },
      body: current.payload_schema === null ? undefined : JSON.stringify(currentPayload)
    };
  };

  const buildDiscoveredRequest = async (contact, payloadSupplied, payload) => {
    const snapshot = validateDiscoveredOperation(contact, payloadSupplied, payload);
    const current = snapshot.contact;
    const bodyless = current.execution.method === "GET";
    const currentPayload = bodyless
      ? undefined
      : validatePayload(snapshot.payload, current.input_schema);
    let contextHandle;
    let contextHeader;
    try {
      contextHandle = validateFreshContext(await contextProvider.getCurrentContext());
      contextHeader = contextHandle === null
        ? null
        : validateExecutionContextHeader(await contextProvider.getExecutionContextHeader());
    } catch {
      throw new BosDependencyAdapterError("The current BOS execution context is unavailable");
    }
    return {
      method: current.execution.method,
      href: current.execution.uri,
      headers: {
        ...(bodyless ? {} : { "content-type": "application/json" }),
        ...(contextHandle === null ? {} : { [contextHeader]: contextHandle })
      },
      body: bodyless ? undefined : JSON.stringify(currentPayload)
    };
  };

  const requestOnce = async (action, payloadSupplied, payload, state) => {
    const request = await buildRequest(action, payloadSupplied, payload, state);
    try {
      return await hostTransport.request(request);
    } catch (cause) {
      throw new BosTransportThrown(cause);
    }
  };

  const interpretTransport = (value, {thrown = false} = {}) => {
    const condition = authenticationCondition(value);
    if (condition) return {condition, resource: value?.resource};
    try {
      const canonicalFailure = canonicalPublicErrorResponse(value);
      return {
        condition: null,
        resource: value?.resource,
        response: canonicalFailure?.response ?? publicResponse(value)
      };
    } catch (error) {
      if (thrown) throw new BosDependencyAdapterError("The BOS dependency transport failed");
      throw error;
    }
  };

  const invoke = async (action, payloadSupplied, payload, state) => {
    const pinnedAction = structuredSnapshot(action, "returned action");
    const pinnedPayload = payloadSupplied
      ? structuredSnapshot(payload, "returned action payload")
      : payload;
    const attempt = async () => {
      try {
        return interpretTransport(await requestOnce(
          pinnedAction,
          payloadSupplied,
          pinnedPayload,
          state
        ));
      } catch (error) {
        if (!(error instanceof BosTransportThrown)) throw error;
        return interpretTransport(error.cause, {thrown: true});
      }
    };

    let outcome = await attempt();
    if (!outcome.condition) return outcome.response;
    await completeAuthenticationRecovery({
      resource: outcome.resource,
      condition: outcome.condition
    });

    outcome = await attempt();
    if (outcome.condition) {
      throw new BosDependencyAdapterError("BOS authentication recovery did not restore the operation");
    }
    return outcome.response;
  };

  const invokeDiscovered = async (contact, payloadSupplied, payload) => {
    const pinnedContact = structuredSnapshot(contact, "discovered operation contact");
    const pinnedPayload = payloadSupplied
      ? structuredSnapshot(payload, "discovered operation payload")
      : payload;
    const requestOnceDiscovered = async () => {
      const request = await buildDiscoveredRequest(pinnedContact, payloadSupplied, pinnedPayload);
      try {
        return await hostTransport.request(request);
      } catch (cause) {
        throw new BosTransportThrown(cause);
      }
    };
    const attempt = async () => {
      try {
        return interpretTransport(await requestOnceDiscovered());
      } catch (error) {
        if (!(error instanceof BosTransportThrown)) throw error;
        return interpretTransport(error.cause, {thrown: true});
      }
    };

    let outcome = await attempt();
    if (!outcome.condition) return outcome.response;
    await completeAuthenticationRecovery({
      resource: outcome.resource,
      condition: outcome.condition
    });

    outcome = await attempt();
    if (outcome.condition) {
      throw new BosDependencyAdapterError("BOS authentication recovery did not restore the operation");
    }
    return outcome.response;
  };

  return Object.freeze({
    recoverAuthentication,
    waitForAuthentication,
    invokeDiscoveredOperation(contact, payload) {
      return invokeDiscovered(contact, arguments.length >= 2, payload);
    },
    invokeReturnedAction(action, payload) {
      return invoke(action, arguments.length >= 2, payload, false);
    },
    invokeStateAction(action) {
      if (arguments.length !== 1) throw new TypeError("state action is bodyless");
      return invoke(action, false, undefined, true);
    }
  });
}
