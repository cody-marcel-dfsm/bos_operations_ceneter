#!/usr/bin/env node

import Ajv from "ajv";

const lifecycleVerbs = new Set(["start", "complete", "step", "failed", "state"]);
const journeyStatuses = new Set([
  "not_started",
  "awaiting_client",
  "client_action_required",
  "step_completed",
  "failure_caught",
  "in_progress",
  "completed",
  "failed",
  "expired"
]);
const forbiddenPublicKeys = new Set([
  "journey_id",
  "execution_id",
  "graph_id",
  "snapshot_id",
  "compiled_snapshot",
  "compiled_fingerprint",
  "digest",
  "revision",
  "state_version",
  "node_occurrence",
  "occurrence",
  "idempotency_key",
  "retry_count",
  "retry_state",
  "action_id",
  "artifact_ref",
  "object_name",
  "provider",
  "provider_id",
  "provider_account_id",
  "provider_error",
  "provider_message",
  "provider_payload",
  "provider_response",
  "database_id",
  "sql",
  "stack_trace",
  "attendee",
  "attendees",
  "email",
  "emails",
  "email_address",
  "email_addresses",
  "recipient",
  "recipients",
  "access_token",
  "refresh_token",
  "bearer_token",
  "api_key",
  "credential_id",
  "authority_context",
  "org_id",
  "organization_id",
  "app_code",
  "application_id",
  "installed_app_id",
  "role_id",
  "user_id"
]);
const actionFields = new Set(["verb", "method", "href", "payload_schema"]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} has undeclared field ${key}`);
  }
}

function normalizedSecurityKey(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function rejectInternalState(value, path = "journey response") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectInternalState(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenPublicKeys.has(normalizedSecurityKey(key))) {
      throw new Error(`${path}.${key} exposes internal journey state`);
    }
    rejectInternalState(child, `${path}.${key}`);
  }
}

function validateHref(href, label) {
  requireString(href, label);
  if (href !== href.trim() || /[\s\\]/u.test(href)) {
    throw new Error(`${label} must be a complete returned HTTPS or origin-relative URI`);
  }
  let parsed;
  try {
    parsed = new URL(href, "https://bos.invalid");
  } catch {
    throw new Error(`${label} must be a complete returned HTTPS or origin-relative URI`);
  }
  const relative = href.startsWith("/") && !href.startsWith("//");
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash ||
      (relative && parsed.origin !== "https://bos.invalid") ||
      (!relative && !href.startsWith("https://"))) {
    throw new Error(`${label} must be a complete returned HTTPS or origin-relative URI`);
  }
}

export function validateActionEnvelope(action, { lifecycleOnly = false } = {}) {
  requireObject(action, "action");
  requireExactKeys(action, actionFields, "action");
  for (const field of ["verb", "method", "href"]) {
    requireString(action[field], `action.${field}`);
  }
  if (lifecycleOnly && !lifecycleVerbs.has(action.verb)) {
    throw new Error("action.verb is not a journey lifecycle action");
  }
  if (!new Set(["GET", "POST"]).has(action.method)) {
    throw new Error("action.method must be GET or POST");
  }
  validateHref(action.href, "action.href");
  if (!Object.hasOwn(action, "payload_schema")) {
    throw new Error("action.payload_schema is required");
  }
  if (action.payload_schema !== null) {
    requireObject(action.payload_schema, "action.payload_schema");
  }
  if ((action.method === "GET" || action.verb === "state") && action.payload_schema !== null) {
    throw new Error("bodyless observation actions require payload_schema null");
  }
  if (lifecycleVerbs.has(action.verb)) {
    const expectedMethod = action.verb === "state" ? "GET" : "POST";
    if (action.method !== expectedMethod) {
      throw new Error(`${action.verb} action must use ${expectedMethod}`);
    }
    if (["start", "step", "state"].includes(action.verb) && action.payload_schema !== null) {
      throw new Error(`${action.verb} action must be bodyless`);
    }
  }
  return action;
}

function validatePayload(payload, schema) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addFormat("date-time", {
    type: "string",
    validate: (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      !Number.isNaN(Date.parse(value))
  });
  const validate = ajv.compile(schema);
  if (!validate(payload)) {
    const details = (validate.errors ?? [])
      .map((error) => `${error.instancePath || "$"} ${error.message}`)
      .join("; ");
    throw new Error(`action payload does not match payload_schema: ${details}`);
  }
}

export function buildActionRequest(action, payload) {
  validateActionEnvelope(action);
  const supplied = arguments.length >= 2;
  if (action.payload_schema === null) {
    if (supplied) throw new Error("bodyless action must not include a body");
    return {
      method: action.method,
      href: action.href,
      headers: {},
      body: undefined
    };
  }
  if (!supplied) throw new Error("action requires a body declared by payload_schema");
  validatePayload(payload, action.payload_schema);
  return {
    method: action.method,
    href: action.href,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  };
}

function validatePublicError(error, label = "error") {
  requireObject(error, label);
  requireExactKeys(
    error,
    new Set(["code", "message", "retryable", "correlation_id", "details"]),
    label
  );
  requireString(error.code, `${label}.code`);
  requireString(error.message, `${label}.message`);
  if (typeof error.retryable !== "boolean") {
    throw new Error(`${label}.retryable must be boolean`);
  }
  requireString(error.correlation_id, `${label}.correlation_id`);
  if (!Array.isArray(error.details)) {
    throw new Error(`${label}.details must be an array`);
  }
  error.details.forEach((detail, index) => {
    requireObject(detail, `${label}.details[${index}]`);
  });
  rejectInternalState(error, label);
  return error;
}

export function validateClientInstruction(instruction) {
  requireObject(instruction, "instruction");
  requireString(instruction.goal, "instruction.goal");
  requireString(instruction.message, "instruction.message");
  if (instruction.problem !== undefined) {
    requireObject(instruction.problem, "instruction.problem");
    requireString(instruction.problem.code, "instruction.problem.code");
    requireString(instruction.problem.message, "instruction.problem.message");
  }
  if (instruction.semantic_operation !== undefined) {
    requireString(instruction.semantic_operation, "instruction.semantic_operation");
  }
  if (instruction.approval !== undefined) {
    requireObject(instruction.approval, "instruction.approval");
    if (typeof instruction.approval.required !== "boolean") {
      throw new Error("instruction.approval.required must be boolean");
    }
  }
  if (instruction.after_success !== undefined) {
    validateActionEnvelope(instruction.after_success, { lifecycleOnly: true });
  }
  if (instruction.on_failure !== undefined) {
    validateActionEnvelope(instruction.on_failure, { lifecycleOnly: true });
  }
  rejectInternalState(instruction, "instruction");
  return instruction;
}

export function validateClientResolution(resolution) {
  requireObject(resolution, "resolution");
  requireExactKeys(
    resolution,
    new Set([
      "goal",
      "instruction",
      "operation",
      "requires_user_approval",
      "approval_scope",
      "after_success"
    ]),
    "resolution"
  );
  requireString(resolution.goal, "resolution.goal");
  if (!/^[a-z][a-z0-9_]{0,127}$/u.test(resolution.goal)) {
    throw new Error("resolution.goal must be a published semantic goal");
  }
  requireString(resolution.instruction, "resolution.instruction");
  if (resolution.instruction.length > 4000) {
    throw new Error("resolution.instruction exceeds the published bound");
  }
  if (resolution.operation !== undefined &&
      (typeof resolution.operation !== "string" ||
       resolution.operation.length > 255 ||
       !/^[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)+$/u.test(resolution.operation))) {
    throw new Error("resolution.operation must be a published semantic operation");
  }
  if (typeof resolution.requires_user_approval !== "boolean") {
    throw new Error("resolution.requires_user_approval must be boolean");
  }
  if (resolution.approval_scope !== undefined) {
    if (!Array.isArray(resolution.approval_scope) ||
        resolution.approval_scope.length > 64 ||
        new Set(resolution.approval_scope).size !== resolution.approval_scope.length ||
        resolution.approval_scope.some((item) =>
          typeof item !== "string" || !/^[a-z][a-z0-9_.-]{0,127}$/u.test(item))) {
      throw new Error("resolution.approval_scope is invalid");
    }
  }
  if (resolution.requires_user_approval && !resolution.approval_scope?.length) {
    throw new Error("resolution.approval_scope is required when approval is required");
  }
  validateActionEnvelope(resolution.after_success, { lifecycleOnly: true });
  if (resolution.after_success.verb !== "step" ||
      resolution.after_success.payload_schema !== null) {
    throw new Error("resolution.after_success must be the returned bodyless step action");
  }
  rejectInternalState(resolution, "resolution");
  return resolution;
}

export function validateJourneyEnvelope(body) {
  requireObject(body, "journey response");
  rejectInternalState(body);
  requireString(body.identity, "journey response.identity");
  if (!journeyStatuses.has(body.status)) {
    throw new Error("journey response.status is invalid");
  }
  if (body.current_step !== undefined) {
    requireObject(body.current_step, "journey response.current_step");
    requireString(body.current_step.code, "journey response.current_step.code");
    if (!["client", "server"].includes(body.current_step.type)) {
      throw new Error("journey response.current_step.type must be client or server");
    }
  }
  if (body.status === "awaiting_client") {
    requireObject(body.current_step, "journey response.current_step");
    if (body.current_step.type !== "client") {
      throw new Error("awaiting_client current_step must be client-owned");
    }
    validateClientInstruction(body.instruction);
    requireObject(body.instruction.after_success, "instruction.after_success");
    requireObject(body.instruction.on_failure, "instruction.on_failure");
    validateActionEnvelope(body.instruction.after_success, { lifecycleOnly: true });
    validateActionEnvelope(body.instruction.on_failure, { lifecycleOnly: true });
    if (body.instruction.after_success.verb !== "complete") {
      throw new Error("instruction.after_success must be the returned complete action");
    }
    if (body.instruction.on_failure.verb !== "failed") {
      throw new Error("instruction.on_failure must be the returned failed action");
    }
  }
  if (body.status === "client_action_required") {
    requireObject(body.current_step, "journey response.current_step");
    if (body.current_step.type !== "server") {
      throw new Error("client_action_required current_step must be server-owned");
    }
    requireString(
      body.current_step.operation,
      "journey response.current_step.operation"
    );
    validatePublicError(body.error);
    validateClientResolution(body.resolution);
  }
  if (["not_started", "step_completed", "failure_caught", "in_progress"].includes(body.status)) {
    validateActionEnvelope(body.action, { lifecycleOnly: true });
  }
  if (body.status === "not_started" && body.action.verb !== "start") {
    throw new Error("not_started must return the start action");
  }
  if (["step_completed", "failure_caught"].includes(body.status) && body.action.verb !== "step") {
    throw new Error(`${body.status} must return the step action`);
  }
  if (body.status === "in_progress") {
    requireObject(body.current_node, "journey response.current_node");
    requireString(body.current_node.code, "journey response.current_node.code");
    if (body.current_node.type !== "server") {
      throw new Error("in_progress current_node must be server-owned");
    }
    requireString(body.current_node.operation, "journey response.current_node.operation");
    if (!Number.isInteger(body.retry_after_seconds) || body.retry_after_seconds < 0) {
      throw new Error("in_progress retry_after_seconds must be a non-negative integer");
    }
    if (body.action.verb !== "state" || body.action.method !== "GET") {
      throw new Error("in_progress must return a bodyless state GET action");
    }
  }
  if (["completed", "failed", "expired"].includes(body.status)) {
    if (Object.hasOwn(body, "action")) {
      throw new Error("terminal journey response must not return an action");
    }
    if (Object.hasOwn(body, "instruction") || Object.hasOwn(body, "resolution")) {
      throw new Error("terminal journey response must not return a continuation instruction");
    }
  }
  if (body.status === "completed") {
    requireObject(body.outcome, "completed journey response.outcome");
    if (Object.hasOwn(body, "error")) {
      throw new Error("completed journey response must not return an error");
    }
  }
  if (["failed", "expired"].includes(body.status) && !Object.hasOwn(body, "error")) {
    throw new Error(`${body.status} journey response requires an error`);
  }
  if (body.error !== undefined) validatePublicError(body.error);
  return body;
}

export function validateRegistrationResponse(body) {
  requireObject(body, "registration response");
  rejectInternalState(body, "registration response");
  if (typeof body.compiled !== "boolean") {
    throw new Error("registration response.compiled must be boolean");
  }
  if (body.compiled) {
    requireString(body.identity, "registration response.identity");
    validateActionEnvelope(body.action, { lifecycleOnly: true });
    if (body.action.verb !== "start" || body.action.method !== "POST" ||
        body.action.payload_schema !== null) {
      throw new Error("compiled registration must return a bodyless start action");
    }
    return body;
  }
  validatePublicError(body.error, "registration response.error");
  if (!Array.isArray(body.errors) || body.errors.length === 0) {
    throw new Error("compile failure requires actionable compiler errors");
  }
  for (const [index, error] of body.errors.entries()) {
    requireObject(error, `registration response.errors[${index}]`);
    for (const field of ["code", "path", "message"]) {
      requireString(error[field], `registration response.errors[${index}].${field}`);
    }
  }
  if (Object.hasOwn(body, "action")) {
    throw new Error("compile failure must not return an action");
  }
  return body;
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1];
}

export function interpretJourneyResponse(response) {
  requireObject(response, "HTTP response");
  if (!Number.isInteger(response.http_status)) {
    throw new Error("HTTP response.http_status must be an integer");
  }
  requireObject(response.body, "HTTP response.body");
  rejectInternalState(response.body);

  if (response.body.error?.code === "JOURNEY_CREATION_RATE_LIMITED") {
    validatePublicError(response.body.error);
    const seconds = response.body.retry_after_seconds;
    if (!Number.isInteger(seconds) || seconds < 1) {
      throw new Error("creation rate limit requires retry_after_seconds");
    }
    const retryAfter = Number(headerValue(response.headers, "retry-after"));
    if (!Number.isInteger(retryAfter) || retryAfter !== seconds) {
      throw new Error("Retry-After must equal retry_after_seconds");
    }
    return {
      next: "await_explicit_user_request",
      retry_after_seconds: seconds,
      error: response.body.error
    };
  }
  if (response.body.error?.code === "JOURNEY_ACTIVE_LIMIT_REACHED") {
    validatePublicError(response.body.error);
    const resolution = requireObject(response.body.resolution, "active capacity resolution");
    requireExactKeys(
      resolution,
      new Set(["goal", "instruction", "stoppable_journeys"]),
      "active capacity resolution"
    );
    if (resolution.goal !== "free_journey_capacity") {
      throw new Error("active capacity resolution goal is invalid");
    }
    requireString(resolution.instruction, "active capacity resolution.instruction");
    if (!Array.isArray(resolution.stoppable_journeys)) {
      throw new Error("active capacity response requires stoppable_journeys");
    }
    for (const [index, journey] of resolution.stoppable_journeys.entries()) {
      requireObject(journey, `stoppable_journeys[${index}]`);
      requireString(journey.identity, `stoppable_journeys[${index}].identity`);
      requireString(journey.name, `stoppable_journeys[${index}].name`);
      requireString(journey.expires_at, `stoppable_journeys[${index}].expires_at`);
      validateActionEnvelope(journey.action, { lifecycleOnly: true });
      if (journey.action.verb !== "state") {
        throw new Error("stoppable journey must return its exact state action");
      }
    }
    return {
      next: resolution.stoppable_journeys.length
        ? "request_stop_selection"
        : "capacity_unavailable",
      choices: resolution.stoppable_journeys,
      error: response.body.error
    };
  }
  if (response.http_status === 404 && response.body.error?.code === "JOURNEY_NOT_FOUND") {
    validatePublicError(response.body.error);
    return { next: "terminal_not_found", error: response.body.error };
  }

  const body = validateJourneyEnvelope(response.body);
  switch (body.status) {
    case "not_started":
      return { next: "invoke_action", action: body.action };
    case "awaiting_client":
      return { next: "client_instruction", instruction: body.instruction };
    case "client_action_required":
      return {
        next: "resolve_instruction",
        error: body.error,
        resolution: body.resolution
      };
    case "step_completed":
    case "failure_caught":
      return { next: "invoke_action", action: body.action };
    case "in_progress":
      return {
        next: "poll_state",
        retry_after_seconds: body.retry_after_seconds,
        action: body.action
      };
    case "completed":
    case "failed":
    case "expired":
      return { next: "terminal", body };
    default:
      throw new Error("unsupported journey response state");
  }
}

export async function runJourneyRecovery(initialResponse, { wait, invoke }) {
  if (typeof wait !== "function" || typeof invoke !== "function") {
    throw new Error("runJourneyRecovery requires wait and invoke functions");
  }
  let response = initialResponse;
  while (true) {
    const decision = interpretJourneyResponse(response);
    if (decision.next !== "poll_state") return response;
    await wait(decision.retry_after_seconds);
    const request = buildActionRequest(decision.action);
    response = await invoke(request);
  }
}
