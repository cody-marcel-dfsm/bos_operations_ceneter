import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {
  buildIdentityV2JourneyActionRequest, interpretJourneyResponse,
  runJourneyRecovery, validateJourneyEnvelope
} from "../source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs";

// Independent public consumer specimens; no live producer, quota accounting,
// provider preparation, tier assignment or sibling source is exercised.
const identity = "synthetic policy continuation";
const expiry = "2099-01-02T00:00:00Z";
const context = "bos_ctx_v2_" + "a".repeat(64);
const prefix = "/bos/apps/example/api/v1/organizations/synthetic/journeys/policy";
const action = verb => ({verb, method: verb === "state" ? "GET" : "POST",
  href: `${prefix}/${verb}?capability=synthetic`, payload_schema: null});
const error = (code, retryable = false) => ({code, message: "Review the current workflow state.",
  retryable, correlation_id: "corr_synthetic", details: []});
const transportError = (code, http_status = 409, retryable = false) =>
  ({http_status, body: {error: error(code, retryable)}});
const reset = (expires_at = null) => ({http_status: 200, body: {
  identity, status: "failed", error: error("CALLBACK_PROFILE_RESET", true),
  failed_at: "2099-01-01T00:00:00Z", expires_at,
  receipt: {summary: "Consumer-owned synthetic original-attempt observation"}
}});
const progress = () => ({http_status: 202, body: {identity, status: "in_progress",
  current_node: {code: "original_effect", type: "server", operation: "fixture.original-effect"},
  retry_after_seconds: 1, action: action("state")}});

async function fixture(t, handler) {
  const requests = [], failures = [];
  const server = createServer(async (req, res) => {
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      const request = {method: req.method, href: req.url, body,
        context: req.headers["x-bos-context-handle"]};
      requests.push(request);
      const response = await handler(request);
      res.writeHead(response.http_status, {"content-type": "application/json"});
      res.end(JSON.stringify(response.body));
    } catch (failure) {
      failures.push(failure);
      res.writeHead(500, {"content-type": "application/json"});
      res.end(JSON.stringify({error: error("FIXTURE_FAILURE")}));
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.deepEqual(failures, []);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const invoke = async request => {
    const response = await fetch(origin + request.href, request);
    return {http_status: response.status, body: await response.json()};
  };
  return {requests, invoke};
}

test("the exact409 Start limit envelope carries no invented usage or action", () => {
  const response = transportError("CALLBACK_LIMIT_REACHED");
  const decision = interpretJourneyResponse(response);
  assert.equal(decision.next, "callback_error");
  assert.equal(decision.error.code, "CALLBACK_LIMIT_REACHED");
  assert.equal(Object.hasOwn(decision, "usage"), false);
  assert.equal(Object.hasOwn(decision, "action"), false);
});

test("returned409 usage remains validated and legacy429 still requires accounting", () => {
  const response = transportError("CALLBACK_LIMIT_REACHED");
  response.body.usage = [{resource: "registrations", scope: "organization", visibility: "visible",
    used: 3, limit: 3, remaining: 0, reserved_by_submission: 0}];
  assert.deepEqual(interpretJourneyResponse(response).usage, response.body.usage);
  response.body.usage[0].remaining = 2;
  assert.throws(() => interpretJourneyResponse(response), /remaining/);
  assert.throws(() => interpretJourneyResponse(transportError("CALLBACK_LIMIT_REACHED", 429)), /usage/);
});

test("canonical policy errors keep their exact code and create no retry or shorthand alias", async () => {
  for (const response of [transportError("CALLBACK_POLICY_CHANGED"),
    transportError("CALLBACK_POLICY_UNAVAILABLE", 503, true)]) {
    const decision = interpretJourneyResponse(response);
    assert.equal(decision.next, "callback_error");
    assert.deepEqual(decision.error, response.body.error);
    assert.equal(Object.hasOwn(decision, "action"), false);
    const result = await runJourneyRecovery(response, {
      wait: async () => assert.fail("A policy error supplies no polling instruction"),
      invoke: async () => assert.fail("A policy error supplies no successor action")
    });
    assert.equal(result, response);
  }
  assert.throws(() => interpretJourneyResponse(transportError("POLICY_CHANGED")), /identity/);
});

test("HTTP200 reset is a strict terminal lifecycle for nullable and finite expiry", () => {
  for (const expires_at of [null, expiry]) {
    const response = reset(expires_at);
    assert.equal(validateJourneyEnvelope(response.body), response.body);
    const decision = interpretJourneyResponse(response);
    assert.equal(decision.next, "terminal");
    assert.equal(decision.body, response.body);
    assert.equal(decision.body.error.retryable, true);
    assert.deepEqual(decision.body.receipt, response.body.receipt);
    assert.equal(Object.hasOwn(decision, "action"), false);
  }
});

test("reset routing retains malformed lifecycle and terminal continuation rejection", () => {
  const withAction = reset();
  withAction.body.action = action("start");
  assert.throws(() => interpretJourneyResponse(withAction), /terminal.*action/);
  const missingIdentity = reset();
  delete missingIdentity.body.identity;
  assert.throws(() => interpretJourneyResponse(missingIdentity), /identity/);
  const invalidStatus = reset();
  invalidStatus.body.status = "invented";
  assert.throws(() => interpretJourneyResponse(invalidStatus), /status/);
  assert.throws(() => interpretJourneyResponse(transportError("CALLBACK_PROFILE_RESET", 200)), /HTTP error status/);
});

test("provisional reservation renewal follows returned Start without another upload", async t => {
  const returned = {http_status: 200, body: {identity, status: "not_started",
    expires_at: expiry, action: action("start")}};
  const savedDefinition = {identity, logicalExpiry: expiry};
  // The fixture's private catalog changes without changing any effective public
  // term. Neither that revision nor a tier selector is a client request field.
  const privateCatalogRevision = Symbol("different private revision, same effective terms");
  const f = await fixture(t, request => {
    assert.equal(typeof privateCatalogRevision, "symbol");
    assert.equal(request.href, returned.body.action.href);
    assert.equal(request.method, "POST");
    assert.equal(request.body, "{}");
    assert.equal(request.context, context);
    return {http_status: 200, body: {identity, status: "completed", expires_at: expiry, outcome: {}}};
  });
  const choice = interpretJourneyResponse(returned);
  assert.equal(choice.action, returned.body.action);
  const result = await f.invoke(buildIdentityV2JourneyActionRequest(choice.action, context));
  assert.equal(interpretJourneyResponse(result).next, "terminal");
  assert.equal(result.body.expires_at, savedDefinition.logicalExpiry);
  assert.deepEqual(savedDefinition, {identity, logicalExpiry: expiry});
  assert.equal(f.requests.length, 1);
});

test("changed public terms report policy review without an implicit second registration", async t => {
  const f = await fixture(t, request => {
    assert.equal(request.href, action("start").href);
    assert.equal(request.body, "{}");
    return transportError("CALLBACK_POLICY_CHANGED");
  });
  const response = await f.invoke(buildIdentityV2JourneyActionRequest(action("start"), context));
  assert.equal(interpretJourneyResponse(response).next, "callback_error");
  await runJourneyRecovery(response, {wait: async () => assert.fail("No delay supplied"),
    invoke: async () => assert.fail("Resubmission/review/Start requires an explicit next decision")});
  assert.equal(f.requests.length, 1);
});

test("reset uncertainty observes the original attempt and later Paid supplies no old continuation", async t => {
  let originalObservation = 0, fixtureProfile = "Free";
  const f = await fixture(t, request => {
    assert.equal(request.method, "GET");
    assert.equal(request.href, action("state").href);
    assert.equal(request.body, "");
    assert.equal(request.context, context);
    if (fixtureProfile === "Free" && originalObservation++ === 0) return progress();
    return reset(expiry);
  });
  const waits = [];
  const observed = await runJourneyRecovery(progress(), {contextHandle: context,
    wait: async seconds => waits.push(seconds), invoke: f.invoke});
  assert.deepEqual(waits, [1, 1]);
  assert.equal(interpretJourneyResponse(observed).next, "terminal");
  assert.equal(observed.body.error.code, "CALLBACK_PROFILE_RESET");
  fixtureProfile = "Paid";
  const later = await f.invoke(buildIdentityV2JourneyActionRequest(action("state"), context));
  assert.equal(interpretJourneyResponse(later).next, "terminal");
  assert.deepEqual(later.body.receipt, observed.body.receipt);
  await runJourneyRecovery(later, {wait: async () => assert.fail("Reset is terminal"),
    invoke: async () => assert.fail("A later plan never supplies an old-generation successor")});
  assert.equal(f.requests.length, 3);
  assert.ok(f.requests.every(request => request.method === "GET"));
});
