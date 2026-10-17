import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp, writeFile, rm, symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {validateNotificationWireTranscript, readBoundedJson, maxTranscriptBytes, syntheticIdentity, wireContract,
  sealedResource} from "../scripts/verify-notification-transport.mjs";
import {runLiveNotificationAcceptance, requireClientOnlyFixture} from "../scripts/lib/notification-transport-live.mjs";
import {digest} from "../scripts/marketplace-prompt-catalog.mjs";
import {notificationFixture, ready, changed, encodeFrame} from "./helpers/synthetic-notifications.mjs";
import {syntheticAppDescribe} from "./helpers/synthetic-bos-discovery-service.mjs";

const tuple = {source_revision: "a".repeat(40), server_revision: "synthetic-candidate-0001", image_digest: "sha256:" + "b".repeat(64)};
const observation = () => ({contract: wireContract, base_url: "https://candidate.example.invalid", identity: syntheticIdentity,
  descriptor: notificationFixture().contract, resume_cursor: "nc_baseline", streams: [
    {frames: [encodeFrame(ready([syntheticIdentity])), encodeFrame(changed(syntheticIdentity, "nc_change"))]},
    {frames: [encodeFrame(ready([syntheticIdentity], null)), encodeFrame(changed(syntheticIdentity, "nc_change"))]}],
  state_refetch: {http_status: 200, identity: syntheticIdentity, status: "awaiting_client"}, ...tuple});

test("captured candidate wire passes the existing parser and full discovered frame validator", async () => {
  const receipt = await validateNotificationWireTranscript(observation());
  assert.equal(receipt.status, "PASS"); assert.equal(receipt.frame_count, 4);
  assert.equal(receipt.mode, "captured_wire"); assert.equal(receipt.boc_native_authentication_proven, false);
  assert.equal(receipt.native_host_wake_proven, false);
  assert.equal(receipt.checks.contract_facts_projection, true);
  assert.equal(JSON.stringify(receipt).includes("state_action"), false);
});

for (const [name, change] of [
  ["foreign identity", value => {value.identity = "other";}],
  ["extra retained credential", value => {value.authorization = "redacted-test";}],
  ["retained private comment", value => {value.streams[0].frames[0] = ": private metadata\n" + value.streams[0].frames[0];}],
  ["foreign replay id", value => {value.streams[1].frames[1] = encodeFrame(changed(syntheticIdentity, "nc_other"));}],
  ["fresh cursor in resumed ready", value => {value.streams[1].frames[0] = encodeFrame(ready([syntheticIdentity]));}],
  ["wrong resume cursor", value => {value.resume_cursor = "nc_other";}],
  ["missing committed change", value => {value.streams[0].frames.pop();}],
  ["unbound state href", value => {const frame = ready([syntheticIdentity]); frame.data.journeys[0].state_action.href += "?token=private"; value.streams[0].frames[0] = encodeFrame(frame);}],
  ["undeclared event field", value => {value.streams[0].frames[0] += "retry: 10\n\n";}],
  ["signed state summary", value => {value.state_refetch.action = {};}],
  ["failed HTTP state observation", value => {value.state_refetch.http_status = 403;}],
  ["oversized frame", value => {value.streams[0].frames[0] = "x".repeat(65537);}],
  ["excessive raw frames", value => {value.streams[0].frames = Array(9).fill(": keepalive\n\n");}],
  ["excessive parsed frames in one raw string", value => {value.streams[0].frames = [value.streams[0].frames[0] + value.streams[0].frames[1].repeat(8)];}],
  ["contradictory descriptor schema", value => {value.descriptor.output_schema.oneOf[0].properties.event.const = "other";}],
  ["unbounded input", value => {value.padding = "x".repeat(maxTranscriptBytes);}],
  ["credential-bearing deployment URL", value => {value.base_url = "https://user:secret@candidate.example.invalid";}]
]) test(`captured wire rejects ${name}`, async () => {const value = observation(); change(value); await assert.rejects(validateNotificationWireTranscript(value));});

test("bounded JSON reader rejects oversized files, symlinks and invalid UTF-8", async t => {
  const directory = await mkdtemp(join(tmpdir(), "boc-wire-reader-")); t.after(() => rm(directory, {recursive: true, force: true}));
  const file = join(directory, "wire.json"); await writeFile(file, JSON.stringify(observation()));
  assert.equal((await readBoundedJson(file)).document.identity, syntheticIdentity);
  await symlink(file, join(directory, "link.json")); await assert.rejects(readBoundedJson(join(directory, "link.json")));
  await writeFile(file, Buffer.alloc(maxTranscriptBytes + 1)); await assert.rejects(readBoundedJson(file));
  await writeFile(file, Buffer.from([0x22, 0xff, 0x22])); await assert.rejects(readBoundedJson(file));
});

const clientDocument = () => ({identity: syntheticIdentity, name: "Synthetic notification transport acceptance", inputs: {}, entry: "observe",
  nodes: [{code: "observe", type: "client", instruction: {goal: "observe_notifications", message: "Complete the bounded synthetic transport observation."},
    inputs: {}, outputs: {}, terminal: true}]});
test("live acceptance only permits one terminal empty-input/output client node", () => {
  requireClientOnlyFixture(clientDocument());
  for (const mutate of [value => {value.nodes[0].type = "server";}, value => {value.bootstrap = {};},
    value => {value.nodes[0].instruction.action = {};}, value => {value.nodes[0].inputs.target = "provider";},
    value => {value.nodes[0].terminal = false;}]) {
    const document = clientDocument(); mutate(document); assert.throws(() => requireClientOnlyFixture(document));
  }
});

async function liveFixture(t, {wrongScope = false, wrongReplay = false, revocationFails = false, missingAuthority = false, foreignAction = false, writeGetter = false} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "boc-notification-live-")); t.after(() => rm(directory, {recursive: true, force: true}));
  const document = clientDocument(), authority = {schema: "synthetic-reviewer-authority/v1", synthetic_only: true,
    reviewer_login_url: "https://dfsm.ai/synthetic-reviewer", review_organization: "Synthetic acceptance", review_application: "LeadDirector",
    review_installation: "Synthetic installation", review_role: "Director", allowed_effects: ["read", "write"],
    effect_bindings: missingAuthority ? {} : {"notification-transport": {operation: "lead-director.journeys.register", effect: "write", input_sha256: digest(document)}}};
  const authorityPath = join(directory, "authority.json"), authorityBytes = JSON.stringify(authority);
  await writeFile(authorityPath, authorityBytes);
  const configPath = join(directory, "config.json"), boslPath = join(directory, "bosl.json");
  await writeFile(configPath, JSON.stringify({...authority, fixture_authority_file: authorityPath,
    fixture_authority_sha256: createHash("sha256").update(authorityBytes).digest("hex")}));
  await writeFile(boslPath, JSON.stringify(document));
  const handle = "bos_ctx_v2_" + "c".repeat(64), app = syntheticAppDescribe(), appUri = "bos://apps/lead-director/app.describe";
  const registration = JSON.parse(await readFile(new URL("./fixtures/journey-registration-contract.json", import.meta.url), "utf8"));
  registration.execution.uri = "/bos/apps/lead-director/api/v1/organizations/synthetic/journeys/register";
  const descriptor = notificationFixture().contract, requests = []; let opens = 0, closed = 0, subscriptions = 0, started = false, completed = false;
  const statePath = ready([syntheticIdentity]).data.journeys[0].state_action.href;
  const action = verb => ({verb, method: verb === "state" ? "GET" : "POST", href: statePath + (verb === "state" ? "" : "/" + verb) + (verb === "state" ? "" : "?capability=synthetic"), payload_schema: null});
  const awaiting = () => ({identity: syntheticIdentity, status: "awaiting_client", current_step: {code: "observe", type: "client"}, instruction: {
    ...document.nodes[0].instruction, after_success: {...action("complete"), ...(foreignAction ? {href: "/bos/foreign/complete?capability=synthetic"} : {})},
    on_failure: {...action("failed"), payload_schema: {type: "object", required: ["code", "message"], properties: {code: {enum: ["user_stopped"]}, message: {type: "string"}}, additionalProperties: false}}}});
  const json = value => new Response(JSON.stringify(value), {headers: {"content-type": "application/json"}});
  const session = {rpc: async (method, params) => {
    if (method === "tools/list") return {tools: ["bos_get_context", "bos_list_context_tools", "bos_execute"].map(name => ({name}))};
    if (method === "resources/list") return {context_handle: handle, resources: [{name: "app.describe", uri: appUri}]};
    if (method === "resources/read") return {contents: [{uri: params.uri, mimeType: "application/json", text: JSON.stringify(params.uri === appUri ? app : registration.input_schema)}]};
    if (params.name === "bos_get_context") return {structuredContent: {contract_version: "bos-identity-mcp/v2", contexts: [{context_handle: handle,
      organization_name: wrongScope ? "Other synthetic" : authority.review_organization, application_name: authority.review_application,
      installation_name: authority.review_installation, role_label: authority.review_role}]}};
    if (params.name === "bos_list_context_tools") return {tools: [{name: "api.contract.get", _meta: {"bos/effect": writeGetter ? "write" : "read"}, inputSchema: {type: "object", properties: {operation: {enum: ["lead-director.journeys.register", "journeys.notifications.subscribe"]}}, required: ["operation"], additionalProperties: false}}]};
    if (params.name === "bos_execute") return params.arguments.arguments.operation === descriptor.operation ? descriptor : registration;
    throw new Error("unexpected synthetic RPC");
  }, request: async (href, init) => {
    const url = new URL(href); assert.equal(url.origin, new URL(sealedResource).origin);
    assert.equal(init.headers["X-BOS-Context-Handle"], handle); assert.equal(init.headers.authorization, undefined);
    requests.push({href, method: init.method});
    if (url.pathname.endsWith("/journeys/register")) return json({compiled: true, identity: syntheticIdentity, actions: {start: action("start")}});
    if (url.pathname.endsWith("/journey-notifications")) {
      subscriptions++; assert.equal(url.searchParams.get("identity"), syntheticIdentity);
      if (subscriptions === 2) assert.equal(init.headers["Last-Event-ID"], "nc_baseline");
      let count = 0;
      return new Response(new ReadableStream({pull(controller) {
        if (count === 0) {count++; controller.enqueue(new TextEncoder().encode(encodeFrame(ready([syntheticIdentity], subscriptions === 1 ? "nc_baseline" : null))));}
        else if (count === 1) {assert.equal(started, true); count++; controller.enqueue(new TextEncoder().encode(encodeFrame(changed(syntheticIdentity, wrongReplay && subscriptions === 2 ? "nc_wrong" : "nc_change"))));}
        else controller.close();
      }}, {highWaterMark: 0}), {headers: {"content-type": "text/event-stream"}});
    }
    if (url.pathname.endsWith("/start")) {started = true; return json(awaiting());}
    if (url.pathname.endsWith("/complete")) {completed = true; return json({identity: syntheticIdentity, status: "step_completed", action: action("step")});}
    if (url.pathname.endsWith("/failed")) return json({identity: syntheticIdentity, status: "failed", error: {code: "USER_STOPPED", message: "Stopped.", retryable: false, correlation_id: "synthetic-correlation", details: []}});
    if (url.pathname.endsWith("/step")) return json({identity: syntheticIdentity, status: "completed", outcome: {}});
    if (url.pathname === statePath) return json(awaiting());
    throw new Error("unexpected synthetic HTTP request");
  }, close: async () => {closed++; if (revocationFails) throw new Error("synthetic revoke failure");}};
  const result = await runLiveNotificationAcceptance({configPath, boslPath, sourceRevision: tuple.source_revision,
    serverRevision: tuple.server_revision, imageDigest: tuple.image_digest}, {openSession: async () => {opens++; return session;},
    publishedPrerequisite: async () => ({version: "0.4.200", release_commit: "d".repeat(40), package_sha256: "e".repeat(64)})});
  return {result, requests, opens, closed, completed};
}

test("bounded reviewer runner discovers, watches before Start, replays, refetches and completes only its synthetic client", async t => {
  const value = await liveFixture(t); assert.equal(value.result.status, "PASS", JSON.stringify(value.result));
  assert.equal(value.closed, 1); assert.equal(value.completed, true);
  assert.equal(value.result.checks.authoritative_state_refetch, true);
  assert.equal(value.result.checks.contract_facts_projection, true);
  assert.equal(value.requests.filter(row => row.href.includes("/journey-notifications")).length, 2);
  assert.equal(JSON.stringify(value.result).includes("bos_ctx"), false);
  assert.equal(JSON.stringify(value.result).includes("capability="), false);
});
test("missing exact effect authority prevents any session or mutation", async t => {
  const value = await liveFixture(t, {missingAuthority: true}); assert.equal(value.result.status, "INCOMPLETE"); assert.equal(value.opens, 0); assert.equal(value.requests.length, 0);
});
test("wrong reviewer scope prevents business requests and revokes the isolated session", async t => {
  const value = await liveFixture(t, {wrongScope: true}); assert.equal(value.result.status, "INCOMPLETE"); assert.equal(value.requests.length, 0); assert.equal(value.closed, 1);
});
test("contradictory discovered contract getter effect prevents invocation and mutation", async t => {
  const value = await liveFixture(t, {writeGetter: true}); assert.equal(value.result.status, "INCOMPLETE"); assert.equal(value.requests.length, 0); assert.equal(value.closed, 1);
});
test("replay mismatch remains incomplete and uses only its returned failure cleanup", async t => {
  const value = await liveFixture(t, {wrongReplay: true}); assert.equal(value.result.status, "INCOMPLETE");
  assert.equal(value.completed, false); assert.equal(value.result.cleanup, "failed"); assert.equal(value.closed, 1);
});
test("foreign continuation action is rejected before transport", async t => {
  const value = await liveFixture(t, {foreignAction: true}); assert.equal(value.result.status, "INCOMPLETE");
  assert.equal(value.requests.some(row => row.href.includes("/bos/foreign")), false); assert.equal(value.closed, 1);
});
test("revocation failure prevents a live PASS after successful transport", async t => {
  const value = await liveFixture(t, {revocationFails: true}); assert.equal(value.result.status, "INCOMPLETE"); assert.equal(value.result.reason, "reviewer_grant_revocation_failed");
});
