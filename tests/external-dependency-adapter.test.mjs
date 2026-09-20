import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticationConditionCodes,
  BosDependencyAdapterError,
  buildAuthenticationHandoffRequest,
  createBosExternalDependencyAdapter,
  validateAuthenticationHandoffMessage
} from "../source/platform/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs";

const resource = "https://dfsm.ai/mcp/apps/bos/platform";
const handle = (character) => `bos_ctx_v2_${character.repeat(64)}`;
const context = (character = "a") => ({
  context_handle: handle(character),
  organization_name: "Example Organization",
  application_name: "Lead Director",
  installation_name: "Primary",
  role_label: "Operator",
  is_default: true
});
const contextDescriptor = (character = "a") => ({
  contract_version: "bos-identity-mcp/v2",
  context: context(character)
});
const result = (status, condition) => ({
  schema_version: "bos.authentication-handoff/v1",
  message_type: "result",
  protected_resource: resource,
  status,
  ...(condition ? { condition } : {})
});
const completeAction = {
  verb: "complete",
  method: "POST",
  href: "/api/v1/journeys/follow-up/complete",
  payload_schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["acknowledged"],
    properties: { acknowledged: { const: true } }
  }
};
const stateAction = {
  verb: "state",
  method: "GET",
  href: "/api/v1/journeys/follow-up",
  payload_schema: null
};

function adapter({
  request = async () => ({ status: 200, body: { status: "step_completed" } }),
  recoverAuthentication = async () => result("READY"),
  waitForAuthentication,
  getCurrentContext = async () => contextDescriptor(),
  getExecutionContextHeader = async () => "X-BOS-Context-Handle",
  getProtectedResource = async () => resource
} = {}) {
  return createBosExternalDependencyAdapter({
    hostTransport: { request, recoverAuthentication, waitForAuthentication, getProtectedResource },
    contextProvider: { getCurrentContext, getExecutionContextHeader }
  });
}

test("authentication handoff builder emits the exact closed wire contract", () => {
  assert.deepEqual(authenticationConditionCodes, [
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
  assert.deepEqual(buildAuthenticationHandoffRequest({
    resource,
    condition: "MCP_WWW_AUTHENTICATE",
    host_correlation: "native-1"
  }), {
    schema_version: "bos.authentication-handoff/v1",
    message_type: "request",
    protected_resource: resource,
    condition: {
      category: "authentication",
      code: "MCP_WWW_AUTHENTICATE",
      source: "protected_resource"
    },
    host_correlation: "native-1"
  });
  assert.deepEqual(buildAuthenticationHandoffRequest({
    resource,
    condition: { category: "mcp_session", code: "FUTURE_SESSION_CONDITION", source: "client_host" }
  }).condition, {
    category: "mcp_session",
    code: "FUTURE_SESSION_CONDITION",
    source: "client_host"
  });
});

test("authentication handoff validation rejects widened or private messages", () => {
  const request = buildAuthenticationHandoffRequest({ resource, condition: "MISSING_GRANT" });
  for (const invalid of [
    { ...request, protected_resource: `${resource}?tenant=private` },
    { ...request, access_token: "secret" },
    { ...request, condition: { ...request.condition, role_id: "private" } },
    { ...request, message_type: "operation" }
  ]) {
    assert.throws(() => validateAuthenticationHandoffMessage(invalid));
  }
  assert.throws(() => buildAuthenticationHandoffRequest({ resource, condition: "UNKNOWN_CODE" }), /structured condition/);
});

test("public recovery methods validate exact host wire results", async () => {
  const messages = [];
  const current = adapter({
    recoverAuthentication: async (message) => { messages.push(message); return result("HOST_ACTION_REQUIRED"); },
    waitForAuthentication: async (message) => { messages.push(message); return result("READY"); }
  });
  assert.equal((await current.recoverAuthentication({ resource, condition: "MISSING_GRANT" })).status, "HOST_ACTION_REQUIRED");
  assert.equal((await current.waitForAuthentication({ resource, condition: "MISSING_GRANT" })).status, "READY");
  assert.equal(messages.length, 2);
  assert(messages.every((message) => message.schema_version === "bos.authentication-handoff/v1"));
  await assert.rejects(
    adapter({ recoverAuthentication: async () => ({ ...result("READY"), protected_resource: "https://wrong.example/mcp" }) })
      .recoverAuthentication({ resource, condition: "MISSING_GRANT" }),
    (error) => error instanceof BosDependencyAdapterError && error.code === "INVALID_AUTHENTICATION_RESULT"
  );
});

test("identity-v2 returned and state actions attach only a fresh private context header", async () => {
  const requests = [];
  let currentContext = 0;
  const current = adapter({
    request: async (request) => {
      requests.push(structuredClone(request));
      return { status: 200, body: { status: request.method === "GET" ? "in_progress" : "step_completed" } };
    },
    getCurrentContext: async () => contextDescriptor(currentContext++ === 0 ? "a" : "b")
  });
  const complete = await current.invokeReturnedAction(completeAction, { acknowledged: true });
  const state = await current.invokeStateAction(stateAction);
  assert.deepEqual(requests, [
    {
      method: "POST",
      href: completeAction.href,
      headers: { "content-type": "application/json", "X-BOS-Context-Handle": handle("a") },
      body: JSON.stringify({ acknowledged: true })
    },
    {
      method: "GET",
      href: stateAction.href,
      headers: { "X-BOS-Context-Handle": handle("b") },
      body: undefined
    }
  ]);
  assert.equal(JSON.stringify([complete, state]).includes("bos_ctx_v2_"), false);
  assert.equal(JSON.stringify([complete, state]).includes("context_handle"), false);
});

test("identity-v2 consumes and validates the static header name published by Describe", async () => {
  const current = adapter({ getExecutionContextHeader: async () => "X-Authority" });
  await assert.rejects(
    current.invokeStateAction(stateAction),
    (error) => error instanceof BosDependencyAdapterError && error.code === "CONTEXT_UNAVAILABLE"
  );
});

test("returned action seam covers start, complete, step, and failed while state stays separate", async () => {
  const requests = [];
  const current = adapter({
    request: async (request) => {
      requests.push(request);
      return { status: 200, body: { status: "step_completed" } };
    }
  });
  for (const action of [
    { verb: "start", method: "POST", href: "/journeys/example/start", payload_schema: null },
    completeAction,
    { verb: "step", method: "POST", href: "/journeys/example/step", payload_schema: null },
    { ...completeAction, verb: "failed", href: "/journeys/example/failed" }
  ]) {
    await current.invokeReturnedAction(
      action,
      ...(action.payload_schema === null ? [] : [{ acknowledged: true }])
    );
  }
  assert.deepEqual(requests.map(({ method }) => method), ["POST", "POST", "POST", "POST"]);
  await assert.rejects(current.invokeReturnedAction(stateAction), /verb is invalid/);
  await assert.rejects(current.invokeStateAction(completeAction), /verb is invalid/);
});

test("legacy returned actions stay header-free", async () => {
  const requests = [];
  const current = adapter({
    request: async (request) => { requests.push(request); return { status: 200, body: { status: "step_completed" } }; },
    getCurrentContext: async () => ({ contract_version: "bos-identity-mcp/v1" })
  });
  await current.invokeReturnedAction(completeAction, { acknowledged: true });
  assert.deepEqual(requests[0].headers, { "content-type": "application/json" });
});

test("authentication recovery is bounded and resumes once with a newly fetched context", async () => {
  const requests = [];
  const handoffs = [];
  let requestCount = 0;
  let contextCount = 0;
  const current = adapter({
    request: async (request) => {
      requests.push(structuredClone(request));
      requestCount += 1;
      if (requestCount === 1) {
        return { status: 401, headers: { "WWW-Authenticate": "Bearer resource_metadata=redacted" }, body: { error: { code: "UNAUTHENTICATED" } } };
      }
      return { status: 200, body: { status: "step_completed" } };
    },
    recoverAuthentication: async (message) => {
      handoffs.push(message);
      return { ...result("HOST_ACTION_REQUIRED"), host_correlation: "native-auth-1" };
    },
    waitForAuthentication: async (message) => {
      handoffs.push(message);
      return { ...result("READY"), host_correlation: "native-auth-1" };
    },
    getCurrentContext: async () => contextDescriptor(contextCount++ === 0 ? "a" : "b")
  });
  assert.equal((await current.invokeReturnedAction(completeAction, { acknowledged: true })).status, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers["X-BOS-Context-Handle"], handle("a"));
  assert.equal(requests[1].headers["X-BOS-Context-Handle"], handle("b"));
  assert.equal(handoffs.length, 2);
  assert.equal(handoffs[0].condition.code, "MCP_WWW_AUTHENTICATE");
  assert.equal(handoffs[0].host_correlation, undefined);
  assert.equal(handoffs[1].host_correlation, "native-auth-1");
  assert.equal(handoffs[1].protected_resource, resource);
  assert.equal(JSON.stringify(handoffs).includes("bos_ctx_v2_"), false);
});

test("host correlation and exact recovery resource are carried into the wait", async () => {
  const discovered = "https://dfsm.ai/mcp/apps/leaddirector/calendar";
  const handoffs = [];
  let requests = 0;
  const current = adapter({
    request: async () => {
      requests += 1;
      return requests === 1
        ? { status: 401, resource: discovered, body: { error: { code: "AUTHORIZATION_REQUIRED" } } }
        : { status: 200, body: { status: "in_progress" } };
    },
    getProtectedResource: async () => { throw new Error("fallback must not run"); },
    recoverAuthentication: async (message) => {
      handoffs.push(message);
      return {
        ...result("HOST_ACTION_REQUIRED"),
        protected_resource: discovered,
        host_correlation: "native-auth-2"
      };
    },
    waitForAuthentication: async (message) => {
      handoffs.push(message);
      return {
        ...result("READY"),
        protected_resource: discovered,
        host_correlation: "native-auth-2"
      };
    }
  });
  assert.equal((await current.invokeStateAction(stateAction)).status, 200);
  assert.deepEqual(handoffs.map(({ protected_resource, host_correlation }) => ({
    protected_resource,
    host_correlation
  })), [
    { protected_resource: discovered, host_correlation: undefined },
    { protected_resource: discovered, host_correlation: "native-auth-2" }
  ]);
});

test("adapter fails closed on a second auth response and private server output", async () => {
  let requests = 0;
  await assert.rejects(
    adapter({
      request: async () => { requests += 1; return { status: 401, body: { error: { code: "AUTHORIZATION_REQUIRED" } } }; }
    }).invokeStateAction(stateAction),
    (error) => error instanceof BosDependencyAdapterError && error.code === "AUTHENTICATION_RECOVERY_FAILED"
  );
  assert.equal(requests, 2);
  await assert.rejects(
    adapter({ request: async () => ({ status: 200, body: { context_handle: handle("c") } }) })
      .invokeStateAction(stateAction),
    /private BOS transport data/
  );
});

test("adapter rejects malformed actions, unsafe origins, private payloads, and caller handles", async () => {
  const current = adapter();
  await assert.rejects(current.invokeReturnedAction({ ...completeAction, extra: true }, { acknowledged: true }), /unsupported field/);
  await assert.rejects(current.invokeReturnedAction({ ...completeAction, href: "https://dfsm.ai/complete" }, { acknowledged: true }), /origin-relative/);
  await assert.rejects(current.invokeReturnedAction({
    ...completeAction,
    payload_schema: { type: "object", properties: { access_token: { type: "string" } } }
  }, { access_token: "secret" }), /private BOS transport data/);
  assert.throws(() => createBosExternalDependencyAdapter({
    hostTransport: {},
    contextProvider: {
      getCurrentContext: async () => contextDescriptor(),
      getExecutionContextHeader: async () => "X-BOS-Context-Handle"
    }
  }), /hostTransport.request/);
  assert.throws(() => createBosExternalDependencyAdapter({
    hostTransport: {
      request: async () => ({ status: 200, body: {} }),
      recoverAuthentication: async () => result("READY"),
      getProtectedResource: async () => resource
    },
    contextProvider: { getCurrentContext: async () => contextDescriptor() }
  }), /getExecutionContextHeader/);
});

test("authentication handoff preserves an exact discovered resource", async () => {
  const discovered = "https://dfsm.ai/mcp/apps/leaddirector/calendar";
  const messages = [];
  const current = adapter({
    getProtectedResource: async () => discovered,
    recoverAuthentication: async (message) => {
      messages.push(message);
      return { ...result("READY"), protected_resource: discovered };
    }
  });
  assert.equal((await current.recoverAuthentication({ condition: "MISSING_GRANT" })).protected_resource, discovered);
  assert.equal(messages[0].protected_resource, discovered);
});

test("automatic recovery preserves the protected resource carried by the failed request", async () => {
  const discovered = "https://dfsm.ai/mcp/apps/leaddirector/calendar";
  const messages = [];
  let calls = 0;
  const current = adapter({
    getProtectedResource: async () => { throw new Error("fallback must not run"); },
    request: async () => {
      calls += 1;
      return calls === 1
        ? { status: 401, resource: discovered, body: { error: { code: "AUTHORIZATION_REQUIRED" } } }
        : { status: 200, body: { status: "in_progress" } };
    },
    recoverAuthentication: async (message) => {
      messages.push(message);
      return { ...result("READY"), protected_resource: discovered };
    }
  });
  assert.equal((await current.invokeStateAction(stateAction)).status, 200);
  assert.equal(messages[0].protected_resource, discovered);
});
