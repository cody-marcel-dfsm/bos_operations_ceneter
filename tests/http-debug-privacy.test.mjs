import assert from "node:assert/strict";
import test from "node:test";
import {createHttpDebugFetch, createProtocolDebugLogger, redactDebugValue} from "../scripts/lib/http-debug-log.mjs";

test("default HTTP diagnostics neither read nor expose private business data", async () => {
  const lines = [];
  const response = new Response(JSON.stringify({note: "synthetic-private-note"}));
  response.clone = () => { throw new Error("diagnostics must not clone private results"); };
  const request = createHttpDebugFetch(async () => response, {writer: line => lines.push(line)});
  const returned = await request("https://example.invalid/private/synthetic-id", {
    headers: {"X-BOS-Context-Handle": "bos_ctx_v2.synthetic"},
    body: JSON.stringify({message: "synthetic-private-message"})
  });
  assert.equal(returned, response);
  assert.equal((await returned.json()).note, "synthetic-private-note");
  assert.equal(lines.length, 2);
  assert.doesNotMatch(lines.join(""), /synthetic-private|bos_ctx_v2|synthetic-id/);
});

test("body tracing needs explicit synthetic-data designation", async () => {
  const lines = [];
  const request = createHttpDebugFetch(async () => new Response('{"note":"synthetic-private-note"}'), {
    includeBodies: true, writer: line => lines.push(line)
  });
  await request("https://example.invalid");
  assert.doesNotMatch(lines.join(""), /synthetic-private-note/);
});

test("private scope keys and arbitrary-key opaque handles are redacted", () => {
  const data = Object.fromEntries(["context_handle", "X-BOS-Context-Handle", "orgId", "tenantId", "userId", "roleId", "installationId"].map(key => [key, "synthetic-private-id"]));
  data.note = "before bos_ctx_v2.synthetic-private-handle after";
  const output = JSON.stringify(redactDebugValue(data));
  assert.doesNotMatch(output, /synthetic-private|bos_ctx_v2/);
});

test("opt-in headers retain only allowlisted transport fields", async () => {
  const lines = [];
  const request = createHttpDebugFetch(async () => new Response(null, {headers: {"x-note": "synthetic-private-note"}}), {
    includeHeaders: true, writer: line => lines.push(line)
  });
  await request("https://example.invalid", {headers: {"x-custom": "synthetic-private-id", "content-type": "application/json"}});
  assert.doesNotMatch(lines.join(""), /synthetic-private/);
  assert.equal(JSON.parse(lines[0]).headers["content-type"], "application/json");
});

test("protocol payloads and summaries cannot enter default diagnostics", () => {
  const lines = [];
  const logger = createProtocolDebugLogger({writer: line => lines.push(line)});
  logger.write({event: "protocol.response", payload: {note: "synthetic-private-note"}, summary: {orgId: "synthetic-private-id"}});
  assert.doesNotMatch(lines.join(""), /synthetic-private/);
});

test("oversized synthetic diagnostic streams stop at the bound and preserve caller body", async () => {
  const lines = [];
  let reads = 0;
  const oversized = new Uint8Array(20_000).fill(120);
  const stream = new ReadableStream({pull(controller) { reads++; controller.enqueue(oversized); if (reads === 3) controller.close(); }});
  const response = new Response(stream, {headers: {"content-type": "text/plain"}});
  const request = createHttpDebugFetch(async () => response, {includeBodies: true, diagnosticData: "synthetic", writer: line => lines.push(line)});
  const returned = await request("https://example.invalid");
  assert.equal(JSON.parse(lines[1]).body.value, "[REDACTED_OVERSIZED_BODY]");
  assert.equal((await returned.arrayBuffer()).byteLength, 60_000);
});

test("default failure diagnostics omit arbitrary business error text", async () => {
  const lines = [];
  const request = createHttpDebugFetch(async () => { throw new Error("synthetic-private-business-text"); }, {writer: line => lines.push(line)});
  await assert.rejects(request("https://example.invalid"));
  assert.doesNotMatch(lines.join(""), /synthetic-private-business-text/);
});
