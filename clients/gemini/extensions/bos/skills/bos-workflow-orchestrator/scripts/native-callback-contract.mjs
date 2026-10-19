import Ajv2020 from "./vendor/ajv2020.bundle.mjs";
import {normalizeNotificationIdentities} from "./journey-notifications.mjs";
import {validateActionEnvelope, validateJourneyEnvelope, validatePublicError,
  interpretJourneyResponse} from "./journey-runtime-client.mjs";
import {createHash} from "node:crypto";

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
export const canonical = value => JSON.stringify(Array.isArray(value) ? value.map(item => JSON.parse(canonical(item))) :
  object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
export const digest = value => createHash("sha256").update(canonical(value)).digest("hex");
export const opaque = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,512}$/u.test(value);
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const CONTEXT_KEYS = ["context_handle", "organization_name", "application_name", "installation_name", "role_label", "is_default"];
const READS = ["journeys.notifications.read", "journeys.state.read"];

export function validateCurrentContext(context) {
  if (!exact(context, CONTEXT_KEYS) || typeof context.is_default !== "boolean" ||
      CONTEXT_KEYS.filter(key => key !== "is_default").some(key => typeof context[key] !== "string" ||
        !context[key] || context[key].length > 2048 || /[\p{Cc}\p{Cf}]/u.test(context[key]))) {
    throw new Error("A fresh exact BOS identity context is required.");
  }
  return context;
}

export function unwrapNativeRead(envelope, context) {
  validateCurrentContext(context);
  const data = envelope?.structuredContent;
  if (!object(envelope) || typeof envelope.isError !== "boolean" ||
      !exact(data, ["contract_version", "context", "result"]) || data.contract_version !== "bos-identity-mcp/v2" ||
      canonical(data.context) !== canonical(context) || canonical(envelope._meta?.["bos/context"]) !== canonical(context)) {
    throw new Error("Native read requires the exact fresh structured and metadata context; text supplies no authority.");
  }
  return {isError: envelope.isError, result: data.result};
}

export function createNativeReadContract({context, catalog}) {
  validateCurrentContext(context);
  const data = catalog?.structuredContent;
  if (catalog?.isError !== false || !exact(data, ["contract_version", "context_handle", "tools", "resources"]) ||
      data.contract_version !== "bos-identity-mcp/v2" || data.context_handle !== context.context_handle ||
      !Array.isArray(data.tools) || !Array.isArray(data.resources) || bytes(data) > 2 * 1024 * 1024) {
    throw new Error("Use the fresh structured context-tool catalog bound to the selected handle.");
  }
  const descriptors = READS.map(name => {
    const matches = data.tools.filter(item => item?.name === name);
    const item = matches[0];
    if (matches.length !== 1 || item.annotations?.readOnlyHint !== true || item.annotations?.destructiveHint !== false ||
        item._meta?.["bos/contractVersion"] !== "bos-identity-mcp/v2" ||
        !object(item.inputSchema) || !object(item.outputSchema) || bytes(item) > 512 * 1024) {
      throw new Error("Both exact read-only native journey descriptors must be freshly advertised.");
    }
    return structuredClone(item);
  });
  const ajv = new Ajv2020({strict: false, validateFormats: false});
  const compiled = new Map(descriptors.map(item => [item.name, {
    input: ajv.compile(item.inputSchema), output: ajv.compile(item.outputSchema)
  }]));
  return Object.freeze({
    key: digest(descriptors),
    read(name, arguments_, envelope) {
      const schema = compiled.get(name);
      if (!schema || !schema.input(arguments_)) throw new Error("Native journey read input violates its current descriptor.");
      const unwrapped = unwrapNativeRead(envelope, context);
      if (bytes(unwrapped.result) > 2 * 1024 * 1024 || !schema.output(unwrapped.result) ||
          unwrapped.result.ttlMs !== 0 || unwrapped.result.cacheScope !== "private") {
        throw new Error("Native journey read output violates its current private uncached descriptor.");
      }
      return unwrapped;
    }
  });
}

export function validateNativeNotificationBatch({contract, identities, cursor, waitSeconds, envelope}) {
  const watched = normalizeNotificationIdentities(identities, 100);
  if (!(cursor === null || opaque(cursor)) || !Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 25) {
    throw new Error("Use the exact committed cursor and bounded native wait.");
  }
  const request = {identity: watched, ...(cursor === null ? {} : {cursor}), wait_seconds: waitSeconds};
  const {result, isError} = contract.read(READS[0], request, envelope);
  if (isError) {
    validatePublicError(result.error);
    if (result.http_status === 409 && result.error.code === "NOTIFICATION_RESYNC_REQUIRED") {
      return {kind: "resync", error: result.error, witness: digest(result)};
    }
    return {kind: result.error.retryable === true && [429, 503].includes(result.http_status) ? "retry" : "stop", error: result.error};
  }
  if (!exact(result, ["frames", "cursor", "more", "retry_after_ms", "ttlMs", "cacheScope"]) ||
      !Array.isArray(result.frames) || result.frames.length < 1 || result.frames.length > 100 ||
      !opaque(result.cursor) || typeof result.more !== "boolean" ||
      !Number.isInteger(result.retry_after_ms) || result.retry_after_ms < 1000 || result.retry_after_ms > 30000 ||
      bytes(result) > 262144) throw new Error("Native notification batch exceeds its finite contract.");
  const frames = structuredClone(result.frames), first = frames[0];
  if (first.event !== "ready" || (cursor === null ? !opaque(first.id) : Object.hasOwn(first, "id")) ||
      frames.slice(1).some(frame => frame.event === "ready")) throw new Error("Native readiness must retain bootstrap and replay semantics.");
  const ready = first.data;
  const names = normalizeNotificationIdentities(ready.journeys.map(item => item.identity), 100);
  if (canonical(names) !== canonical(watched)) throw new Error("Native readiness changed its exact watch set.");
  for (const item of ready.journeys) {
    validateActionEnvelope(item.state_action);
    if (item.state_action.verb !== "state" || item.state_action.method !== "GET" || item.state_action.payload_schema !== null) {
      throw new Error("Native readiness must expose read-only state actions.");
    }
    // These hrefs remain inert. State dispatch uses only the fresh identity-only native operation.
  }
  const limits = ready.limits;
  const ceilings = {max_identities: 100, max_streams: 3, replay_retention_seconds: 86400,
    replay_max_events: 10000, max_event_bytes: 65536, keepalive_seconds: 15, max_connection_seconds: 600};
  if (!exact(limits, Object.keys(ceilings)) || Object.entries(ceilings).some(([key, maximum]) =>
    !Number.isInteger(limits[key]) || limits[key] < 1 || limits[key] > maximum)) {
    throw new Error("Native notification limits exceed supported consumer bounds.");
  }
  let endCursor = cursor ?? first.id;
  const changed = [], ids = new Set();
  for (const [index, frame] of frames.entries()) {
    if (bytes(frame) > limits.max_event_bytes) throw new Error("Native frame exceeded its encoded bound.");
    if (frame.event === "journey.changed") {
      if (!watched.includes(frame.data.identity) || !opaque(frame.id) || ids.has(frame.id) ||
          !/T.*(?:Z|\+00:00)$/u.test(frame.data.observed_at) || !Number.isFinite(Date.parse(frame.data.observed_at))) {
        throw new Error("Native hint changed scope, cursor or observation semantics.");
      }
      ids.add(frame.id); changed.push({identity: frame.data.identity, cursor: frame.id}); endCursor = frame.id;
    } else if (frame.event !== "ready") {
      validatePublicError(frame.data);
      if (index !== frames.length - 1) throw new Error("A native control error must end the batch.");
      if (frame.event === "resync_required" && frame.data.code === "NOTIFICATION_RESYNC_REQUIRED") {
        return {kind: "resync", error: frame.data, witness: digest(result)};
      }
      return {kind: "stop", error: frame.data};
    }
  }
  if (endCursor !== result.cursor) throw new Error("Native cursor advanced beyond included events.");
  return {kind: "batch", bootstrap: cursor === null, cursor: result.cursor, changed,
    retryAfterMs: result.retry_after_ms, more: result.more, witness: digest(result)};
}

export function validateNativeJourneyState({contract, identity, envelope}) {
  const {result, isError} = contract.read(READS[1], {identity}, envelope);
  // The host flag also marks canonical HTTP errors. The validated result union,
  // rather than that flag, distinguishes state projection from adapter failure.
  if (!Object.hasOwn(result, "body")) {
    if (!isError || !exact(result, ["http_status", "error", "ttlMs", "cacheScope"])) {
      throw new Error("Native adapter errors require their exact error shape and flag.");
    }
    validatePublicError(result.error);
    return {kind: [401, 403, 422].includes(result.http_status) ? "stop" : "pending_error", error: result.error};
  }
  if (!exact(result, ["http_status", "body", "headers", "ttlMs", "cacheScope"]) ||
      !object(result.headers) || Object.keys(result.headers).some(key => key !== "Retry-After")) {
    throw new Error("Native state must retain its exact status, body and safe service headers.");
  }
  const body = result.body, headers = structuredClone(result.headers);
  if (![200, 202, 404, 410].includes(result.http_status)) {
    validatePublicError(body.error);
    return {kind: [401, 403, 422].includes(result.http_status) ? "stop" : "pending_error",
      httpStatus: result.http_status, error: body.error, headers};
  }
  if (result.http_status === 404 || (result.http_status === 410 && body.status === undefined)) {
    validatePublicError(body.error);
    if (!["JOURNEY_NOT_FOUND", "JOURNEY_EXPIRED", "JOURNEY_GONE"].includes(body.error.code)) {
      return {kind: "pending_error", httpStatus: result.http_status, headers};
    }
    return {kind: "observation", terminal: true, decision: {next: "remove_from_watch_set", code: body.error.code}};
  }
  validateJourneyEnvelope(body);
  if (body.identity !== identity || (result.http_status === 202 && body.status !== "in_progress") ||
      (result.http_status === 410 && body.status !== "expired")) throw new Error("Native state changed its public identity or status meaning.");
  const decision = interpretJourneyResponse({http_status: result.http_status, body, headers});
  return {kind: "observation", terminal: decision.next === "terminal", keepPending: body.status === "in_progress",
    decision: {next: decision.next},
    ...(body.status === "in_progress" && body.retry_after_seconds !== undefined ? {retryAfterSeconds: body.retry_after_seconds} : {})};
}
