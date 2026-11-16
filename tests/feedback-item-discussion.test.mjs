import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {createFeedbackDiscussion, getFeedbackDiscussionCapabilities, parseDiscussionFrame, FeedbackDiscussionTransportError} from "../source/platform/submit-feedback/scripts/item-discussion.mjs";

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const closed = properties => ({type: "object", additionalProperties: false, required: Object.keys(properties), properties});
const text = {type: "string"};
function discovery() {
  const event = closed({event_id: text});
  return {operations: [{operation_id: "feedback.get"}, {operation_id: "comments.create"}], discussion: {
    uri_template: "/synthetic/feedback/{feedback_id}/discussion", authentication: "existing_bearer_and_context_headers",
    headers: ["Authorization", "X-BOS-Context-Handle"], supported_host: "native_header_capable_websocket",
    input_schema: {oneOf: [
      {type: "object", additionalProperties: false, required: ["type"], properties: {type: {const: "subscribe"}, cursor: text}},
      {type: "object", additionalProperties: false, required: ["type", "body"], properties: {type: {const: "comment"}, body: text, parent_comment_id: {type: ["string", "null"]}}}
    ]},
    output_schema: {oneOf: [
      closed({type: {const: "journal"}, feedback_id: text, cursor: text, comments: {type: "array", items: event}, history: {type: "array", items: event}, earlier_history: {type: "boolean"}}),
      closed({type: {const: "ack"}, operation: {const: "comments.create"}, feedback_id: text, status: {const: "committed"}}),
      closed({type: {const: "gap"}, feedback_id: text, cursor: text, recovery_operation: {const: "feedback.get"}}),
      closed({type: {const: "error"}, code: text}), closed({type: {const: "reconnect"}, cursor: text}), closed({type: {const: "pong"}})
    ]}, limits: {max_frame_bytes: 16384, page_size: 50, max_delivery_bytes: 1048576, max_connection_seconds: 1, max_commands: 120}
  }};
}
const journal = (cursor, comments = [], history = []) => ({type: "journal", feedback_id: "item_demo", cursor,
  comments: comments.map(event_id => ({event_id})), history: history.map(event_id => ({event_id})), earlier_history: false});
async function setup(frames = [], options = {}) {
  let state = {itemRef: "item_demo", taskRef: "task_demo", version: 0, cursor: null, pending: [], seen: []};
  let current = true, allowed = true, sends = [], opens = 0, closes = 0, session;
  const store = {load: async () => structuredClone(state), commit: async (expected, next) => {
    if (options.failCommit || state.version !== expected) return false; state = structuredClone(next); return true;
  }};
  const host = {getFeedbackDiscussionCapabilities: async () => ({authenticatedItemSocket: true, protectedAtomicQueue: true}),
    captureExecutionScope: async () => async () => current,
    verifyFeedbackDiscussionIntent: async () => allowed,
    getFeedbackDiscussionStore: async () => store,
    openAuthenticatedFeedbackDiscussion: async request => {opens++; assert(!Object.hasOwn(request, "headers")); assert(!Object.hasOwn(request, "url"));
      return {send: async frame => {sends.push(JSON.parse(frame)); await options.onSend?.(session, JSON.parse(frame));},
        close: async () => {closes++;}, messages: (async function* () {
          for (const frame of frames) {if (typeof frame === "function") {await frame({session, revoke: () => {current = false;}, deny: () => {allowed = false;}}); continue;}
            if (frame instanceof Error) throw frame; yield typeof frame === "string" || frame instanceof Uint8Array ? frame : JSON.stringify(frame);}
        })()};}
  };
  session = await createFeedbackDiscussion({host, discovery: options.discovery ?? discovery(), itemRef: "item_demo", taskRef: "task_demo",
    ...(options.policy ? {policy: options.policy} : {})});
  return {session, host, state: () => structuredClone(state), sends: () => sends, opens: () => opens, closes: () => closes};
}

test("unsupported host or missing current discovery capability never opens a socket", async () => {
  assert.deepEqual(await getFeedbackDiscussionCapabilities({}), {available: false});
  assert.equal((await createFeedbackDiscussion({host: {}})).available, false);
  const absent = discovery(); delete absent.discussion;
  const f = await setup([], {discovery: absent}); assert.equal(f.session.available, false); assert.equal(f.opens(), 0);
  const missing = discovery(); missing.operations.pop(); assert.equal((await setup([], {discovery: missing})).session.available, false);
});
test("journals atomically queue/deduplicate per stream with cursor; consumer ack is explicit and exact", async () => {
  const f = await setup([journal("c1", [id(1)], [id(1)]), journal("c2", [id(1), id(2)])]);
  assert.equal((await f.session.run()).next, "reconnect");
  assert.deepEqual(f.sends(), [{type: "subscribe"}]); assert.equal(f.state().cursor, "c2");
  assert.equal((await f.session.pending()).length, 3);
  await f.session.acknowledge({stream: "comments", eventId: id(1)});
  assert.equal((await f.session.pending()).length, 2);
  assert(f.state().pending.some(row => row.stream === "history" && row.event.event_id === id(1)));
  assert(f.state().pending.some(row => row.event.event_id === id(2)));
});
test("queue overflow or failed atomic commit retains prior pending work and cursor", async () => {
  const f = await setup([journal("c1", [id(1)]), journal("c2", [id(2)])], {policy: {maxConnections: 3, maxPending: 1}});
  assert.equal((await f.session.run()).next, "stop"); assert.equal(f.state().cursor, "c1"); assert.equal(f.state().pending.length, 1);
  const failed = await setup([journal("c1", [id(1)])], {failCommit: true}); await failed.session.run();
  assert.equal(failed.state().cursor, null); assert.equal(failed.state().pending.length, 0);
});
test("gap/earlier history require host-attested current read and preserve queued events", async () => {
  const f = await setup([journal("c1", [id(1)]), {type: "gap", feedback_id: "item_demo", cursor: "c2", recovery_operation: "feedback.get"}]);
  assert.equal((await f.session.run()).next, "resync_current_item"); assert.equal(f.state().cursor, "c1");
  assert.equal((await f.session.run()).next, "resync_current_item");
  await f.session.resumeAfterCurrentRead(); assert.equal(f.state().cursor, null); assert.equal(f.state().pending.length, 1);
  const frame = journal("tail", [id(1)]); frame.earlier_history = true;
  assert.equal((await (await setup([frame])).session.run()).next, "resync_current_item");
});
test("cross-item data, changed scope and newly denied discovery never reach the queue", async () => {
  const wrong = journal("c1", [id(1)]); wrong.feedback_id = "another_item";
  for (const frames of [[wrong], [({revoke}) => revoke(), journal("c1", [id(1)])], [({deny}) => deny(), journal("c1", [id(1)])]]) {
    const f = await setup(frames); assert.equal((await f.session.run()).next, "stop"); assert.equal(f.state().pending.length, 0); assert(f.closes() > 0);
  }
});
test("only canonical committed ack reports saved comment; missing ack stays uncertain with no replay", async () => {
  let submitted;
  const submit = async ({session}) => {submitted = await session.submitComment({body: "Synthetic discussion"});};
  const f = await setup([journal("ready"), submit, {type: "ack", operation: "comments.create", feedback_id: "item_demo", status: "committed"}]);
  await f.session.run(); assert.deepEqual(submitted, {status: "awaiting_commit"}); assert.equal(f.session.commentStatus().status, "committed");
  const missing = await setup([journal("ready"), submit]); await missing.session.run(); assert.equal(missing.session.commentStatus().status, "uncertain");
  await missing.session.run(); assert.equal(missing.sends().filter(row => row.type === "comment").length, 1);
});
test("bounded transient reconnect resumes committed cursor; reconnect hints cannot advance it", async () => {
  const f = await setup([journal("saved", [id(1)]), new FeedbackDiscussionTransportError()], {policy: {maxConnections: 2, maxPending: 20}});
  assert.deepEqual(await f.session.run(), {next: "reconnect", comment: "none", delayMs: 500});
  assert.equal((await f.session.run()).next, "stop"); assert.equal(f.sends()[1].cursor, "saved");
  assert.equal((await f.session.run()).next, "stop"); assert.equal(f.opens(), 2);
  const hint = await setup([{type: "reconnect", cursor: "not_committed"}]); await hint.session.run(); assert.equal(hint.state().cursor, null);
});
test("duplicate-key, binary, malformed and oversized frames fail without accepting data", async () => {
  for (const raw of ['{"type":"pong","ty\\u0070e":"pong"}', new Uint8Array([123]), '{', 'x'.repeat(1048577)]) {
    const f = await setup([raw]); assert.equal((await f.session.run()).next, "stop"); assert.equal(f.state().pending.length, 0);
  }
  assert.throws(() => parseDiscussionFrame('{"a":{"b":1,"b":2}}', 100));
  assert.deepEqual(parseDiscussionFrame('{"type":"pong"}', 100), {type: "pong"});
});
test("actual returned schemas enforce closed frames and external refs/unsafe descriptor cannot enter", async () => {
  const f = await setup([{type: "pong", arbitrary: true}]); assert.equal((await f.session.run()).next, "stop");
  for (const mutate of [d => {d.discussion.input_schema = {$ref: "https://example.invalid/schema"};},
    d => {d.discussion.uri_template += "?credential=unsafe";}, d => {d.discussion.limits.max_commands = 121;}]) {
    const d = discovery(); mutate(d); await assert.rejects(setup([], {discovery: d}));
  }
});
test("all generated BOS consumers package the identical discussion facade", async () => {
  const root = new URL("../", import.meta.url).pathname;
  for (const host of ["codex/plugins", "claude/plugins", "copilot/products", "gemini/extensions", "muse/plugins"]) {
    const base = join(root, "clients", host, "bos/skills/submit-feedback");
    for (const file of ["scripts/item-discussion.mjs", "references/item-discussion.md"]) {
      assert.equal(await readFile(join(base, file), "utf8"), await readFile(join(root, "source/platform/submit-feedback", file), "utf8"));
    }
    const runtime = await import(pathToFileURL(join(base, "scripts/item-discussion.mjs")));
    assert.equal((await runtime.createFeedbackDiscussion({host: {}})).available, false);
  }
});
