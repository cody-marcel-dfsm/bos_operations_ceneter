import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  inspectOAuthAuthorizeTarget,
  verifyExternalProductPackage,
  verifyProductMcpContract
} from "../scripts/lib/product-mcp-contract.mjs";
import { readJson, root } from "../scripts/lib/package-model.mjs";

const execFileAsync = promisify(execFile);
const authorizationScopePolicy =
  "ONE_ORGANIZATION_APPLICATION_INSTALLATION_ROLE_PER_GRANT";

const externalHandoff = {
  contract_id: "bos.authentication-handoff",
  contract_version: "1",
  authentication_manager: "bos",
  credential_lifecycle_owner: "host",
  authorization_enforcement_owner: "bos-service",
  delegation_policy: "AUTOMATIC",
  recognized_condition_categories: [
    "MISSING_GRANT",
    "EXPIRED_TOKEN",
    "REVOKED_GRANT",
    "INVALID_CLIENT",
    "INVALID_GRANT",
    "RESOURCE_MISMATCH",
    "REAUTHENTICATION_REQUIRED",
    "AUTHORIZATION_REQUIRED",
    "MCP_SESSION_CLOSED",
    "PROVIDER_AUTHORIZATION_REQUIRED"
  ],
  readiness_result: {
    owner: "bos",
    statuses: ["READY", "HOST_ACTION_REQUIRED", "NOT_READY"],
    representation: "AUTHENTICATION_READINESS_ONLY",
    authority_data: "EXCLUDED"
  }
};

async function createExternalCodexProduct(overrides = {}, serverOverrides = {}) {
  const packageRoot = await mkdtemp(join(tmpdir(), "bos-external-product-"));
  const metadata = {
    schema_version: "1",
    name: "sample-crm",
    version: "1.0.0",
    client: "codex",
    application_name: "sample-crm",
    mcp_group_name: "crm",
    resource_url: "https://example.test/mcp/apps/sample-crm/crm",
    codex_mcp_startup_timeout_sec: 180,
    codex_mcp_tool_timeout_sec: 180,
    connection_owner: "sample-crm",
    dependency_products: ["bos"],
    authentication: "oauth_2_1",
    authorization_scope_policy: authorizationScopePolicy,
    authentication_handoff: externalHandoff,
    ...overrides
  };
  await writeFile(
    join(packageRoot, ".bos-product.json"),
    `${JSON.stringify(metadata, null, 2)}\n`
  );
  await writeFile(join(packageRoot, ".mcp.json"), `${JSON.stringify({
    mcpServers: {
      [metadata.mcp_group_name]: {
        type: "http",
        url: metadata.resource_url,
        oauth_resource: metadata.resource_url,
        required: false,
        startup_timeout_sec: 180,
        tool_timeout_sec: 180,
        ...serverOverrides
      }
    }
  }, null, 2)}\n`);
  return packageRoot;
}

async function createExternalClaudeProduct(connectorLines = []) {
  const packageRoot = await mkdtemp(join(tmpdir(), "bos-external-claude-product-"));
  const metadata = {
    schema_version: "1",
    name: "sample-crm",
    version: "1.0.0",
    client: "claude",
    application_name: "sample-crm",
    mcp_group_name: "crm",
    resource_url: "https://example.test/mcp/apps/sample-crm/crm",
    codex_mcp_startup_timeout_sec: 180,
    codex_mcp_tool_timeout_sec: 180,
    connection_owner: "sample-crm",
    dependency_products: ["bos"],
    authentication: "oauth_2_1",
    authorization_scope_policy: authorizationScopePolicy,
    authentication_handoff: externalHandoff
  };
  await writeFile(
    join(packageRoot, ".bos-product.json"),
    `${JSON.stringify(metadata, null, 2)}\n`
  );
  await writeFile(
    join(packageRoot, "CONNECTORS.md"),
    [`# ${metadata.mcp_group_name} connector`, metadata.resource_url, ...connectorLines, ""].join("\n")
  );
  return packageRoot;
}

test("product MCP contract preserves BOS foundation and product-scoped routes", async () => {
  const result = await verifyProductMcpContract({ root });
  assert.equal(result.status, "passed");
  assert.deepEqual(result.violations, []);
  assert.equal(result.foundation_product, "bos");
  assert.equal(result.authorization_scope_policy, authorizationScopePolicy);
  assert.deepEqual(result.external_product_contract, {
    contract_id: "bos.external-product-dependency",
    contract_version: "1",
    metadata_file: ".bos-product.json",
    metadata_schema: "bos://contracts/external-product-dependency/v1",
    foundation_dependency: "bos",
    product_source_location: "EXTERNAL_ALLOWED",
    connection_owner: "DEPENDENT_PRODUCT",
    authentication_manager: "bos",
    credential_lifecycle_owner: "host",
    authorization_enforcement_owner: "bos-service",
    authorization_scope_policy: authorizationScopePolicy,
    authentication_handoff_contract: "bos.authentication-handoff/v1",
    compatibility: {
      additive_fields: "ACCEPT",
      unknown_authentication_condition: "DELEGATE_TO_BOS",
      breaking_change: "NEW_CONTRACT_MAJOR"
    }
  });
  assert.deepEqual(result.products.map(({ name, dependencies, resource_url }) => ({
    name,
    dependencies,
    resource_url
  })), [
    {
      name: "bos",
      dependencies: [],
      resource_url: "https://dfsm.ai/mcp/apps/bos/platform"
    },
    {
      name: "education-center",
      dependencies: ["bos"],
      resource_url: "https://dfsm.ai/mcp/apps/leaddirector/education-center"
    }
  ]);
});

test("product MCP contract rejects any widened authorization scope policy", async () => {
  const contract = await readJson(`${root}/contracts/product-mcp-connections.v1.json`);
  const directory = await mkdtemp(join(tmpdir(), "bos-product-contract-"));
  try {
    const contractPath = join(directory, "product-mcp-connections.v1.json");
    await writeFile(contractPath, `${JSON.stringify({
      ...contract,
      authorization_scope_policy: "MULTIPLE_ORGANIZATIONS_PER_GRANT"
    }, null, 2)}\n`);
    const result = await verifyProductMcpContract({ root, contractPath });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.violations.map(({ code }) => code), ["contract_shape"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("active package metadata keeps connection ownership outside the generic BOS handoff", async () => {
  const contract = await readJson(`${root}/contracts/product-mcp-connections.v1.json`);
  for (const product of contract.products) {
    assert.equal(product.authentication_handoff.authentication_manager, "bos");
    assert.equal(product.authentication_handoff.credential_lifecycle_owner, "host");
    assert.equal(product.authentication_handoff.delegation_policy, "AUTOMATIC");
    assert.deepEqual(
      product.authentication_handoff.readiness_result.statuses,
      ["READY", "HOST_ACTION_REQUIRED", "NOT_READY"]
    );
    assert.equal("connection_owner" in product.authentication_handoff, false);
    assert.equal("continuation_policy" in product.authentication_handoff, false);
  }
  for (const path of [
    `${root}/clients/codex/plugins/bos/.bos-product.json`,
    `${root}/clients/claude/plugins/bos/.bos-product.json`,
    `${root}/clients/copilot/products/bos/.bos-product.json`,
    `${root}/clients/gemini/extensions/bos/.bos-product.json`
  ]) {
    const metadata = await readJson(path);
    assert.equal(metadata.authorization_scope_policy, authorizationScopePolicy);
  }
});

test("external product metadata schema keeps v1 extensible and BOS-managed", async () => {
  const schema = await readJson(
    `${root}/contracts/external-product-dependency.v1.schema.json`
  );
  assert.equal(schema.$id, "bos://contracts/external-product-dependency/v1");
  assert.equal(schema.additionalProperties, true);
  assert.equal(
    schema.properties.authentication_handoff.properties.authentication_manager.const,
    "bos"
  );
  assert.equal(
    schema.properties.authentication_handoff.properties.readiness_result
      .properties.authority_data.const,
    "EXCLUDED"
  );
  assert.equal(
    "continuation_policy" in schema.properties.authentication_handoff.properties,
    false
  );
  assert.equal(schema.properties.authentication_handoff.additionalProperties, false);
  assert.equal(schema.properties.codex_mcp_startup_timeout_sec.minimum, 180);
  assert.equal(schema.properties.codex_mcp_tool_timeout_sec.minimum, 180);
  assert.equal(
    schema.properties.resource_url.not.const,
    "https://dfsm.ai/mcp/apps/bos/platform"
  );
  assert.equal(
    schema.properties.authorization_scope_policy.const,
    authorizationScopePolicy
  );
  assert(schema.required.includes("authorization_scope_policy"));
});

test("external product package validates without repository product source", async () => {
  const packageRoot = await createExternalCodexProduct();
  try {
    const result = await verifyExternalProductPackage({ root, packageRoot });
    assert.equal(result.status, "passed");
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.external_product, {
      name: "sample-crm",
      client: "codex",
      connection_owner: "sample-crm",
      authentication_manager: "bos",
      authorization_scope_policy: authorizationScopePolicy,
      resource_url: "https://example.test/mcp/apps/sample-crm/crm"
    });
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("external Codex products reject session-blocking MCP startup", async () => {
  const packageRoot = await createExternalCodexProduct({}, { required: true });
  try {
    const result = await verifyExternalProductPackage({ root, packageRoot });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.violations.map(({ code }) => code), [
      "external_mcp_binding"
    ]);
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("external product validation accepts an arbitrary package outside repository inventory", async () => {
  const packageRoot = await createExternalCodexProduct({
    name: "independent-customer-intelligence",
    application_name: "customer-intelligence",
    mcp_group_name: "customer-operations",
    resource_url: "https://extensions.example.test/mcp/customer-operations",
    connection_owner: "independent-customer-intelligence"
  });
  try {
    const result = await verifyExternalProductPackage({ root, packageRoot });
    assert.equal(result.status, "passed");
    assert.deepEqual(result.violations, []);
    assert.equal(result.external_product.name, "independent-customer-intelligence");
    assert.equal(result.external_product.resource_url, "https://extensions.example.test/mcp/customer-operations");
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("external product rejects a missing or widened authorization scope policy", async () => {
  for (const value of [undefined, "MULTIPLE_ORGANIZATIONS_PER_GRANT"]) {
    const packageRoot = await createExternalCodexProduct(
      value === undefined
        ? { authorization_scope_policy: undefined }
        : { authorization_scope_policy: value }
    );
    try {
      const result = await verifyExternalProductPackage({ root, packageRoot });
      assert.equal(result.status, "failed");
      assert.deepEqual(result.violations.map(({ code }) => code), [
        "authorization_scope_policy"
      ]);
    } finally {
      await rm(packageRoot, { recursive: true, force: true });
    }
  }
});

test("external product metadata rejects caller operation state in the BOS handoff", async () => {
  const packageRoot = await createExternalCodexProduct({
    authentication_handoff: {
      ...externalHandoff,
      connection_owner: "sample-crm",
      continuation_policy: {
        maximum_automatic_resume_attempts: 1
      }
    }
  });
  try {
    const result = await verifyExternalProductPackage({ root, packageRoot });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.violations.map(({ code }) => code), [
      "authentication_handoff_scope",
      "authentication_handoff_scope"
    ]);
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("external product package rejects self-managed authentication and missing BOS dependency", async () => {
  const packageRoot = await createExternalCodexProduct({
    dependency_products: [],
    authentication_handoff: {
      ...externalHandoff,
      authentication_manager: "sample-crm"
    }
  });
  try {
    const result = await verifyExternalProductPackage({ root, packageRoot });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.violations.map(({ code }) => code), [
      "authentication_manager",
      "missing_foundation_dependency"
    ]);
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("external product package rejects the BOS platform resource and credential query strings", async () => {
  const cases = [
    ["https://dfsm.ai/mcp/apps/bos/platform", "foundation_resource_reuse"],
    ["https://dfsm.ai/mcp/apps/bos/platform/", "foundation_resource_reuse"],
    ["https://example.test/mcp/apps/sample-crm/crm?access_token=secret", "external_resource_url"]
  ];
  for (const [resource_url, expectedCode] of cases) {
    const packageRoot = await createExternalCodexProduct({ resource_url });
    try {
      const result = await verifyExternalProductPackage({ root, packageRoot });
      assert.equal(result.status, "failed");
      assert.deepEqual(
        result.violations.map(({ code }) => code),
        [expectedCode]
      );
    } finally {
      await rm(packageRoot, { recursive: true, force: true });
    }
  }
});

test("external products may share a public application resource without inventory registration", async () => {
  const packageRoot = await createExternalCodexProduct({
    name: "independent-education-analytics",
    application_name: "education-analytics",
    mcp_group_name: "education-operations",
    resource_url: "https://dfsm.ai/mcp/apps/leaddirector/education-center",
    connection_owner: "independent-education-analytics"
  });
  try {
    const result = await verifyExternalProductPackage({ root, packageRoot });
    assert.equal(result.status, "passed");
    assert.deepEqual(result.violations, []);
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("external Codex package rejects self-managed authorization and short budgets", async () => {
  const packageRoot = await createExternalCodexProduct({
    codex_mcp_startup_timeout_sec: 1,
    codex_mcp_tool_timeout_sec: 1
  }, {
    startup_timeout_sec: 1,
    tool_timeout_sec: 1,
    headers: {
      Authorization: "Bearer secret"
    },
    bearer_token_env_var: "MYCRM_TOKEN"
  });
  try {
    const result = await verifyExternalProductPackage({ root, packageRoot });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.violations.map(({ code }) => code), [
      "codex_mcp_timeout_budget",
      "codex_metadata_timeout_budget",
      "connection_credential_material",
      "connection_credential_material"
    ]);
    assert.deepEqual(
      result.violations
        .filter(({ code }) => code === "connection_credential_material")
        .map(({ message }) => message),
      [
        "Product MCP connection artifact must not manage authentication through mcpServers.crm.headers.",
        "Product MCP connection artifact must not manage authentication through mcpServers.crm.bearer_token_env_var."
      ]
    );
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("external structured connection artifacts reject camel-case credential bindings", async () => {
  const cases = [
    [{ bearerTokenEnvVar: "CRM_TOKEN" }, "mcpServers.crm.bearerTokenEnvVar"],
    [{ credentialEnvVar: "CRM_CREDENTIAL" }, "mcpServers.crm.credentialEnvVar"],
    [{ token: "secret" }, "mcpServers.crm.token"],
    [{ oauthToken: "secret" }, "mcpServers.crm.oauthToken"],
    [{ APIKey: "secret" }, "mcpServers.crm.APIKey"],
    [{ env: { CRM_TOKEN: "secret" } }, "mcpServers.crm.env"],
    [{ password: "secret" }, "mcpServers.crm.password"],
    [{ env: { CRM_PASSWORD: "secret" } }, "mcpServers.crm.env"],
    [{ privateKey: "secret" }, "mcpServers.crm.privateKey"],
    [{ authHeader: "secret" }, "mcpServers.crm.authHeader"],
    [{ headers: { Cookie: "secret" } }, "mcpServers.crm.headers"]
  ];
  for (const [serverOverrides, fieldPath] of cases) {
    const packageRoot = await createExternalCodexProduct({}, serverOverrides);
    try {
      const result = await verifyExternalProductPackage({ root, packageRoot });
      assert.equal(result.status, "failed", fieldPath);
      assert.deepEqual(result.violations.map(({ code }) => code), [
        "connection_credential_material"
      ], fieldPath);
      assert.equal(
        result.violations[0].message,
        `Product MCP connection artifact must not manage authentication through ${fieldPath}.`,
        fieldPath
      );
    } finally {
      await rm(packageRoot, { recursive: true, force: true });
    }
  }
});

test("external Claude package rejects quoted JSON, YAML, and TOML credential material", async () => {
  const packageRoot = await createExternalClaudeProduct([
    "```json",
    '{"Authorization": "Bearer secret"}',
    "```",
    'headers = { authorization = "Basic secret" }',
    '\"X-API-Key\": \"secret\"',
    'client_secret = "secret"'
  ]);
  try {
    const result = await verifyExternalProductPackage({ root, packageRoot });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.violations.map(({ code }) => code), [
      "connection_credential_material",
      "connection_credential_material",
      "connection_credential_material"
    ]);
    assert.deepEqual(result.violations.map(({ message }) => message), [
      "Product MCP connection artifact must not manage authentication through Authorization.",
      "Product MCP connection artifact must not manage authentication through X-API-Key.",
      "Product MCP connection artifact must not manage authentication through token_or_secret."
    ]);
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("external Claude package rejects generic authorization, token, and secret assignments", async () => {
  const cases = [
    ['Authorization: ${TOKEN}', "Authorization"],
    ['Authorization: Token secret', "Authorization"],
    ['authHeader = "secret"', "Authorization"],
    ['xApiKey = "secret"', "X-API-Key"],
    ['x_api_key = "secret"', "X-API-Key"],
    ['token = "secret"', "token_or_secret"],
    ['secret = "secret"', "token_or_secret"],
    ['credential_env = "CRM_CREDENTIAL"', "token_or_secret"],
    ['password = "secret"', "password_or_passphrase"],
    ['passphrase = "secret"', "password_or_passphrase"],
    ['privateKey = "secret"', "private_key"],
    ['Cookie: session=secret', "Cookie"]
  ];
  for (const [declaration, marker] of cases) {
    const packageRoot = await createExternalClaudeProduct([declaration]);
    try {
      const result = await verifyExternalProductPackage({ root, packageRoot });
      assert.equal(result.status, "failed", declaration);
      assert.deepEqual(result.violations.map(({ code }) => code), [
        "connection_credential_material"
      ], declaration);
      assert.equal(
        result.violations[0].message,
        `Product MCP connection artifact must not manage authentication through ${marker}.`,
        declaration
      );
    } finally {
      await rm(packageRoot, { recursive: true, force: true });
    }
  }
});

test("external package validation CLI accepts a package root", async () => {
  const packageRoot = await createExternalCodexProduct();
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        `${root}/scripts/verify-product-mcp-contract.mjs`,
        "--format", "json",
        "--external-product-root", packageRoot
      ],
      { cwd: root }
    );
    assert.equal(stderr, "");
    const result = JSON.parse(stdout);
    assert.equal(result.contract_id, "bos.external-product-dependency");
    assert.equal(result.status, "passed");
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("every active product owns a distinct generated MCP connection", async () => {
  const contract = await readJson(`${root}/contracts/product-mcp-connections.v1.json`);
  assert.equal(new Set(contract.products.map(({ resource_url }) => resource_url)).size, 2);
  for (const product of contract.products) {
    assert.equal(product.connection_artifacts.length, 4);
    assert.ok(product.connection_artifacts.every((path) => path.includes(`/${product.name}/`)));
  }
});

test("OAuth evidence is checked against the selected product resource", async () => {
  const contract = await readJson(`${root}/contracts/product-mcp-connections.v1.json`);
  const education = contract.products.find(({ name }) => name === "education-center");
  const authorize = new URL(education.oauth.authorization_endpoint);
  authorize.searchParams.set("resource", education.resource_url);
  assert.deepEqual(inspectOAuthAuthorizeTarget(
    authorize.href,
    education.resource_url,
    education.oauth
  ), []);

  authorize.searchParams.set("resource", "https://dfsm.ai/mcp/apps/bos/platform");
  assert.deepEqual(inspectOAuthAuthorizeTarget(
    authorize.href,
    education.resource_url,
    education.oauth
  ).map(({ code }) => code), ["oauth_resource_target"]);
});

test("product MCP contract CLI returns machine-readable evidence", async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [`${root}/scripts/verify-product-mcp-contract.mjs`, "--format", "json"],
    { cwd: root }
  );
  assert.equal(stderr, "");
  const result = JSON.parse(stdout);
  assert.equal(result.contract_id, "bos.product-mcp-connections");
  assert.equal(result.status, "passed");
});

test("product-specific OAuth CLI rejects another product resource", async () => {
  const bos = await readJson(`${root}/products/bos/product.json`);
  const authorize = new URL(bos.oauth.authorization_endpoint);
  authorize.searchParams.set("resource", bos.mcp_resource_url);
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        `${root}/scripts/verify-product-mcp-contract.mjs`,
        "--format", "json",
        "--product", "education-center",
        "--oauth-authorize-url", authorize.href
      ],
      { cwd: root }
    ),
    (error) => {
      const result = JSON.parse(error.stdout);
      assert.equal(result.status, "failed");
      assert.deepEqual(result.violations.map(({ code }) => code), ["oauth_resource_target"]);
      return true;
    }
  );
});
