import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  inspectOAuthAuthorizeTarget,
  verifyProductMcpContract
} from "../scripts/lib/product-mcp-contract.mjs";
import { readJson, root } from "../scripts/lib/package-model.mjs";

const execFileAsync = promisify(execFile);

test("product MCP contract preserves BOS foundation and product-scoped routes", async () => {
  const result = await verifyProductMcpContract({ root });
  assert.equal(result.status, "passed");
  assert.deepEqual(result.violations, []);
  assert.equal(result.foundation_product, "bos");
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
