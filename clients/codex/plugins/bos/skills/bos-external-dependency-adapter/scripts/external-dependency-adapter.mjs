import Ajv2020 from "./vendor/ajv2020.bundle.mjs";

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
  "application_id", "installation_id", "installed_app_id", "role_id", "resource_group_id"
]);

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
  requireSafeString(value.href, "returned action href", 4096);
  if (/\s|\\|#/u.test(value.href) || value.href.startsWith("//") ||
      !value.href.startsWith("/") ||
      /(?:^|\/)\.\.(?:\/|$)/u.test(value.href)) {
    throw new TypeError("returned action href must be a safe origin-relative URI");
  }
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
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(payload)) throw new TypeError("returned action payload does not match payload_schema");
  rejectPrivateTransportData(payload, "returned action payload");
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

function publicResponse(value) {
  requireObject(value, "BOS transport response");
  if (!Number.isInteger(value.status) || value.status < 100 || value.status > 599) {
    throw new TypeError("BOS transport response.status is invalid");
  }
  rejectPrivateTransportData(value.body, "BOS transport response.body");
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
  constructor(message, code) {
    super(message);
    this.name = "BosDependencyAdapterError";
    this.code = code;
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
      throw new BosDependencyAdapterError("BOS authentication handoff result does not match its request", "INVALID_AUTHENTICATION_RESULT");
    }
    return result;
  };

  const recoverAuthentication = async (input) => {
    const request = buildAuthenticationHandoffRequest(await handoffInput(input));
    return validateMatchingResult(await hostTransport.recoverAuthentication(request), request);
  };

  const waitForAuthentication = async (input) => {
    if (typeof hostTransport.waitForAuthentication !== "function") {
      throw new BosDependencyAdapterError("BOS authentication recovery remains active", "AUTHENTICATION_RECOVERY_PENDING");
    }
    const request = buildAuthenticationHandoffRequest(await handoffInput(input));
    return validateMatchingResult(await hostTransport.waitForAuthentication(request), request);
  };

  const buildRequest = async (action, payloadSupplied, payload, state) => {
    const current = validateAction(action, { state });
    if (current.payload_schema === null && payloadSupplied) throw new TypeError("bodyless returned action cannot receive a payload");
    if (current.payload_schema !== null && !payloadSupplied) throw new TypeError("returned action payload is required");
    if (current.payload_schema !== null) validatePayload(payload, current.payload_schema);
    let contextHandle;
    let contextHeader;
    try {
      contextHandle = validateFreshContext(await contextProvider.getCurrentContext());
      contextHeader = contextHandle === null
        ? null
        : validateExecutionContextHeader(await contextProvider.getExecutionContextHeader());
    } catch {
      throw new BosDependencyAdapterError("The current BOS execution context is unavailable", "CONTEXT_UNAVAILABLE");
    }
    return {
      method: current.method,
      href: current.href,
      headers: {
        ...(current.payload_schema === null ? {} : { "content-type": "application/json" }),
        ...(contextHandle === null ? {} : { [contextHeader]: contextHandle })
      },
      body: current.payload_schema === null ? undefined : JSON.stringify(payload)
    };
  };

  const requestOnce = async (action, payloadSupplied, payload, state) => {
    const request = await buildRequest(action, payloadSupplied, payload, state);
    try {
      return await hostTransport.request(request);
    } catch (error) {
      const condition = authenticationCondition(error);
      if (condition) return {
        authenticationError: true,
        condition,
        resource: error?.resource
      };
      throw new BosDependencyAdapterError("The BOS dependency transport failed", "TRANSPORT_FAILURE");
    }
  };

  const invoke = async (action, payloadSupplied, payload, state) => {
    let response = await requestOnce(action, payloadSupplied, payload, state);
    let condition = response?.authenticationError ? response.condition : authenticationCondition(response);
    if (!condition) return publicResponse(response);

    const recoveryResource = response?.resource;
    let readiness = await recoverAuthentication({ resource: recoveryResource, condition });
    if (readiness.status !== "READY") {
      readiness = await waitForAuthentication({
        resource: readiness.protected_resource,
        condition: readiness.condition ?? condition,
        host_correlation: readiness.host_correlation
      });
    }
    if (readiness.status !== "READY") {
      throw new BosDependencyAdapterError("BOS authentication recovery remains active", "AUTHENTICATION_RECOVERY_PENDING");
    }

    response = await requestOnce(action, payloadSupplied, payload, state);
    condition = response?.authenticationError ? response.condition : authenticationCondition(response);
    if (condition) {
      throw new BosDependencyAdapterError("BOS authentication recovery did not restore the operation", "AUTHENTICATION_RECOVERY_FAILED");
    }
    return publicResponse(response);
  };

  return Object.freeze({
    recoverAuthentication,
    waitForAuthentication,
    invokeReturnedAction(action, payload) {
      return invoke(action, arguments.length >= 2, payload, false);
    },
    invokeStateAction(action) {
      if (arguments.length !== 1) throw new TypeError("state action is bodyless");
      return invoke(action, false, undefined, true);
    }
  });
}
