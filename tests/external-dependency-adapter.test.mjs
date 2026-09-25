import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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
const discoveredOperation = {
  operation: "search",
  status: "described",
  effect: "read",
  limits: {
    max_targets: null,
    max_results_per_source: 5,
    pagination_supported: false,
    bulk_supported: false,
    streaming_supported: false,
    maximum_duration_seconds: 30,
    maximum_fan_out: 5
  },
  guarantees: {
    read_consistency: "point_in_time",
    per_source_atomicity: "source_published",
    cross_source_atomicity: "not_applicable",
    convergence: "not_applicable",
    idempotency: "service_owned"
  },
  execution: {
    context_header: "X-BOS-Context-Handle",
    method: "POST",
    uri: "/bos/apps/lead-director/api/v1/organizations/{organization}/search"
  },
  input_schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: { text: { type: "string", minLength: 1 } },
    "x-bos-fields": []
  },
  output_schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    "x-bos-fields": []
  },
  error_contract: {
    schema: "lead-director-public-error/v1",
    codes: ["INVALID_SEARCH_REQUEST"]
  },
  sources: [{
    source: {platform: "bos", application: "lead-director", plugin: "lead-director"},
    availability: "ready"
  }]
};
const authoritativeDescribe = JSON.parse(readFileSync(new URL(
  "fixtures/public-contracts/lead-director/v1/describe.response.example.json",
  import.meta.url
)));

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

test("discovered operation invocation validates and binds current context privately", async () => {
  const requests = [];
  const current = adapter({
    request: async (request) => {
      requests.push(structuredClone(request));
      return { status: 200, body: { records: [] } };
    }
  });
  const response = await current.invokeDiscoveredOperation(
    discoveredOperation,
    { text: "David Ransom" }
  );
  assert.deepEqual(requests, [{
    method: "POST",
    href: discoveredOperation.execution.uri,
    headers: {
      "content-type": "application/json",
      "X-BOS-Context-Handle": handle("a")
    },
    body: JSON.stringify({ text: "David Ransom" })
  }]);
  assert.deepEqual(response, { status: 200, body: { records: [] } });
  assert.equal(JSON.stringify(response).includes("context_handle"), false);
});

test("discovered operation invocation requires the complete authoritative Describe contact", async () => {
  const current = adapter();
  const {effect, limits, guarantees, output_schema, error_contract, sources, ...reduced} =
    discoveredOperation;
  await assert.rejects(
    current.invokeDiscoveredOperation(reduced, {text: "David Ransom"}),
    /immutable public schema/
  );
  assert.deepEqual(
    await current.invokeDiscoveredOperation(discoveredOperation, {text: "David Ransom"}),
    {status: 200, body: {status: "step_completed"}}
  );
  const authoritativeSearch = authoritativeDescribe.operations.find(
    ({operation, status}) => operation === "search" && status === "described"
  );
  assert.deepEqual(
    await current.invokeDiscoveredOperation(authoritativeSearch, {text: "David Ransom"}),
    {status: 200, body: {status: "step_completed"}}
  );
});

test("discovered operation invocation rejects routes, schemas, and private caller context", async () => {
  let transportCalls = 0;
  const current = adapter({request: async () => {
    transportCalls += 1;
    return {status: 200, body: {records: []}};
  }});
  await assert.rejects(
    current.invokeDiscoveredOperation(
      { ...discoveredOperation, execution: { ...discoveredOperation.execution, uri: "https://evil.example/search" } },
      { text: "David" }
    ),
    /immutable public schema/
  );
  await assert.rejects(
    current.invokeDiscoveredOperation(
      { ...discoveredOperation, execution: { ...discoveredOperation.execution, context_header: "X-Authority" } },
      { text: "David" }
    ),
    /immutable public schema/
  );
  await assert.rejects(
    current.invokeDiscoveredOperation(discoveredOperation, { text: "" }),
    /payload does not match/
  );
  await assert.rejects(
    current.invokeDiscoveredOperation({
      ...discoveredOperation,
      execution: { ...discoveredOperation.execution, context_handle: handle("b") }
    }, { text: "David" }),
    /immutable public schema/
  );
  await assert.rejects(
    current.invokeDiscoveredOperation({
      ...discoveredOperation,
      execution: { ...discoveredOperation.execution, transport: "mcp" }
    }, { text: "David" }),
    /immutable public schema/
  );
  for (const malformed of [
    {...discoveredOperation, limits: {}},
    {...discoveredOperation, guarantees: {}},
    {...discoveredOperation, output_schema: {}},
    {...discoveredOperation, error_contract: {}},
    {...discoveredOperation, sources: [{}]},
    {
      ...discoveredOperation,
      execution: {...discoveredOperation.execution, uri: "/unadvertised"}
    }
  ]) {
    await assert.rejects(
      current.invokeDiscoveredOperation(malformed, {text: "David"}),
      /immutable public schema/
    );
  }
  assert.equal(transportCalls, 0);
});

test("discovered operation snapshots validated contact and payload before context lookup", async () => {
  let releaseContext;
  const contextGate = new Promise((resolve) => { releaseContext = resolve; });
  const requests = [];
  const current = adapter({
    request: async (request) => {
      requests.push(structuredClone(request));
      return {status: 200, body: {records: []}};
    },
    getCurrentContext: async () => {
      await contextGate;
      return contextDescriptor();
    }
  });
  const contact = structuredClone(discoveredOperation);
  const payload = {text: "David Ransom"};
  const pending = current.invokeDiscoveredOperation(contact, payload);
  contact.execution.uri = "/bos/apps/lead-director/api/v1/organizations/{organization}/delete";
  payload.text = "";
  payload.context_handle = handle("b");
  releaseContext();
  assert.equal((await pending).status, 200);
  assert.deepEqual(requests, [{
    method: "POST",
    href: discoveredOperation.execution.uri,
    headers: {
      "content-type": "application/json",
      "X-BOS-Context-Handle": handle("a")
    },
    body: JSON.stringify({text: "David Ransom"})
  }]);
});

test("returned action snapshots validated payload before context lookup", async () => {
  let releaseContext;
  const contextGate = new Promise((resolve) => { releaseContext = resolve; });
  const requests = [];
  const current = adapter({
    request: async (request) => {
      requests.push(structuredClone(request));
      return {status: 200, body: {status: "step_completed"}};
    },
    getCurrentContext: async () => {
      await contextGate;
      return contextDescriptor();
    }
  });
  const payload = {acknowledged: true};
  const pending = current.invokeReturnedAction(completeAction, payload);
  payload.acknowledged = false;
  payload.context_handle = handle("b");
  releaseContext();
  assert.equal((await pending).status, 200);
  assert.equal(requests[0].body, JSON.stringify({acknowledged: true}));
});

test("discovered operation authentication recovery is bounded and rebinds fresh context", async () => {
  const requests = [];
  let call = 0;
  let selected = 0;
  let firstRequestSeen;
  const firstRequest = new Promise((resolve) => { firstRequestSeen = resolve; });
  let releaseRecovery;
  const recoveryGate = new Promise((resolve) => { releaseRecovery = resolve; });
  const current = adapter({
    request: async (request) => {
      requests.push(structuredClone(request));
      call += 1;
      if (call === 1) firstRequestSeen();
      return call === 1
        ? { status: 401, body: { error: { code: "AUTHORIZATION_REQUIRED" } } }
        : { status: 200, body: { records: [] } };
    },
    recoverAuthentication: async () => {
      await recoveryGate;
      return result("READY");
    },
    getCurrentContext: async () => contextDescriptor(selected++ === 0 ? "a" : "b")
  });
  const contact = structuredClone(discoveredOperation);
  const payload = {text: "David"};
  const pending = current.invokeDiscoveredOperation(contact, payload);
  await firstRequest;
  contact.execution.uri = "/bos/apps/lead-director/api/v1/organizations/{organization}/delete";
  payload.text = "";
  payload.context_handle = handle("c");
  releaseRecovery();
  assert.equal((await pending).status, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers["X-BOS-Context-Handle"], handle("a"));
  assert.equal(requests[1].headers["X-BOS-Context-Handle"], handle("b"));
  assert.equal(requests[1].href, discoveredOperation.execution.uri);
  assert.equal(requests[1].body, JSON.stringify({text: "David"}));
});

test("legacy discovered operation invocation remains header-free", async () => {
  const requests = [];
  const current = adapter({
    request: async (request) => {
      requests.push(request);
      return { status: 200, body: { records: [] } };
    },
    getCurrentContext: async () => ({ contract_version: "bos-identity-mcp/v1" })
  });
  await current.invokeDiscoveredOperation(discoveredOperation, { text: "David" });
  assert.deepEqual(requests[0].headers, { "content-type": "application/json" });
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
  let firstRequestSeen;
  const firstRequest = new Promise((resolve) => { firstRequestSeen = resolve; });
  let releaseRecovery;
  const recoveryGate = new Promise((resolve) => { releaseRecovery = resolve; });
  const current = adapter({
    request: async (request) => {
      requests.push(structuredClone(request));
      requestCount += 1;
      if (requestCount === 1) {
        firstRequestSeen();
        return { status: 401, headers: { "WWW-Authenticate": "Bearer resource_metadata=redacted" }, body: { error: { code: "UNAUTHENTICATED" } } };
      }
      return { status: 200, body: { status: "step_completed" } };
    },
    recoverAuthentication: async (message) => {
      handoffs.push(message);
      await recoveryGate;
      return { ...result("HOST_ACTION_REQUIRED"), host_correlation: "native-auth-1" };
    },
    waitForAuthentication: async (message) => {
      handoffs.push(message);
      return { ...result("READY"), host_correlation: "native-auth-1" };
    },
    getCurrentContext: async () => contextDescriptor(contextCount++ === 0 ? "a" : "b")
  });
  const action = structuredClone(completeAction);
  const payload = {acknowledged: true};
  const pending = current.invokeReturnedAction(action, payload);
  await firstRequest;
  action.href = "/api/v1/journeys/follow-up/failed";
  payload.acknowledged = false;
  payload.context_handle = handle("c");
  releaseRecovery();
  assert.equal((await pending).status, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers["X-BOS-Context-Handle"], handle("a"));
  assert.equal(requests[1].headers["X-BOS-Context-Handle"], handle("b"));
  assert.equal(requests[1].href, completeAction.href);
  assert.equal(requests[1].body, JSON.stringify({acknowledged: true}));
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
  await assert.rejects(
    current.invokeDiscoveredOperation({
      ...discoveredOperation,
      context_handle: handle("d")
    }, { text: "David" }),
    /immutable public schema/
  );
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
