import Ajv2020 from "./vendor/ajv2020.bundle.mjs";
import {validateApiContractResponse} from "../../bos-app-discovery/scripts/validate-discovery.mjs";
import {validatePublicError, validateActionEnvelope, validateJourneyEnvelope, interpretJourneyResponse} from "./journey-runtime-client.mjs";
import {BosNotificationTransportError} from "../../bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs";

const canonical = value => JSON.stringify(value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);

export function normalizeNotificationIdentities(identities, maximum) {
  if (!Array.isArray(identities) || !Number.isSafeInteger(maximum) || maximum < 1 ||
      identities.length < 1 || identities.length > maximum) throw new Error("Select a bounded explicit journey watch list.");
  for (const identity of identities) {
    if (typeof identity !== "string" || !identity || identity.normalize("NFC") !== identity ||
        new TextEncoder().encode(identity).length > 255 || /[\p{Cc}\p{Cf}]/u.test(identity)) {
      throw new Error("Notification identities must match current public journey identities.");
    }
  }
  if (new Set(identities).size !== identities.length) throw new Error("Notification identities must be unique.");
  return [...identities].sort();
}

// Bounded at the encoded frame boundary, including comments and CR/LF framing.
export async function* parseNotificationSse(chunks, {maxFrameBytes, signal} = {}) {
  if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1 || maxFrameBytes > 65536) {
    throw new Error("Discover a supported encoded event-frame limit.");
  }
  let buffer = new Uint8Array(maxFrameBytes), used = 0, start = 0, pendingCr = false, first = true;
  let event, id, data = [];
  const decoder = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true});
  const line = end => {
    let text = decoder.decode(buffer.subarray(start, end));
    if (first) { text = text.replace(/^\uFEFF/u, ""); first = false; }
    start = used;
    if (text === "") {
      const frame = event === undefined && id === undefined && !data.length ? null :
        {event, ...(id === undefined ? {} : {id}), data: JSON.parse(data.join("\n"))};
      used = start = 0; event = id = undefined; data = [];
      return frame;
    }
    if (text.startsWith(":")) return null;
    const split = text.indexOf(":");
    const field = split < 0 ? text : text.slice(0, split);
    let value = split < 0 ? "" : text.slice(split + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
    else if (field === "event" && event === undefined) event = value;
    else if (field === "id" && id === undefined) id = value;
    else throw new Error("Notification stream has an undeclared or duplicate field.");
    return null;
  };
  for await (const chunk of chunks) {
    if (!(chunk instanceof Uint8Array)) throw new Error("The host stream must yield incremental bytes.");
    for (const byte of chunk) {
      if (signal?.aborted) throw new BosNotificationTransportError("cancelled");
      if (pendingCr) {
        pendingCr = false;
        if (byte !== 10) {
          const frame = line(used - 1);
          if (frame) yield frame;
        }
      }
      if (used === maxFrameBytes) throw new Error("Notification stream exceeded its encoded frame limit.");
      buffer[used++] = byte;
      if (byte === 13) pendingCr = true;
      else if (byte === 10) {
        const end = used > 1 && buffer[used - 2] === 13 ? used - 2 : used - 1;
        const frame = line(end);
        if (frame) yield frame;
      }
    }
  }
  if (pendingCr) {
    const frame = line(used - 1);
    if (frame) yield frame;
  }
  if (used !== 0) throw new Error("Notification stream ended with an incomplete frame; reconnect from the committed cursor.");
}

export function createNotificationProtocol(sourceContract, identities, {resuming = false} = {}) {
  const contract = structuredClone(sourceContract);
  validateApiContractResponse(contract, {operation: "journeys.notifications.subscribe"});
  const response = contract.execution.response;
  if (contract.effect !== "read" || contract.execution.method !== "GET" ||
      response?.body !== "event_stream" || contract.readiness.status !== "ready") {
    throw new Error("Live notifications are unavailable; retain authoritative state reads.");
  }
  const watched = normalizeNotificationIdentities(identities, response.limits.max_identities);
  const validate = new Ajv2020({strict: false, validateFormats: false}).compile(contract.output_schema);
  const actions = new Map();
  let ready = false, closed = false;
  return Object.freeze({
    identities: Object.freeze(watched), maxFrameBytes: response.limits.max_event_bytes,
    limits: Object.freeze({...response.limits}), reconnect: Object.freeze({...response.reconnect}),
    accept(input) {
      const frame = structuredClone(input);
      if (closed || !validate(frame)) throw new Error("Notification event violates the discovered closed schema.");
      if (frame.event === "ready") {
        if (ready || (resuming ? Object.hasOwn(frame, "id") : !Object.hasOwn(frame, "id"))) {
          throw new Error("Notification readiness must preserve bootstrap/replay cursor semantics.");
        }
        const names = frame.data.journeys.map(item => item.identity);
        if (JSON.stringify(normalizeNotificationIdentities(names, response.limits.max_identities)) !== JSON.stringify(watched) ||
            canonical(frame.data.limits) !== canonical(response.limits) ||
            canonical(frame.data.reconnect) !== canonical(response.reconnect)) {
          throw new Error("Notification readiness changed its exact watch set or effective contract.");
        }
        const prefix = contract.execution.uri.slice(0, contract.execution.uri.lastIndexOf("/") + 1) + "journeys/";
        for (const item of frame.data.journeys) {
          const action = item.state_action;
          validateActionEnvelope(action);
          if (action.verb !== "state" || action.method !== "GET" || action.payload_schema !== null ||
              !action.href.startsWith(prefix) || action.href.includes("?") ||
              decodeURIComponent(action.href.slice(prefix.length)) !== item.identity) {
            throw new Error("Notification readiness requires exact read-only state actions for its identities.");
          }
          actions.set(item.identity, Object.freeze(action));
        }
        ready = true;
      } else if (frame.event === "journey.changed") {
        if (!ready || !watched.includes(frame.data.identity) ||
            !/T.*(?:Z|\+00:00)$/u.test(frame.data.observed_at) || !Number.isFinite(Date.parse(frame.data.observed_at))) {
          throw new Error("Notification change requires readiness, a watched identity and a UTC observation.");
        }
      } else {
        validatePublicError(frame.data);
        if (!contract.public_errors.some(error => error.code === frame.data.code && error.retryable === frame.data.retryable)) {
          throw new Error("Notification control error is undeclared by the current contract.");
        }
        if (frame.event === "resync_required" && frame.data.code !== "NOTIFICATION_RESYNC_REQUIRED") {
          throw new Error("Notification resynchronization requires the declared gap error.");
        }
        closed = true;
      }
      return frame;
    },
    stateAction(identity) {
      if (!ready || !actions.has(identity)) throw new Error("Fresh notification state actions are required.");
      return structuredClone(actions.get(identity));
    }
  });
}

export async function consumeNotificationStream({chunks, protocol, queue, signal}) {
  for await (const raw of parseNotificationSse(chunks, {maxFrameBytes: protocol.maxFrameBytes, signal})) {
    const frame = protocol.accept(raw);
    if (frame.event === "ready") {
      if (frame.id !== undefined) await queue.bootstrap(frame.id);
      if ((await queue.wake())?.accepted !== true) return {next: "host_wake_unavailable"};
    } else if (frame.event === "journey.changed") {
      await queue.enqueue({identity: frame.data.identity, cursor: frame.id});
      if ((await queue.wake())?.accepted !== true) return {next: "host_wake_unavailable"};
    } else {
      return {next: frame.event === "resync_required" ? "bootstrap" : "refresh_access", error: frame.data};
    }
  }
  return {next: "reconnect"};
}

export async function drainNotificationQueue({queue, protocol, adapter, deliver}) {
  const pending = await queue.pending(), removed = [];
  for (const item of pending) {
    const response = await adapter.invokeStateAction(protocol.stateAction(item.identity));
    if (![200, 202, 404, 410].includes(response.status)) throw new Error("Retain pending work until the current state read recovers.");
    let decision;
    if (response.status >= 400) {
      validatePublicError(response.body?.error);
      if (!new Set(["JOURNEY_NOT_FOUND", "JOURNEY_EXPIRED", "JOURNEY_GONE"]).has(response.body.error.code)) {
        throw new Error("Rediscover an unavailable journey before changing the exact watch set.");
      }
      decision = {next: "remove_from_watch_set", error: response.body.error};
    } else {
      validateJourneyEnvelope(response.body);
      if (response.body.identity !== item.identity) throw new Error("The state read changed its journey identity.");
      decision = interpretJourneyResponse({http_status: response.status, headers: response.headers, body: response.body});
    }
    if (await deliver({identity: item.identity, response, decision}) !== true) throw new Error("The intended task has not accepted the state observation.");
    const acknowledged = await queue.acknowledge(item);
    if (acknowledged === true && ["remove_from_watch_set", "terminal"].includes(decision.next)) removed.push(item.identity);
  }
  return {removed};
}

// One bounded connection per call. The existing host scheduler owns reconnect lifetime.
export async function runNotificationConnection({adapter, sourceContract, contact, identities, queue, signal,
  attempt = 0, random = Math.random}) {
  const contract = structuredClone(sourceContract), described = structuredClone(contact);
  if (described.operation !== contract.operation || described.effect !== "read" ||
      canonical(described.execution) !== canonical(contract.execution) ||
      canonical(described.input_schema) !== canonical(contract.input_schema) ||
      canonical(described.output_schema) !== canonical(contract.output_schema) ||
      !Number.isSafeInteger(attempt) || attempt < 0) throw new Error("Rediscover the exact notification operation");
  const caps = await adapter.getNotificationCapabilities();
  if (!caps.authenticatedEventStream || !caps.durableTaskWake) return {next: "unavailable"};
  if (signal?.aborted) return {next: "stop", reason: "cancelled"};
  const cursor = await queue.cursor();
  const protocol = createNotificationProtocol(contract, identities, {resuming: cursor !== null});
  const retry = retryAfter => {
    const unit = random();
    if (!Number.isFinite(unit) || unit < 0 || unit >= 1) throw new Error("A bounded jitter source is required");
    const ceiling = Math.min(protocol.reconnect.max_delay_ms,
      protocol.reconnect.initial_delay_ms * 2 ** Math.min(attempt, 30));
    let minimum = 0;
    if (retryAfter !== undefined) {
      if (!/^\d{1,5}$/u.test(String(retryAfter)) || Number(retryAfter) > 86400) return {next: "stop"};
      minimum = Number(retryAfter) * 1000;
    }
    return {next: "reconnect", delayMs: Math.max(minimum, Math.floor(unit * ceiling))};
  };
  const transportRecovery = error => {
    if (!(error instanceof BosNotificationTransportError)) throw error;
    return error.kind === "cancelled" ? {next: "stop", reason: "cancelled"} : retry();
  };
  // Persisted work needs an accepted wake even before resumed readiness arrives.
  if ((await queue.wake())?.accepted !== true) return {next: "host_wake_unavailable"};
  let reply;
  try {
    reply = await adapter.openNotificationStream(described, {identities: protocol.identities,
      ...(cursor === null ? {} : {cursor}), signal});
  } catch (error) { return transportRecovery(error); }
  if (reply.status !== 200) {
    validatePublicError(reply.body?.error);
    const error = reply.body.error;
    const declared = contract.public_errors.find(item => item.code === error.code && item.http_status === reply.status);
    if (!declared && reply.status !== 403) throw new Error("Notification service returned an undeclared error");
    if (reply.status === 409 && error.code === "NOTIFICATION_RESYNC_REQUIRED") {
      await queue.resetCursor(); return {next: "bootstrap", delayMs: 0};
    }
    if ([404, 410].includes(reply.status)) return {next: "rediscover_watch_set"};
    if ([429, 503].includes(reply.status) && error.retryable) return retry(reply.headers?.["retry-after"]);
    return {next: "stop", error};
  }
  let result;
  try { result = await consumeNotificationStream({chunks: reply.chunks, protocol, queue, signal}); }
  catch (error) { return transportRecovery(error); }
  if (result.next === "host_wake_unavailable") return result;
  if (result.next === "bootstrap") {
    await queue.resetCursor(); return {...result, delayMs: 0};
  }
  if (result.next === "refresh_access") {
    return result.error.retryable && ["NOTIFICATION_STREAM_UNAVAILABLE", "RATE_LIMITED"].includes(result.error.code)
      ? retry() : {next: "stop", error: result.error};
  }
  return retry();
}
