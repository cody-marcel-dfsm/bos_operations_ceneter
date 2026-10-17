import {syntheticApiContract, syntheticOperationDescribe} from "./synthetic-bos-discovery-service.mjs";
const object = (properties, required = Object.keys(properties)) => ({type: "object", additionalProperties: false, properties, required});
export const streamLimits = Object.freeze({max_identities: 100, max_streams: 3, replay_retention_seconds: 86400,
  replay_max_events: 10000, max_event_bytes: 65536, keepalive_seconds: 15, max_connection_seconds: 600});
const reconnect = {initial_delay_ms: 1000, max_delay_ms: 30000};
const cursor = {type: "string", pattern: "^[A-Za-z0-9_-]{1,512}$"};
const error = object({code: {type: "string"}, message: {type: "string"}, retryable: {type: "boolean"},
  correlation_id: {type: "string"}, details: {type: "array"}});
export function notificationFixture() {
  const contract = syntheticApiContract();
  Object.assign(contract, {operation: "journeys.notifications.subscribe", permission: "lead_director.graph.read",
    source: {platform: "bos", application: "lead-director", plugin: "lead_director"},
    input_schema: {$schema: "https://json-schema.org/draft/2020-12/schema", ...object({identity: {
      type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: {type: "string", minLength: 1, maxLength: 255}}}), "x-bos-fields": []},
    output_schema: {$schema: "https://json-schema.org/draft/2020-12/schema", type: "object", oneOf: [
      object({event: {const: "ready"}, id: cursor, data: object({journeys: {type: "array", items: object({identity: {type: "string"},
        state_action: object({verb: {const: "state"}, method: {const: "GET"}, href: {type: "string"}, payload_schema: {type: "null"}})})},
        limits: {const: {...streamLimits}}, reconnect: {const: reconnect}})}, ["event", "data"]),
      object({event: {const: "journey.changed"}, id: cursor, data: object({identity: {type: "string"}, observed_at: {type: "string"}})}),
      object({event: {enum: ["stream_error", "resync_required"]}, data: error})], "x-bos-fields": []},
    allowed_references: {identity: ["literal"]}, public_errors: [
      {code: "NOTIFICATION_RESYNC_REQUIRED", message: "Read current state.", retryable: false, http_status: 409},
      {code: "RATE_LIMITED", message: "Retry later.", retryable: true, http_status: 429},
      {code: "JOURNEY_NOT_FOUND", message: "Journey unavailable.", retryable: false, http_status: 404},
      {code: "NOTIFICATION_STREAM_UNAVAILABLE", message: "Reconnect.", retryable: true, http_status: 503}]
  });
  contract.limits.streaming_supported = true;
  Object.assign(contract.execution, {method: "GET", uri: "/bos/apps/lead-director/api/v1/organizations/synthetic/journey-notifications",
    response: {body: "event_stream", content_type: "text/event-stream", query_encoding: "repeated", resume_header: "Last-Event-ID",
      limits: {...streamLimits}, reconnect}});
  const contact = syntheticOperationDescribe().operations[0];
  Object.assign(contact, {operation: contract.operation, input_schema: contract.input_schema, output_schema: contract.output_schema,
    execution: contract.execution, limits: contract.limits, sources: [{source: contract.source, availability: "ready"}],
    error_contract: {schema: "lead-director-public-error/v1", codes: contract.public_errors.map(error => error.code)}});
  return {contract, contact};
}
export const ready = (identities, id = "nc_baseline") => ({event: "ready", ...(id === null ? {} : {id}), data: {
  journeys: identities.map(identity => ({identity, state_action: {verb: "state", method: "GET", payload_schema: null,
    href: `/bos/apps/lead-director/api/v1/organizations/synthetic/journeys/${encodeURIComponent(identity)}`}})),
  limits: {...streamLimits}, reconnect: {...reconnect}}});
export const changed = (identity, id) => ({event: "journey.changed", id, data: {identity, observed_at: "2026-10-16T21:00:00Z"}});
export const encodeFrame = frame => `${frame.id === undefined ? "" : `id: ${frame.id}\n`}event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
export async function* bytes(text, size = 1) { const data = new TextEncoder().encode(text); for (let i = 0; i < data.length; i += size) yield data.slice(i, i + size); }
