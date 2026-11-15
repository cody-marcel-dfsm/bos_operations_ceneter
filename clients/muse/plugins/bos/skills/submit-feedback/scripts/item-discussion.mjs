// Closed feedback-item facade. Authentication, discovery custody and storage are
// supplied by the trusted host; no network, credential or filesystem API here.
import Ajv from "../../bos-workflow-orchestrator/scripts/vendor/ajv2020.bundle.mjs";

const methods = ["getFeedbackDiscussionCapabilities", "captureExecutionScope", "verifyFeedbackDiscussionIntent",
  "openAuthenticatedFeedbackDiscussion", "getFeedbackDiscussionStore"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const safe = (value, maximum = 160) => typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\p{Cc}\p{Cf}]/u.test(value);
const clone = value => structuredClone(value);
const fail = () => {throw new Error("Feedback discussion unavailable or invalid; retain current-item recovery.");};
export class FeedbackDiscussionTransportError extends Error {
  constructor() {super("Feedback discussion transport interrupted");}
}
const eventKey = (stream, eventId) => `${stream}:${eventId}`;

export function parseDiscussionFrame(text, maximum) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > maximum) fail();
  // A small structural scanner detects duplicate escaped/unescaped object keys
  // before JSON.parse can overwrite them. Syntax remains checked by JSON.parse.
  let at = 0;
  const whitespace = () => {while (/\s/u.test(text[at] ?? "") && at < text.length) at++;};
  const string = () => {
    const match = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
    match.lastIndex = at; const value = match.exec(text); if (!value) fail(); at = match.lastIndex; return JSON.parse(value[0]);
  };
  const value = depth => {
    if (depth > 8) fail(); whitespace();
    if (text[at] === '"') {string(); return;}
    if (text[at] === "{" || text[at] === "[") {
      const object = text[at++] === "{"; const end = object ? "}" : "]", keys = new Set(); whitespace();
      if (text[at] === end) {at++; return;}
      while (true) {
        whitespace(); if (object) {const key = string(); if (keys.has(key)) fail(); keys.add(key); whitespace(); if (text[at++] !== ":") fail();}
        value(depth + 1); whitespace(); const next = text[at++]; if (next === end) return; if (next !== ",") fail();
      }
    }
    const match = /(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;
    match.lastIndex = at; if (!match.exec(text)) fail(); at = match.lastIndex;
  };
  value(0); whitespace(); if (at !== text.length) fail(); return JSON.parse(text);
}

function compile(schema) {
  let count = 0;
  const inspect = value => {
    if (++count > 10000) fail();
    if (value && typeof value === "object") for (const [key, row] of Object.entries(value)) {
      if (key === "$ref" && (typeof row !== "string" || !row.startsWith("#"))) fail(); inspect(row);
    }
  };
  inspect(schema);
  return new Ajv({strict: false, validateFormats: false, allErrors: false}).compile(schema);
}

export async function getFeedbackDiscussionCapabilities(host) {
  if (methods.some(method => typeof host?.[method] !== "function")) return {available: false};
  const actual = await host.getFeedbackDiscussionCapabilities();
  return {available: actual?.authenticatedItemSocket === true && actual?.protectedAtomicQueue === true};
}

export async function createFeedbackDiscussion({host, discovery, itemRef, taskRef, signal, policy = {maxConnections: 3, maxPending: 200}}) {
  if (!(await getFeedbackDiscussionCapabilities(host)).available) return Object.freeze({available: false});
  if (!safe(itemRef) || !safe(taskRef) || !Number.isSafeInteger(policy.maxConnections) || policy.maxConnections < 1 || policy.maxConnections > 5 ||
      !Number.isSafeInteger(policy.maxPending) || policy.maxPending < 1 || policy.maxPending > 500) fail();
  discovery = clone(discovery);
  const contract = discovery?.discussion;
  if (!contract || !Array.isArray(discovery.operations) || !["feedback.get", "comments.create"].every(operation => discovery.operations.some(row => row.operation_id === operation))) return Object.freeze({available: false});
  if (contract.authentication !== "existing_bearer_and_context_headers" || contract.supported_host !== "native_header_capable_websocket" ||
      !Array.isArray(contract.headers) || contract.headers.length !== 2 || !["Authorization", "X-BOS-Context-Handle"].every(header => contract.headers.includes(header))) fail();
  // URI is never expanded/opened here. The trusted host validates its exact
  // current discovery provenance and owns origin/header binding atomically.
  if (typeof contract.uri_template !== "string" || /[?#@]/u.test(contract.uri_template)) fail();
  const limits = contract.limits;
  for (const [key, maximum] of Object.entries({max_frame_bytes: 16384, page_size: 50, max_delivery_bytes: 1048576, max_connection_seconds: 300, max_commands: 120})) {
    if (!Number.isSafeInteger(limits?.[key]) || limits[key] < 1 || limits[key] > maximum) fail();
  }
  const scope = await host.captureExecutionScope(); if (typeof scope !== "function") fail();
  let stopped = false, channel = null, subscribed = false, connections = 0, commands = 0, comment = "none", resyncRequired = false;
  const guard = async () => {if (stopped || signal?.aborted || await scope() !== true) {stopped = true; await channel?.close(); fail();}};
  const verify = async (kind, payload) => {
    await guard();
    if (await host.verifyFeedbackDiscussionIntent({kind, discovery: clone(discovery), itemRef, taskRef, ...(payload === undefined ? {} : {payload: clone(payload)})}) !== true) {stopped = true; await channel?.close(); fail();}
    await guard();
  };
  await verify("read");
  const input = compile(contract.input_schema), output = compile(contract.output_schema);
  const store = await host.getFeedbackDiscussionStore({itemRef, taskRef});
  if (typeof store?.load !== "function" || typeof store?.commit !== "function") fail();
  const load = async () => {
    await guard(); const value = await store.load(); await guard();
    if (!value || value.itemRef !== itemRef || value.taskRef !== taskRef || !Number.isSafeInteger(value.version) || value.version < 0 ||
        !(value.cursor === null || safe(value.cursor)) || !Array.isArray(value.pending) || value.pending.length > policy.maxPending ||
        !Array.isArray(value.seen) || value.seen.length > 1000 || value.seen.some(id => !/^(comments|history):[0-9a-f-]{36}$/iu.test(id)) ||
        value.pending.some(row => !["comments", "history"].includes(row.stream) || !uuid.test(row.event?.event_id))) fail();
    return clone(value);
  };
  let writing = Promise.resolve();
  const update = change => {
    const operation = writing.then(async () => {
      const before = await load(), after = change(clone(before)); await guard();
      if (await store.commit(before.version, {...after, version: before.version + 1}) !== true) fail(); await guard();
    });
    writing = operation.catch(() => {}); return operation;
  };
  const send = async frame => {
    if (!input(frame)) fail(); await verify(frame.type === "comment" ? "comments.create" : "read", frame);
    if (!channel || commands >= limits.max_commands) fail(); commands++;
    const bytes = JSON.stringify(frame); if (new TextEncoder().encode(bytes).length > limits.max_frame_bytes) fail();
    await channel.send(bytes); await guard();
  };
  const session = {
    available: true,
    async submitComment({body, parent_comment_id} = {}) {
      if (!["none", "committed"].includes(comment) || !subscribed || resyncRequired || !channel || typeof body !== "string" || body.length < 1 || body.length > 4000 ||
          (parent_comment_id !== undefined && parent_comment_id !== null && !uuid.test(parent_comment_id))) fail();
      comment = "awaiting_commit";
      try {await send({type: "comment", body, ...(parent_comment_id === undefined ? {} : {parent_comment_id})});}
      catch {comment = "uncertain"; throw new Error("Comment outcome uncertain; read current item before any retry.");}
      return {status: "awaiting_commit"};
    },
    commentStatus() {return {status: comment};},
    async pending() {await verify("read"); return (await load()).pending;},
    async acknowledge({stream, eventId}) {
      if (!["comments", "history"].includes(stream) || !uuid.test(eventId)) fail();
      await verify("consume", {stream, eventId});
      await update(state => ({...state, pending: state.pending.filter(row => !(row.stream === stream && row.event.event_id === eventId))}));
    },
    async resumeAfterCurrentRead() {
      // Host must attest actual feedback.get plus required history paging, with
      // current authority. This never acknowledges pending consumer work.
      await verify("resync_current_item");
      await update(state => ({...state, cursor: null})); resyncRequired = false;
    },
    async close() {stopped = true; await channel?.close();},
    async run() {
      await verify("read");
      if (channel || resyncRequired || connections >= policy.maxConnections) return {next: resyncRequired ? "resync_current_item" : "stop"};
      connections++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), limits.max_connection_seconds * 1000); timer.unref?.();
      const stop = () => controller.abort(); signal?.addEventListener("abort", stop, {once: true});
      let next = "reconnect", reconnectCursor;
      try {
        channel = await host.openAuthenticatedFeedbackDiscussion({discovery: clone(discovery), itemRef, taskRef, signal: controller.signal});
        if (typeof channel?.send !== "function" || typeof channel?.close !== "function" || typeof channel?.messages?.[Symbol.asyncIterator] !== "function") fail();
        commands = 0; subscribed = false;
        controller.signal.addEventListener("abort", () => {void channel?.close();}, {once: true});
        const state = await load(); await send({type: "subscribe", ...(state.cursor === null ? {} : {cursor: state.cursor})});
        for await (const raw of channel.messages) {
          await verify("read"); if (controller.signal.aborted) break;
          const frame = parseDiscussionFrame(raw, limits.max_delivery_bytes);
          if (!output(frame)) fail();
          if (["journal", "ack", "gap"].includes(frame.type) && frame.feedback_id !== itemRef) fail();
          if (frame.type === "journal") {
            if (!safe(frame.cursor) || !Array.isArray(frame.comments) || !Array.isArray(frame.history) ||
                frame.comments.length > limits.page_size || frame.history.length > limits.page_size || typeof frame.earlier_history !== "boolean") fail();
            for (const event of [...frame.comments, ...frame.history]) if (!uuid.test(event.event_id)) fail();
            await update(state => {
              for (const stream of ["comments", "history"]) for (const event of frame[stream]) {
                const key = eventKey(stream, event.event_id);
                if (!state.seen.includes(key) && !state.pending.some(row => row.stream === stream && row.event.event_id === event.event_id)) {
                  state.pending.push({stream, event: clone(event)}); state.seen.push(key);
                }
              }
              if (state.pending.length > policy.maxPending) throw new Error("Feedback queue full; cursor and pending work retained.");
              state.seen = state.seen.slice(-1000); state.cursor = frame.cursor; return state;
            });
            subscribed = true;
            if (frame.earlier_history) {resyncRequired = true; next = "resync_current_item"; break;}
          } else if (frame.type === "ack") {
            if (frame.operation !== "comments.create" || frame.status !== "committed" || comment !== "awaiting_commit") fail();
            comment = "committed";
          } else if (frame.type === "gap") {resyncRequired = true; next = "resync_current_item"; break;}
          else if (frame.type === "error") {
            next = ["rate_limited", "service_unavailable"].includes(frame.code) ? "reconnect" : "stop";
            if (next === "stop") stopped = true; break;
          } else if (frame.type === "reconnect") {if (!safe(frame.cursor)) fail(); reconnectCursor = frame.cursor; break;}
          else if (frame.type !== "pong") fail();
        }
        // Reconnect hints never advance the committed journal cursor.
        await guard();
      } catch (error) {
        if (stopped || signal?.aborted) {stopped = true; next = "stop";}
        else {await guard(); next = error instanceof FeedbackDiscussionTransportError ? "reconnect" : "stop"; stopped = next === "stop";}
      } finally {
        clearTimeout(timer); signal?.removeEventListener("abort", stop);
        await channel?.close(); channel = null; subscribed = false;
        if (comment === "awaiting_commit") comment = "uncertain";
      }
      return {next: connections >= policy.maxConnections && next === "reconnect" ? "stop" : next,
        comment: comment, ...(next === "reconnect" ? {delayMs: Math.min(5000, 500 * 2 ** (connections - 1))} : {}),
        ...(reconnectCursor === undefined ? {} : {reconnectHint: true})};
    }
  };
  return Object.freeze(session);
}
