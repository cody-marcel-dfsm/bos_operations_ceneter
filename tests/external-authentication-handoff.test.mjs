import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

async function read(path) {
  return readFile(`${root}/${path}`, "utf8");
}

function acceptsClosedShape(definition, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (definition.additionalProperties === false && Object.keys(value).some(
    (key) => !(key in definition.properties)
  )) return false;
  if ((definition.required ?? []).some((key) => !(key in value))) return false;
  return Object.entries(definition.properties ?? {}).every(([key, property]) => {
    if (!(key in value)) return true;
    if ("const" in property && value[key] !== property.const) return false;
    if (property.enum && !property.enum.includes(value[key])) return false;
    return true;
  });
}

test("generic authentication delegation contains only resource, condition, and host correlation", async () => {
  const [contract, schemaText, fixtureText, productContractText] = await Promise.all([
    read("source/platform/bos-mcp-client/references/external-product-authentication-handoff.md"),
    read("source/platform/bos-mcp-client/references/external-product-authentication-handoff.v1.schema.json"),
    read("tests/fixtures/external-dependent-auth-handoff.json"),
    read("contracts/product-mcp-connections.v1.json")
  ]);
  const schema = JSON.parse(schemaText);
  const fixture = JSON.parse(fixtureText);
  const productContract = JSON.parse(productContractText);
  const request = schema.$defs.request;
  const result = schema.$defs.result;

  assert.equal(schema.$id, "bos://contracts/authentication-handoff/v1");
  assert.equal(request.additionalProperties, false);
  assert.equal(result.additionalProperties, false);
  assert.equal(acceptsClosedShape(request, fixture), true);
  assert.deepEqual(Object.keys(fixture).sort(), [
    "condition",
    "host_correlation",
    "message_type",
    "protected_resource",
    "schema_version"
  ]);
  assert.deepEqual(schema.$defs.condition.properties.category.enum, [
    "authentication",
    "mcp_session"
  ]);

  const ready = {
    schema_version: "bos.authentication-handoff/v1",
    message_type: "result",
    protected_resource: fixture.protected_resource,
    status: "READY",
    host_correlation: fixture.host_correlation
  };
  assert.equal(acceptsClosedShape(result, ready), true);
  assert.deepEqual(result.properties.status.enum, [
    "READY",
    "HOST_ACTION_REQUIRED",
    "NOT_READY"
  ]);

  const publishedHandoff = productContract.products.find(
    ({ name }) => name === productContract.foundation_product
  ).authentication_handoff;
  assert.equal(
    `${publishedHandoff.contract_id}/v${publishedHandoff.contract_version}`,
    fixture.schema_version
  );
  assert.deepEqual(
    publishedHandoff.readiness_result.statuses,
    result.properties.status.enum
  );
  assert.match(contract, /defines no\s+REST endpoint, MCP operation, server registration, or product-specific service/i);
  assert.match(contract, /caller\s+owns every action after this result/i);
});

test("generic authentication delegation rejects caller identity, business state, credentials, and raw authority", async () => {
  const [schemaText, fixtureText] = await Promise.all([
    read("source/platform/bos-mcp-client/references/external-product-authentication-handoff.v1.schema.json"),
    read("tests/fixtures/external-dependent-auth-handoff.json")
  ]);
  const schema = JSON.parse(schemaText);
  const fixture = JSON.parse(fixtureText);
  const forbidden = [
    "dependent_product",
    "product_code",
    "domain_operation",
    "continuation",
    "request_hash",
    "workflow_goal",
    "approval_binding",
    "idempotency_key",
    "completed_steps",
    "pending_step",
    "recovery_attempt",
    "access_token",
    "refresh_token",
    "authorization_header",
    "credential",
    "organization_id",
    "application_id",
    "installation_id",
    "delegated_role_id",
    "context_id",
    "opaque_context",
    "customer_record",
    "provider_payload"
  ];
  for (const key of forbidden) {
    assert.equal(
      acceptsClosedShape(schema.$defs.request, { ...fixture, [key]: "forbidden" }),
      false,
      key
    );
  }
  assert.equal(
    acceptsClosedShape(schema.$defs.result, {
      schema_version: fixture.schema_version,
      message_type: "result",
      protected_resource: fixture.protected_resource,
      status: "READY",
      opaque_context: "forbidden"
    }),
    false
  );
});

test("BOS source skills limit external delegation to generic authentication readiness", async () => {
  const [integrity, client, continuation] = await Promise.all([
    read("source/platform/authentication-context-integrity/SKILL.md"),
    read("source/platform/bos-mcp-client/SKILL.md"),
    read("source/platform/bos-mcp-client/references/runtime-continuation-contract.md")
  ]);
  const clientSection = client.split("## External dependent-product authentication handoff")[1]
    .split("Codex packages also declare")[0];
  const integritySection = integrity.split("## External dependent-product authentication handoff")[1];

  for (const content of [clientSection, integritySection]) {
    assert.match(content, /exact protected\s+resource/i);
    assert.match(content, /typed readiness result|typed authentication readiness/i);
    assert.match(content, /no caller product identity|never receives the\s+caller's product identity/i);
    assert.doesNotMatch(content, /bos\.discovery\.refresh|bos\.request\.continue/);
    assert.doesNotMatch(content, /BOS[^.]*resume[^.]*caller|BOS[^.]*reconcile[^.]*caller/i);
  }
  assert.match(continuation, /caller retains its operation/i);
  assert.match(continuation, /BOS coordinates the host authentication lifecycle/i);
});

test("generated packages preserve the corrected generic handoff exactly", async () => {
  const [contract, schemaText] = await Promise.all([
    read("source/platform/bos-mcp-client/references/external-product-authentication-handoff.md"),
    read("source/platform/bos-mcp-client/references/external-product-authentication-handoff.v1.schema.json")
  ]);
  for (const productRoot of [
    "clients/codex/plugins/bos",
    "clients/codex/plugins/education-center",
    "clients/claude/plugins/bos",
    "clients/claude/plugins/education-center",
    "clients/copilot/products/bos",
    "clients/copilot/products/education-center",
    "clients/gemini/extensions/bos",
    "clients/gemini/extensions/education-center"
  ]) {
    const generatedRoot = `${productRoot}/skills/bos-mcp-client`;
    const [generatedClient, generatedContract, generatedSchema] = await Promise.all([
      read(`${generatedRoot}/SKILL.md`),
      read(`${generatedRoot}/references/external-product-authentication-handoff.md`),
      read(`${generatedRoot}/references/external-product-authentication-handoff.v1.schema.json`)
    ]);
    assert.match(generatedClient, /bos\.authentication-handoff\/v1/, productRoot);
    assert.equal(generatedContract, contract, productRoot);
    assert.equal(generatedSchema, schemaText, productRoot);
  }
});
