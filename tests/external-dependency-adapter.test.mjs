import assert from "node:assert/strict";
import test, {after} from "node:test";

import {
  authenticationConditionCodes,
  BosDependencyAdapterError,
  buildAuthenticationHandoffRequest,
  createBosExternalDependencyAdapter,
  validateAuthenticationHandoffMessage
} from "../source/platform/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs";
import {
  fetchSyntheticDiscovery,
  startSyntheticBosDiscoveryService
} from "./helpers/synthetic-bos-discovery-service.mjs";

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
const publicError = (code = "AUTHORIZATION_REQUIRED") => ({
  code,
  message: "Authentication is required.",
  retryable: true,
  correlation_id: "corr-auth-1",
  details: []
});
const canonicalSensitiveWordMessage =
  "Bearer authentication is required.\nThe token and stack words are public text. 😀\t\u0003";
const completeAction = {
  verb: "complete",
  method: "POST",
  href: "/bos/api/v1/journeys/follow-up/complete",
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
  href: "/bos/api/v1/journeys/follow-up",
  payload_schema: null
};
const canonicalEncodedStateAction = {
  ...stateAction,
  href: "/bos/apps/lead-director/api/v1/organizations/example/journeys/meeting-follow-up%3Acaf%C3%A9?capability=opaque-state"
};
const canonicalPercentStateAction = {
  ...stateAction,
  href: "/bos/apps/lead-director/api/v1/organizations/example/journeys/follow-up%3A100%25?capability=opaque-state"
};
const canonicalPercentOctetTextStateAction = {
  ...stateAction,
  href: "/bos/apps/lead-director/api/v1/organizations/example/journeys/follow-up%3A%2520?capability=opaque-state"
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
    uri: "/bos/apps/lead-director/api/v1/organizations/synthetic/search"
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
    codes: ["invalid_search_request", "authentication_required"]
  },
  sources: [{
    source: {platform: "bos", application: "lead-director", plugin: "lead-director"},
    availability: "ready"
  }]
};
const binaryDiscoveredOperation = {
  ...discoveredOperation,
  operation: "gmail_read_attachment",
  limits: {...discoveredOperation.limits, maximum_attachment_bytes: 25 * 1024 * 1024},
  execution: {
    ...discoveredOperation.execution,
    response: {
      body: "binary",
      content_type: "provider",
      headers: [
        "Content-Disposition", "Content-Length", "Content-Type", "Digest",
        "X-Content-SHA256", "X-Correlation-ID"
      ]
    }
  }
};
const attachmentHeaders = (length) => ({
  "Content-Disposition": 'attachment; filename="quote.pdf"',
  "Content-Length": String(length),
  "Content-Type": "application/pdf",
  Digest: "sha-256=synthetic-digest",
  "X-Content-SHA256": "synthetic-sha256",
  "X-Correlation-ID": "corr-attachment-1",
  "X-BOS-Context-Handle": handle("a")
});
const syntheticBos = await startSyntheticBosDiscoveryService();
after(() => syntheticBos.close());
const authoritativeDescribe = await fetchSyntheticDiscovery(
  syntheticBos.baseUrl,
  "/discovery/operations"
);

const invocationPaths = [
  {
    name: "returned action",
    invoke: (current) => current.invokeReturnedAction(completeAction, {acknowledged: true})
  },
  {
    name: "state action",
    invoke: (current) => current.invokeStateAction(stateAction)
  },
  {
    name: "discovered operation",
    invoke: (current) => current.invokeDiscoveredOperation(
      discoveredOperation,
      {text: "Synthetic Contact"}
    )
  }
];
const privatePublicErrorDetailKeys = [
  "journey_id", "execution_id", "graph_id", "snapshot_id", "compiled_snapshot",
  "compiled_fingerprint", "digest", "revision", "state_version", "node_occurrence",
  "occurrence", "idempotency_key", "client_idempotency_key", "retry_count", "retry_state",
  "action_id", "artifact_ref", "object_name", "provider", "provider_id",
  "provider_account_id", "provider_error", "provider_message", "provider_payload",
  "provider_response", "database_id", "sql", "stack_trace", "attendee", "attendees",
  "email", "emails", "email_address", "email_addresses", "recipient", "recipients",
  "access_token", "refresh_token", "bearer_token", "authorization", "authorization_header",
  "oauth_token", "api_key", "credential_id", "secret", "token", "context_handle",
  "context_id", "opaque_context", "principal_context", "authority_context", "grant_id",
  "session_id", "connection_id", "internal_id", "organization_id", "org_id", "tenant_id",
  "membership_id", "application_id", "app_id", "app_code", "installation_id",
  "installed_app_id", "plugin_id", "role_id", "actor_role_id", "user_id", "actor_user_id",
  "resource_group_id", "actor_id", "delegated_role_id", "client_secret", "private_key",
  "cookie", "credential", "credentials", "password", "passwords", "passphrase",
  "passphrases", "secret", "secrets", "token", "tokens", "handler", "handlers",
  "service_account", "service_account_key", "approval_id", "client_id",
  "request_fingerprint", "retry_id", "source_id", "authority", "context", "grant",
  "oauth", "principal", "tenant", "providerMessage", "graphId", "emailAddress",
  "customer_email", "requestFingerprint", "sourceId"
];
const nestedBusinessErrorBodies = [
  ["source result", (error) => ({source_results: [{source: "crm", error}]})],
  ["outcome", (error) => ({outcomes: [{source: "calendar", error}]})],
  ["record", (error) => ({records: [{error}]})],
  ["record readback", (error) => ({records: [{readback: {error}}]})],
  ["record receipt", (error) => ({records: [{receipt: {error}}]})],
  ["source record", (error) => ({source_results: [{records: [{error}]}]})],
  ["source record readback", (error) => ({source_results: [{records: [{readback: {error}}]}]})],
  ["source record receipt", (error) => ({source_results: [{records: [{receipt: {error}}]}]})],
  ["outcome readback", (error) => ({outcomes: [{readback: {error}}]})],
  ["outcome receipt", (error) => ({outcomes: [{receipt: {error}}]})],
  ["outcome record", (error) => ({outcomes: [{records: [{error}]}]})],
  ["outcome record readback", (error) => ({outcomes: [{records: [{readback: {error}}]}]})],
  ["outcome record receipt", (error) => ({outcomes: [{records: [{receipt: {error}}]}]})]
];

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
    condition: "AUTHORIZATION_REQUIRED",
    host_correlation: "native-1"
  }), {
    schema_version: "bos.authentication-handoff/v1",
    message_type: "request",
    protected_resource: resource,
    condition: {
      category: "authentication",
      code: "AUTHORIZATION_REQUIRED",
      source: "protected_resource"
    },
    host_correlation: "native-1"
  });
  assert.throws(
    () => buildAuthenticationHandoffRequest({resource, condition: "authentication_required"}),
    /unknown authentication condition/
  );
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
  const request = buildAuthenticationHandoffRequest({ resource, condition: "AUTHORIZATION_REQUIRED" });
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
  assert.equal((await current.recoverAuthentication({ resource, condition: "AUTHORIZATION_REQUIRED" })).status, "HOST_ACTION_REQUIRED");
  assert.equal((await current.waitForAuthentication({ resource, condition: "AUTHORIZATION_REQUIRED" })).status, "READY");
  assert.equal(messages.length, 2);
  assert(messages.every((message) => message.schema_version === "bos.authentication-handoff/v1"));
  await assert.rejects(
    adapter({ recoverAuthentication: async () => ({ ...result("READY"), protected_resource: "https://wrong.example/mcp" }) })
      .recoverAuthentication({ resource, condition: "AUTHORIZATION_REQUIRED" }),
    (error) => error instanceof BosDependencyAdapterError && !("code" in error)
  );
  await assert.rejects(
    adapter({waitForAuthentication: undefined}).waitForAuthentication({resource, condition: "AUTHORIZATION_REQUIRED"}),
    (error) => error instanceof BosDependencyAdapterError && !("code" in error) && /remains active/.test(error.message)
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

test("canonical percent-encoded journey identity reaches authenticated transport unchanged", async () => {
  const requests = [];
  const current = adapter({
    request: async (request) => {
      requests.push(structuredClone(request));
      return {status: 200, body: {status: "in_progress"}};
    }
  });
  assert.equal((await current.invokeStateAction(canonicalEncodedStateAction)).status, 200);
  assert.equal((await current.invokeStateAction(canonicalPercentStateAction)).status, 200);
  assert.equal((await current.invokeStateAction(canonicalPercentOctetTextStateAction)).status, 200);
  assert.deepEqual(requests.map(({href}) => href), [
    canonicalEncodedStateAction.href,
    canonicalPercentStateAction.href,
    canonicalPercentOctetTextStateAction.href
  ]);
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
    { text: "Synthetic Contact 7F3A91" }
  );
  assert.deepEqual(requests, [{
    method: "POST",
    href: discoveredOperation.execution.uri,
    headers: {
      "content-type": "application/json",
      "X-BOS-Context-Handle": handle("a")
    },
    body: JSON.stringify({ text: "Synthetic Contact 7F3A91" })
  }]);
  assert.deepEqual(response, { status: 200, body: { records: [] } });
  assert.equal(JSON.stringify(response).includes("context_handle"), false);
});

test("binary attachment responses preserve only bounded public download headers", async () => {
  const downloadHeaders = attachmentHeaders(4);
  const response = await adapter({request: async () => ({
    status: 200,
    headers: downloadHeaders,
    body: new Uint8Array([37, 80, 68, 70])
  })}).invokeDiscoveredOperation(binaryDiscoveredOperation, {text: "Synthetic Quote"});
  assert.deepEqual([...response.body], [37, 80, 68, 70]);
  assert.deepEqual(response.headers, {
    "content-disposition": 'attachment; filename="quote.pdf"',
    "content-length": "4",
    "content-type": "application/pdf",
    digest: "sha-256=synthetic-digest",
    "x-content-sha256": "synthetic-sha256",
    "x-correlation-id": "corr-attachment-1"
  });
  const jsonResponse = await adapter({request: async () => ({
    status: 200,
    headers: downloadHeaders,
    body: {records: []}
  })}).invokeDiscoveredOperation(discoveredOperation, {text: "Synthetic Quote"});
  assert.deepEqual(jsonResponse.headers, {
    "content-type": "application/pdf",
    "x-correlation-id": "corr-attachment-1"
  });
  await assert.rejects(
    adapter({request: async () => ({
      status: 200,
      headers: {...downloadHeaders, "Content-Disposition": "attachment; filename=unsafe\r\nname"},
      body: new Uint8Array([37, 80, 68, 70])
    })}).invokeDiscoveredOperation(binaryDiscoveredOperation, {text: "Synthetic Quote"}),
    /bounded printable string/
  );
});

test("binary responses require the advertised contract, headers, and byte limit", async () => {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  const current = (contact, response) => adapter({request: async () => response})
    .invokeDiscoveredOperation(contact, {text: "Synthetic Quote"});
  await assert.rejects(
    current(discoveredOperation, {status: 200, headers: attachmentHeaders(4), body: bytes}),
    /successful described binary operation/
  );
  await assert.rejects(
    adapter({request: async () => ({status: 200, headers: attachmentHeaders(4), body: bytes})})
      .invokeReturnedAction(completeAction, {acknowledged: true}),
    /successful described binary operation/
  );
  await assert.rejects(
    current({...binaryDiscoveredOperation, limits: discoveredOperation.limits},
      {status: 200, headers: attachmentHeaders(4), body: bytes}),
    /requires an attachment byte limit/
  );
  await assert.rejects(
    current({...binaryDiscoveredOperation, limits: {...binaryDiscoveredOperation.limits, maximum_attachment_bytes: 3}},
      {status: 200, headers: attachmentHeaders(4), body: bytes}),
    /exceeds the described attachment limit/
  );
  await assert.rejects(
    current(binaryDiscoveredOperation,
      {status: 200, headers: {...attachmentHeaders(4), "Content-Length": "5"}, body: bytes}),
    /Content-Length does not match/
  );
  const missingDigest = attachmentHeaders(4);
  delete missingDigest.Digest;
  await assert.rejects(
    current(binaryDiscoveredOperation, {status: 200, headers: missingDigest, body: bytes}),
    /missing described header Digest/
  );
  await assert.rejects(
    current(binaryDiscoveredOperation, {status: 200, headers: attachmentHeaders(4), body: {records: []}}),
    /returned a non-binary response/
  );
});

test("near-limit binary attachment bodies bypass structured-response byte enumeration", async () => {
  const bytes = new Uint8Array(25 * 1024 * 1024);
  bytes[0] = 37;
  bytes[bytes.length - 1] = 70;
  const response = await adapter({request: async () => ({
    status: 200,
    headers: attachmentHeaders(bytes.length),
    body: bytes
  })}).invokeDiscoveredOperation(binaryDiscoveredOperation, {text: "Synthetic Quote"});
  assert.equal(response.body.length, bytes.length);
  assert.equal(response.body[0], 37);
  assert.equal(response.body[response.body.length - 1], 70);
  assert.equal(response.headers["content-length"], String(bytes.length));
});

test("discovered operation invocation requires the complete authoritative Describe contact", async () => {
  const current = adapter();
  const {effect, limits, guarantees, output_schema, error_contract, sources, ...reduced} =
    discoveredOperation;
  await assert.rejects(
    current.invokeDiscoveredOperation(reduced, {text: "Synthetic Contact 7F3A91"}),
    /immutable public schema/
  );
  assert.deepEqual(
    await current.invokeDiscoveredOperation(discoveredOperation, {text: "Synthetic Contact 7F3A91"}),
    {status: 200, body: {status: "step_completed"}}
  );
  const authoritativeSearch = authoritativeDescribe.operations.find(
    ({operation, status}) => operation === "search" && status === "described"
  );
  assert.deepEqual(
    await current.invokeDiscoveredOperation(authoritativeSearch, {text: "Synthetic Contact 7F3A91"}),
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
      { text: "Synthetic Contact" }
    ),
    /immutable public schema/
  );
  await assert.rejects(
    current.invokeDiscoveredOperation(
      { ...discoveredOperation, execution: { ...discoveredOperation.execution, context_header: "X-Authority" } },
      { text: "Synthetic Contact" }
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
    }, { text: "Synthetic Contact" }),
    /immutable public schema/
  );
  await assert.rejects(
    current.invokeDiscoveredOperation({
      ...discoveredOperation,
      execution: { ...discoveredOperation.execution, transport: "mcp" }
    }, { text: "Synthetic Contact" }),
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
    },
    ...[
      "/bos/../../unrelated",
      "/bos/apps/%2e%2e/unrelated",
      "/bos/apps/%2E%2E/unrelated",
      "/bos/..?/unrelated",
      "/bos/apps/meeting-follow-up%3aexample-event",
      "/bos/apps/%2Fprivate",
      "/bos/apps/route%0D%0AInjected",
      "/bos/apps/caf%c3%a9",
      "/bos/apps/caf%C3",
      "/bos/apps/%C0%AFprivate",
      "/bos/apps/%ED%A0%80",
      "/bos/apps/cafe%CC%81",
      "/bos/apps/%41dmin",
      "/bos/apps/%5Cprivate",
      "/bos//evil.example/unrelated",
      "//evil.example/bos/unrelated",
      "https://evil.example/bos/unrelated",
      "/bos/apps/route#fragment",
      "/bos/apps/route\r\nInjected: yes",
      "/bos/apps/route\u0000suffix"
    ].map((uri) => ({
      ...discoveredOperation,
      execution: {...discoveredOperation.execution, uri}
    }))
  ]) {
    await assert.rejects(
      current.invokeDiscoveredOperation(malformed, {text: "Synthetic Contact"}),
      /immutable public schema|canonical safe origin-relative \/bos\/ URI/
    );
  }
  assert.equal(transportCalls, 0);
});

test("returned and state actions reject unsafe execution routes before context or transport", async () => {
  let contextCalls = 0;
  let transportCalls = 0;
  const current = adapter({
    getCurrentContext: async () => {
      contextCalls += 1;
      return contextDescriptor();
    },
    request: async () => {
      transportCalls += 1;
      return {status: 200, body: {status: "step_completed"}};
    }
  });
  const unsafeUris = [
    "/bos/../../private",
    "/bos/%2e%2e/private",
    "/bos/%2E%2e/private",
    "/bos/..?/private",
    "/bos/apps/meeting-follow-up%3aexample-event",
    "/bos/apps/%2Fprivate",
    "/bos/apps/route%0D%0AInjected",
    "/bos/apps/caf%c3%a9",
    "/bos/apps/caf%C3",
    "/bos/apps/%C0%AFprivate",
    "/bos/apps/%ED%A0%80",
    "/bos/apps/cafe%CC%81",
    "/bos/apps/%41dmin",
    "/bos/apps/%5Cprivate",
    "/bos//private",
    "//evil.example/bos/private",
    "https://evil.example/bos/private",
    "/bos/apps/route#fragment",
    "/bos/apps/route\r\nInjected: yes",
    "/bos/apps/route\u0000suffix"
  ];
  for (const href of unsafeUris) {
    await assert.rejects(
      current.invokeReturnedAction({...completeAction, href}, {acknowledged: true}),
      /returned action href/
    );
    await assert.rejects(
      current.invokeStateAction({...stateAction, href}),
      /returned action href/
    );
  }
  assert.equal(contextCalls, 0);
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
  const payload = {text: "Synthetic Contact 7F3A91"};
  const pending = current.invokeDiscoveredOperation(contact, payload);
  contact.execution.uri = "/bos/apps/lead-director/api/v1/organizations/synthetic/delete";
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
    body: JSON.stringify({text: "Synthetic Contact 7F3A91"})
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
        ? { status: 401, body: { error: publicError() } }
        : { status: 200, body: { records: [] } };
    },
    recoverAuthentication: async () => {
      await recoveryGate;
      return result("READY");
    },
    getCurrentContext: async () => contextDescriptor(selected++ === 0 ? "a" : "b")
  });
  const contact = structuredClone(discoveredOperation);
  const payload = {text: "Synthetic Contact"};
  const pending = current.invokeDiscoveredOperation(contact, payload);
  await firstRequest;
  contact.execution.uri = "/bos/apps/lead-director/api/v1/organizations/synthetic/delete";
  payload.text = "";
  payload.context_handle = handle("c");
  releaseRecovery();
  assert.equal((await pending).status, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers["X-BOS-Context-Handle"], handle("a"));
  assert.equal(requests[1].headers["X-BOS-Context-Handle"], handle("b"));
  assert.equal(requests[1].href, discoveredOperation.execution.uri);
  assert.equal(requests[1].body, JSON.stringify({text: "Synthetic Contact"}));
});

test("discovered operation recovery follows service authentication conditions independently of business error metadata", async () => {
  for (const transportMode of ["response", "throw"]) {
    const handoffs = [];
    let requests = 0;
    const current = adapter({
      request: async () => {
        requests += 1;
        if (requests > 1) return {status: 200, body: {records: []}};
        const failure = {status: 401, body: {error: publicError()}, resource};
        if (transportMode === "throw") throw failure;
        return failure;
      },
      recoverAuthentication: async (message) => {
        handoffs.push(message);
        return result("READY");
      }
    });

    const response = await current.invokeDiscoveredOperation(
      discoveredOperation,
      {text: "Synthetic Contact"}
    );
    assert.equal(response.status, 200);
    assert.equal(requests, 2);
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].condition.code, "AUTHORIZATION_REQUIRED");
  }
});

test("four-field returned and state actions recover from implemented service conditions", async (t) => {
  const paths = [
    {
      name: "returned action",
      action: completeAction,
      invoke: (current, action) =>
        current.invokeReturnedAction(action, {acknowledged: true})
    },
    {
      name: "state action",
      action: stateAction,
      invoke: (current, action) => current.invokeStateAction(action)
    }
  ];

  for (const {name, action, invoke} of paths) {
    for (const transportMode of ["response", "throw"]) {
      await t.test(`${name}: ${transportMode}`, async () => {
        let requests = 0;
        let recoveries = 0;
        const current = adapter({
          request: async () => {
            requests += 1;
            if (requests > 1) return {status: 200, body: {status: "step_completed"}};
            const failure = {status: 401, resource, body: {error: publicError()}};
            if (transportMode === "throw") throw failure;
            return failure;
          },
          recoverAuthentication: async () => {
            recoveries += 1;
            return result("READY");
          }
        });
        assert.equal((await invoke(current, structuredClone(action))).status, 200);
        assert.equal(requests, 2);
        assert.equal(recoveries, 1);
      });
    }
  }

  await assert.rejects(
    adapter().invokeStateAction({...stateAction, error_contract: {schema: "bos-public-error/v1", codes: []}}),
    /unsupported field error_contract/
  );
});

test("every invocation path preserves an initial multiline canonical error for returned and thrown transport failures", async (t) => {
  const denied = {
    code: "authorization_denied",
    message: canonicalSensitiveWordMessage,
    retryable: false,
    correlation_id: "corr-authorization-denied",
    details: [{field: "operation", issue: "denied"}]
  };
  const expected = {status: 403, body: {error: denied}};

  for (const {name, invoke} of invocationPaths) {
    for (const transportMode of ["response", "throw"]) {
      await t.test(`${name}: ${transportMode}`, async () => {
        const handoffs = [];
        let requests = 0;
        const current = adapter({
          request: async () => {
            requests += 1;
            const failure = {...structuredClone(expected), resource};
            if (transportMode === "throw") throw failure;
            return failure;
          },
          recoverAuthentication: async (message) => {
            handoffs.push(message);
            return result("READY");
          }
        });

        assert.deepEqual(await invoke(current), expected);
        assert.equal(requests, 1);
        assert.deepEqual(handoffs, []);
      });
    }
  }
});

test("every invocation path preserves a multiline canonical error returned or thrown after bounded recovery", async (t) => {
  const denied = {
    code: "authorization_denied",
    message: canonicalSensitiveWordMessage,
    retryable: false,
    correlation_id: "corr-post-recovery-denied",
    details: [{field: "operation", issue: "denied_after_recovery"}]
  };
  const expected = {status: 403, body: {error: denied}};

  for (const {name, invoke} of invocationPaths) {
    for (const initialMode of ["response", "throw"]) {
      for (const finalMode of ["response", "throw"]) {
        await t.test(`${name}: ${initialMode} auth then ${finalMode} denial`, async () => {
          const handoffs = [];
          let requests = 0;
          const current = adapter({
            request: async () => {
              requests += 1;
              const failure = requests === 1
                ? {status: 401, resource, body: {error: publicError()}}
                : {...structuredClone(expected), resource};
              const mode = requests === 1 ? initialMode : finalMode;
              if (mode === "throw") throw failure;
              return failure;
            },
            recoverAuthentication: async (message) => {
              handoffs.push(message);
              return result("READY");
            }
          });

          assert.deepEqual(await invoke(current), expected);
          assert.equal(requests, 2);
          assert.equal(handoffs.length, 1);
          assert.equal(handoffs[0].condition.code, "AUTHORIZATION_REQUIRED");
        });
      }
    }
  }
});

test("every invocation path keeps authentication recovery pending when recovery cannot complete", async (t) => {
  const authError = {
    code: "AUTHORIZATION_REQUIRED",
    message: canonicalSensitiveWordMessage,
    retryable: true,
    correlation_id: "corr-recovery-incomplete",
    details: [{action: "authenticate"}]
  };
  const expected = {
    status: 401,
    body: {error: authError},
    headers: {
      "content-type": "application/json",
      "x-correlation-id": "corr-recovery-incomplete"
    }
  };
  const scenarios = [
    {
      name: "recovery throws",
      recoverAuthentication: async () => { throw new Error("native recovery unavailable"); },
      waitForAuthentication: async () => { throw new Error("wait must not run"); },
      expectedRecoveryCalls: 1,
      expectedWaitCalls: 0,
      expectedError: /native recovery unavailable/
    },
    {
      name: "wait throws",
      recoverAuthentication: async () => result("HOST_ACTION_REQUIRED"),
      waitForAuthentication: async () => { throw new Error("native wait unavailable"); },
      expectedRecoveryCalls: 1,
      expectedWaitCalls: 1,
      expectedError: /native wait unavailable/
    },
    {
      name: "wait remains non-ready",
      recoverAuthentication: async () => result("HOST_ACTION_REQUIRED"),
      waitForAuthentication: async () => result("NOT_READY"),
      expectedRecoveryCalls: 1,
      expectedWaitCalls: 1,
      expectedError: /recovery remains active/
    }
  ];

  for (const {name: pathName, invoke} of invocationPaths) {
    for (const transportMode of ["response", "throw"]) {
      for (const scenario of scenarios) {
        await t.test(`${pathName}: ${transportMode}, ${scenario.name}`, async () => {
          let requests = 0;
          let recoveryCalls = 0;
          let waitCalls = 0;
          const current = adapter({
            request: async () => {
              requests += 1;
              const failure = {
                ...structuredClone(expected),
                resource
              };
              if (transportMode === "throw") throw failure;
              return failure;
            },
            recoverAuthentication: async (...args) => {
              recoveryCalls += 1;
              return scenario.recoverAuthentication(...args);
            },
            waitForAuthentication: async (...args) => {
              waitCalls += 1;
              return scenario.waitForAuthentication(...args);
            }
          });

          await assert.rejects(invoke(current), scenario.expectedError);
          assert.equal(requests, 1);
          assert.equal(recoveryCalls, scenario.expectedRecoveryCalls);
          assert.equal(waitCalls, scenario.expectedWaitCalls);
        });
      }
    }
  }
});

test("public error messages use the exact service length contract without content rewriting", async () => {
  const maximumMessage = `${"😀".repeat(2044)}\n\r\t\u0000`;
  const accepted = {
    status: 400,
    body: {
      error: {
        ...publicError("invalid_request"),
        message: maximumMessage
      }
    }
  };
  assert.deepEqual(await adapter({request: async () => accepted})
    .invokeStateAction(stateAction), accepted);
  const uppercase = {
    ...accepted,
    body: {error: {...accepted.body.error, code: "INVALID_REQUEST"}}
  };
  assert.deepEqual(
    await adapter({request: async () => uppercase}).invokeStateAction(stateAction),
    uppercase
  );
  await assert.rejects(
    adapter({
      request: async () => ({
        ...accepted,
        body: {error: {...accepted.body.error, message: `${maximumMessage}x`}}
      })
    }).invokeStateAction(stateAction),
    /at most 2048 characters/
  );
});

test("nested composed source and outcome errors preserve exact canonical messages", async (t) => {
  const sourceError = {
    code: "source_unavailable",
    message: canonicalSensitiveWordMessage,
    retryable: true,
    correlation_id: "corr-source-nested",
    details: [{source: "crm", issue: "temporarily_unavailable"}]
  };
  const outcomeError = {
    code: "authorization_denied",
    message: handle("e"),
    retryable: false,
    correlation_id: "corr-outcome-nested",
    details: [{source: "calendar", issue: "denied"}]
  };
  const expected = {
    status: 207,
    body: {
      status: "partial_success",
      source_results: [{source: "crm", error: sourceError}],
      outcomes: [{source: "calendar", readback: {error: outcomeError}}]
    }
  };

  for (const {name, invoke} of invocationPaths) {
    for (const transportMode of ["response", "throw"]) {
      await t.test(`${name}: ${transportMode}`, async () => {
        const current = adapter({
          request: async () => {
            const transport = structuredClone(expected);
            if (transportMode === "throw") throw transport;
            return transport;
          }
        });
        assert.deepEqual(await invoke(current), expected);
      });
    }
  }
});

test("every invocation path preserves legitimate null business errors", async (t) => {
  const expected = {
    status: 201,
    body: {
      id: "contact-synthetic-1",
      created: true,
      error: null,
      source_results: [{source: "crm", record_id: "contact-synthetic-1", error: null}],
      outcomes: [{source: "crm", status: "created", error: null}]
    }
  };
  for (const {name, invoke} of invocationPaths) {
    for (const transportMode of ["response", "throw"]) {
      await t.test(`${name}: ${transportMode}`, async () => {
        const current = adapter({
          request: async () => {
            const transport = structuredClone(expected);
            if (transportMode === "throw") throw transport;
            return transport;
          }
        });
        assert.deepEqual(await invoke(current), expected);
      });
    }
  }
});

test("arbitrary business errors and ordinary four-field objects are preserved outside sanctioned error locations", async (t) => {
  const expected = {
    status: 200,
    body: {
      business: {
        error: {status: "declined", reason: "A customer-defined validation failed."},
        diagnostic: {
          code: "customer_state",
          message: "This is business data, not a BOS public error.",
          retryable: "customer_decides",
          correlation_id: "customer-visible-value"
        }
      },
      source_results: [{
        source: "crm",
        business: {error: {code: "source-specific", message: "Provider-owned business data."}}
      }]
    }
  };
  for (const {name, invoke} of invocationPaths) {
    for (const transportMode of ["response", "throw"]) {
      await t.test(`${name}: ${transportMode}`, async () => {
        const current = adapter({
          request: async () => {
            const transport = structuredClone(expected);
            if (transportMode === "throw") throw transport;
            return transport;
          }
        });
        assert.deepEqual(await invoke(current), expected);
      });
    }
  }
});

test("public error details have no BOC-owned count, key-count, or nesting-depth limits", async () => {
  let nested = {public_note: "deep service-owned detail"};
  for (let depth = 0; depth < 128; depth += 1) nested = {child: nested};
  const details = Array.from({length: 256}, (_, index) => ({
    [`public_field_${index}`]: index,
    ...(index === 255 ? {nested} : {})
  }));
  const expected = {
    status: 400,
    body: {error: {...publicError("invalid_request"), details}}
  };
  assert.deepEqual(await adapter({request: async () => expected})
    .invokeStateAction(stateAction), expected);
});

test("minimal incomplete errors under composed source and outcome results fail closed", async (t) => {
  for (const container of ["source_results", "outcomes"]) {
    for (const transportMode of ["response", "throw"]) {
      await t.test(`${container}: ${transportMode}`, async () => {
        const current = adapter({
          request: async () => {
            const transport = {
              status: 207,
              body: {
                [container]: [{
                  error: {code: "invalid_request", message: "incomplete"}
                }]
              }
            };
            if (transportMode === "throw") throw transport;
            return transport;
          }
        });
        await assert.rejects(
          current.invokeStateAction(stateAction),
          /BOS public error|dependency transport failed/
        );
      });
    }
  }
});

test("malformed errors fail closed anywhere in composed and child business results", async (t) => {
  const canonical = {
    code: "source_unavailable",
    message: "Public source failure.",
    retryable: true,
    correlation_id: "corr-source-malformed",
    details: []
  };
  const cases = [
    {
      name: "missing field",
      error: {code: canonical.code, message: canonical.message, retryable: true, details: []}
    },
    {name: "extra field", error: {...canonical, explanation: "widened"}},
    {name: "invalid code", error: {...canonical, code: "Source_UNAVAILABLE"}},
    {name: "invalid retryable", error: {...canonical, retryable: "true"}},
    {
      name: "private details",
      error: {...canonical, details: [{access_token: "private"}]}
    }
  ];

  for (const {name: pathName, invoke} of invocationPaths) {
    for (const [location, bodyForError] of nestedBusinessErrorBodies) {
      for (const {name, error} of cases) {
        for (const transportMode of ["response", "throw"]) {
          await t.test(`${pathName}: ${location}, ${name}, ${transportMode}`, async () => {
            const current = adapter({
              request: async () => {
                const transport = {
                  status: 207,
                  body: bodyForError(structuredClone(error))
                };
                if (transportMode === "throw") throw transport;
                return transport;
              }
            });
            await assert.rejects(
              invoke(current),
              /malformed BOS public error|BOS public error|private BOS transport data|dependency transport failed/
            );
          });
        }
      }
    }
  }
});

test("public error details recursively reject the complete private-key vocabulary on every invocation path", async (t) => {
  for (const {name: pathName, invoke} of invocationPaths) {
    for (const [index, privateKey] of privatePublicErrorDetailKeys.entries()) {
      const [location, bodyForError] = nestedBusinessErrorBodies[index % nestedBusinessErrorBodies.length];
      await t.test(`${pathName}: ${location}, ${privateKey}`, async () => {
        const error = {
          code: "source_unavailable",
          message: "The source is temporarily unavailable.",
          retryable: true,
          correlation_id: `corr-private-${index}`,
          details: [{[privateKey]: "private"}]
        };
        const current = adapter({
          request: async () => ({status: 207, body: bodyForError(error)})
        });
        await assert.rejects(invoke(current), /private BOS transport data/);
      });
    }
  }
});

test("discovered operation restores the implemented generic 401 recovery signal", async () => {
  const handoffs = [];
  let requests = 0;
  const current = adapter({
    request: async () => {
      requests += 1;
      if (requests > 1) return {status: 200, body: {records: []}};
      return {
        status: 401,
        authenticationError: true,
        condition: "AUTHORIZATION_REQUIRED",
        body: {error: {message: "Authentication is required."}}
      };
    },
    recoverAuthentication: async (message) => {
      handoffs.push(message);
      return result("READY");
    }
  });

  assert.equal((await current.invokeDiscoveredOperation(
    discoveredOperation,
    {text: "Synthetic Contact"}
  )).status, 200);
  assert.equal(requests, 2);
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].condition.code, "AUTHORIZATION_REQUIRED");
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
  await current.invokeDiscoveredOperation(discoveredOperation, { text: "Synthetic Contact" });
  assert.deepEqual(requests[0].headers, { "content-type": "application/json" });
});

test("identity-v2 consumes and validates the static header name published by Describe", async () => {
  const current = adapter({ getExecutionContextHeader: async () => "X-Authority" });
  await assert.rejects(
    current.invokeStateAction(stateAction),
    (error) => error instanceof BosDependencyAdapterError && !("code" in error)
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
    { verb: "start", method: "POST", href: "/bos/journeys/example/start", payload_schema: null },
    completeAction,
    { verb: "step", method: "POST", href: "/bos/journeys/example/step", payload_schema: null },
    { ...completeAction, verb: "failed", href: "/bos/journeys/example/failed" }
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
        return { status: 401, headers: { "WWW-Authenticate": "Bearer resource_metadata=redacted" }, body: { error: publicError() } };
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
  assert.equal(handoffs[0].condition.code, "AUTHORIZATION_REQUIRED");
  assert.equal(handoffs[0].host_correlation, undefined);
  assert.equal(handoffs[1].host_correlation, "native-auth-1");
  assert.equal(handoffs[1].protected_resource, resource);
  assert.equal(JSON.stringify(handoffs).includes("bos_ctx_v2_"), false);
});

test("a 401 challenge enters the implemented authentication recovery path", async () => {
  const handoffs = [];
  let requests = 0;
  const current = adapter({
    request: async () => {
      requests += 1;
      return requests === 1
        ? {
            status: 401,
            headers: {"WWW-Authenticate": "Bearer resource_metadata=redacted"},
            body: {error: {message: "Authentication is required."}}
          }
        : {status: 200, body: {status: "step_completed"}};
    },
    recoverAuthentication: async (message) => { handoffs.push(message); return result("READY"); },
    getCurrentContext: async () => contextDescriptor("a")
  });
  assert.equal((await current.invokeReturnedAction(
    completeAction,
    {acknowledged: true}
  )).status, 200);
  assert.equal(requests, 2);
  assert.equal(handoffs[0].condition.code, "MCP_WWW_AUTHENTICATE");
});

test("transport failures preserve every previously supported service authentication signal", async () => {
  for (const [transportError, expectedCode] of [
    [{code: "expired_token", resource}, "EXPIRED_TOKEN"],
    [{body: {error: publicError("REAUTHENTICATION_REQUIRED")}, resource}, "REAUTHENTICATION_REQUIRED"],
    [{body: {error: {...publicError(), code: {toString: () => "mcp_session_closed"}}}, resource}, "MCP_SESSION_CLOSED"]
  ]) {
    const handoffs = [];
    let requests = 0;
    const current = adapter({
      request: async () => {
        requests += 1;
        if (requests === 1) throw transportError;
        return {status: 200, body: {status: "step_completed"}};
      },
      recoverAuthentication: async (message) => {
        handoffs.push(message);
        return result("READY");
      }
    });
    assert.equal((await current.invokeReturnedAction(
      completeAction,
      {acknowledged: true}
    )).status, 200);
    assert.equal(requests, 2);
    assert.equal(handoffs[0].condition.code, expectedCode);
  }

  const handoffs = [];
  let requests = 0;
  const current = adapter({
    request: async () => {
      requests += 1;
      if (requests === 1) {
        throw {
          status: 401,
          body: {error: publicError()},
          resource
        };
      }
      return {status: 200, body: {status: "step_completed"}};
    },
    recoverAuthentication: async (message) => {
      handoffs.push(message);
      return result("READY");
    }
  });
  assert.equal((await current.invokeReturnedAction(
    completeAction,
    {acknowledged: true}
  )).status, 200);
  assert.equal(requests, 2);
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].condition.code, "AUTHORIZATION_REQUIRED");
});

test("non-authentication public errors still reject incomplete, null-detail, and widened shapes", async () => {
  const malformedErrors = [
    {code: "invalid_request"},
    {...publicError("invalid_request"), details: null},
    {...publicError("invalid_request"), provider_error: "private"}
  ];
  for (const invoke of [
    (current) => current.invokeReturnedAction(completeAction, {acknowledged: true}),
    (current) => current.invokeDiscoveredOperation(discoveredOperation, {text: "Synthetic Contact"})
  ]) {
    for (const transportMode of ["response", "throw"]) {
      for (const error of malformedErrors) {
        const handoffs = [];
        let requests = 0;
        const current = adapter({
          request: async () => {
            requests += 1;
            const failure = {status: 400, resource, body: {error}};
            if (transportMode === "throw") throw failure;
            return failure;
          },
          recoverAuthentication: async (message) => {
            handoffs.push(message);
            return result("READY");
          }
        });
        await assert.rejects(invoke(current), /BOS public error|dependency transport failed/);
        assert.equal(requests, 1);
        assert.deepEqual(handoffs, []);
      }
    }
  }
});

test("host correlation and exact recovery resource are carried into the wait", async () => {
  const discovered = "https://dfsm.ai/mcp/apps/leaddirector/calendar";
  const handoffs = [];
  let requests = 0;
  const current = adapter({
    request: async () => {
      requests += 1;
      return requests === 1
        ? { status: 401, resource: discovered, body: { error: publicError() } }
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

test("a final BOS authentication condition fails after one bounded recovery", async () => {
  const finalError = {
    ...publicError("AUTHORIZATION_REQUIRED"),
    message: "Authentication is still required.",
    retryable: false,
    correlation_id: "corr-final-auth",
    details: [{source: "calendar"}]
  };
  for (const invoke of [
    (current) => current.invokeReturnedAction(completeAction, {acknowledged: true}),
    (current) => current.invokeDiscoveredOperation(discoveredOperation, {text: "Synthetic Contact"})
  ]) {
    for (const transportMode of ["response", "throw"]) {
      let requests = 0;
      const current = adapter({
        request: async () => {
          requests += 1;
          const failure = {
            status: 401,
            resource,
            body: {error: requests === 1 ? publicError() : structuredClone(finalError)}
          };
          if (transportMode === "throw") throw failure;
          return failure;
        }
      });
      await assert.rejects(invoke(current), /recovery did not restore the operation/);
      assert.equal(requests, 2);
    }
  }
});

test("adapter rejects private server output", async () => {
  await assert.rejects(
    adapter({ request: async () => ({ status: 200, body: { context_handle: handle("c") } }) })
      .invokeStateAction(stateAction),
    /private BOS transport data/
  );
  await assert.rejects(
    adapter({request: async () => ({status: 200, body: {message: "Bearer private"}})})
      .invokeStateAction(stateAction),
    /private BOS transport data/
  );
  await assert.rejects(
    adapter({
      request: async () => ({
        status: 400,
        body: {
          error: {
            ...publicError("invalid_request"),
            message: canonicalSensitiveWordMessage,
            details: [{access_token: "private"}]
          }
        }
      })
    }).invokeStateAction(stateAction),
    /private BOS transport data/
  );
});

test("adapter rejects malformed actions, unsafe origins, private payloads, and caller handles", async () => {
  const current = adapter();
  await assert.rejects(
    current.invokeDiscoveredOperation({
      ...discoveredOperation,
      context_handle: handle("d")
    }, { text: "Synthetic Contact" }),
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
  assert.equal((await current.recoverAuthentication({ condition: "AUTHORIZATION_REQUIRED" })).protected_resource, discovered);
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
        ? { status: 401, resource: discovered, body: { error: publicError() } }
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


test("discovered source states preserve current and archived spelling through dependency validation", async () => {
  for (const availability of ["ready", "authorization_required", "configuration_required", "temporarily_unavailable", "provider_authorization_required", "source_not_available", "source_temporarily_unavailable"]) {
    const contact = structuredClone(discoveredOperation);
    contact.sources[0].availability = availability;
    const requests = [];
    const current = adapter({request: async (request) => {
      requests.push(structuredClone(request));
      return {status: 200, body: {records: []}};
    }});
    assert.equal((await current.invokeDiscoveredOperation(contact, {text: "Synthetic Contact"})).status, 200);
    assert.equal(contact.sources[0].availability, availability);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].href, contact.execution.uri);
    assert.equal(requests[0].headers["X-BOS-Context-Handle"], handle("a"));
  }
  for (const availability of ["unknown", "Ready", "AUTHORIZATION_REQUIRED"]) {
    const contact = structuredClone(discoveredOperation);
    contact.sources[0].availability = availability;
    let requests = 0;
    const current = adapter({request: async () => { requests += 1; return {status: 200, body: {records: []}}; }});
    await assert.rejects(current.invokeDiscoveredOperation(contact, {text: "Synthetic Contact"}), /immutable public schema/);
    assert.equal(requests, 0);
  }
});


test('dependency schema accepts existing optional Boolean multiple-selector limit and fails invalid metadata before requests',async()=>{
 for(const value of [true,false]) {
  const contact=structuredClone(discoveredOperation);contact.limits.multiple_selectors_per_source=value;
  const requests=[];const current=adapter({request:async request=>{requests.push(request);return {status:200,body:{records:[]}};}});
  assert.equal((await current.invokeDiscoveredOperation(contact,{text:'Synthetic Contact'})).status,200);
  assert.equal(contact.limits.multiple_selectors_per_source,value);assert.equal(requests.length,1);
  assert.equal(requests[0].headers['X-BOS-Context-Handle'],handle('a'));
 }
 for(const value of [null,'true',1,{},[]]) {
  const contact=structuredClone(discoveredOperation);contact.limits.multiple_selectors_per_source=value;
  let requests=0;const current=adapter({request:async()=>{requests++;return {status:200,body:{records:[]}};}});
  await assert.rejects(current.invokeDiscoveredOperation(contact,{text:'Synthetic Contact'}),/immutable public schema/);
  assert.equal(requests,0);
 }
 const contact=structuredClone(discoveredOperation);contact.limits.invented_selector_limit=true;
 let requests=0;const current=adapter({request:async()=>{requests++;return {status:200,body:{records:[]}};}});
 await assert.rejects(current.invokeDiscoveredOperation(contact,{text:'Synthetic Contact'}),/immutable public schema/);assert.equal(requests,0);
});
