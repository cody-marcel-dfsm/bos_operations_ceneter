import assert from "node:assert/strict";
import test from "node:test";
import {createBosExternalDependencyAdapter} from "../source/platform/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs";

const action = {verb: "complete", method: "POST", href: "/bos/synthetic/complete", payload_schema: {type: "object", properties: {confirmed: {type: "boolean"}}, additionalProperties: false}};
function create(overrides = {}) {
  const calls = [];
  const hostTransport = {request: async request => {calls.push(request); return {status: 200, body: {status: "completed"}};}, recoverAuthentication: async () => {}, getProtectedResource: async () => "https://example.invalid/mcp", ...overrides};
  const adapter = createBosExternalDependencyAdapter({hostTransport, contextProvider: {getCurrentContext: async () => ({contract_version: "bos-identity-mcp/v1"}), getExecutionContextHeader: async () => "X-BOS-Context-Handle"}});
  return {adapter, calls};
}

test("missing or forged approval blocks sensitive returned actions", async () => {
  for (const verifyExecutionIntent of [undefined, async () => false, async () => ({approved: true})]) {
    const {adapter, calls} = create({captureExecutionScope: async () => async () => true, verifyExecutionIntent});
    await assert.rejects(adapter.invokeReturnedAction(action, {confirmed: true}), /execution review is required/);
    assert.equal(calls.length, 0);
  }
});

test("missing scope proof blocks sensitive execution even with approved intent", async () => {
  const {adapter, calls} = create({verifyExecutionIntent: async () => true});
  await assert.rejects(adapter.invokeReturnedAction(action, {}), /scope changed or is unverified/);
  assert.equal(calls.length, 0);
});

test("review receives a separate snapshot and cannot replace outgoing intent", async () => {
  const {adapter, calls} = create({captureExecutionScope: async () => async () => true, verifyExecutionIntent: async intent => {intent.request.body = '{"confirmed":false}'; return true;}});
  await adapter.invokeReturnedAction(action, {confirmed: true});
  assert.equal(calls[0].body, '{"confirmed":true}');
});

test("a scope change during asynchronous approval stops execution", async () => {
  let sameScope = true;
  const {adapter, calls} = create({captureExecutionScope: async () => async () => sameScope, verifyExecutionIntent: async () => {sameScope = false; return true;}});
  await assert.rejects(adapter.invokeReturnedAction(action, {}), /scope changed or is unverified/);
  assert.equal(calls.length, 0);
});

test("read-only state remains available without an execution-review capability", async () => {
  const {adapter, calls} = create();
  await adapter.invokeStateAction({verb: "state", method: "GET", href: "/bos/synthetic/state", payload_schema: null});
  assert.equal(calls.length, 1);
});

test("actor, organization, installation, app and role changes block recovered read replay", async () => {
  for (const dimension of ["actor", "organization", "installation", "application", "role"]) {
    let scope = `synthetic-original-${dimension}`;
    let sends = 0;
    const {adapter} = create({
      captureExecutionScope: async () => {const pinned = scope; return async () => pinned === scope;},
      request: async () => {sends++; return {status: 401, body: {error: {code: "AUTHENTICATION_REQUIRED"}}};},
      recoverAuthentication: async () => {
        scope = `synthetic-changed-${dimension}`;
        return {schema_version: "bos.authentication-handoff/v1", message_type: "result", protected_resource: "https://example.invalid/mcp", status: "READY"};
      }
    });
    await assert.rejects(adapter.invokeStateAction({verb: "state", method: "GET", href: "/bos/synthetic/state", payload_schema: null}), /scope changed or is unverified/);
    assert.equal(sends, 1);
  }
});
