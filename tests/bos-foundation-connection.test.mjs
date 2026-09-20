import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { root, readJson, pathExists, validateProduct } from '../scripts/lib/package-model.mjs';
import { verifyExternalProductPackage, verifyProductMcpContract } from '../scripts/lib/product-mcp-contract.mjs';

const dependentRoots = ['clients/codex/plugins', 'clients/claude/plugins', 'clients/copilot/products', 'clients/gemini/extensions'];
test('all client packages retain application requirements with only BOS transport', async () => {
  const contract = await readJson(join(root, 'contracts/product-mcp-connections.v2.json'));
  assert.deepEqual(contract.connections.map(c => c.name), ['bos']);
  assert.equal(contract.connections[0].resource_url, 'https://dfsm.ai/mcp/apps/bos/platform');
  const product = contract.products.find(p => p.name === 'education-center');
  assert.equal(product.application_name, 'leaddirector');
  assert.equal(product.connection_owner, 'bos');
  assert.ok(product.runtime_verification_tools.includes('education_center_search_leads'));
  for (const base of dependentRoots) {
    const packageRoot = join(root, base, 'education-center');
    const result = await verifyExternalProductPackage({root, packageRoot});
    assert.equal(result.status, 'passed', JSON.stringify(result.violations));
    assert.ok(await pathExists(join(packageRoot, 'skills/crm-customer-journey/SKILL.md')));
    for (const artifact of ['.mcp.json', '.app.json', '.github/mcp.json', 'mcp_config.json', 'CONNECTORS.md']) {
      assert.equal(await pathExists(join(packageRoot, artifact)), false, artifact);
    }
  }
});

for (const [field, value, code] of [
  ['connection_owner', 'education-center', 'connection_owner'],
  ['dependency_products', [], 'missing_foundation_dependency'],
  ['dependency_products', 'not-bos', 'missing_foundation_dependency'],
  ['dependency_products', ['bos', 'bos'], 'missing_foundation_dependency'],
  ['dependency_products', ['bos', 3], 'missing_foundation_dependency'],
  ['resource_url', 'https://dfsm.ai/mcp/apps/leaddirector/education-center', 'dependent_transport'],
  ['oauth', {}, 'dependent_transport'],
  ['mcp_server_name', 'Another-Connection', 'dependent_transport'],
  ['schema_version', '1', 'external_schema_version'],
  ['authorization_scope_policy', 'ALL_APPLICATIONS', 'authorization_scope_policy']
]) {
  test(`foundation dependency rejects ${field} regression`, async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), 'bos-foundation-negative-'));
    try {
      const metadata = await readJson(join(root, 'clients/codex/plugins/education-center/.bos-product.json'));
      await writeFile(join(packageRoot, '.bos-product.json'), JSON.stringify({...metadata, [field]: value}));
      const result = await verifyExternalProductPackage({root, packageRoot});
      assert.equal(result.status, 'failed');
      assert.ok(result.violations.some(v => v.code === code), JSON.stringify(result.violations));
    } finally { await rm(packageRoot, {recursive:true, force:true}); }
  });
}

test('foundation contract rejects a second host connection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bos-foundation-contract-'));
  try {
    const contract = await readJson(join(root, 'contracts/product-mcp-connections.v2.json'));
    contract.connections.push({...contract.connections[0], name:'education-center'});
    const contractPath = join(directory, 'contract.json');
    await writeFile(contractPath, JSON.stringify(contract));
    assert.equal((await verifyProductMcpContract({root, contractPath})).status, 'failed');
  } finally { await rm(directory, {recursive:true, force:true}); }
});

test('published v2 JSON Schema validates all generated dependent metadata', async () => {
  const schema = await readJson(join(root, 'contracts/external-product-dependency.v2.schema.json'));
  const validate = new Ajv2020({strict: false, allErrors: true}).compile(schema);
  const expectedConditions = [
    'MISSING_GRANT', 'EXPIRED_TOKEN', 'REVOKED_GRANT', 'INVALID_CLIENT',
    'INVALID_GRANT', 'RESOURCE_MISMATCH', 'REAUTHENTICATION_REQUIRED',
    'AUTHORIZATION_REQUIRED', 'MCP_WWW_AUTHENTICATE', 'MCP_SESSION_CLOSED',
    'PROVIDER_AUTHORIZATION_REQUIRED'
  ];
  assert.deepEqual(
    schema.properties.authentication_handoff.properties.recognized_condition_categories.const,
    expectedConditions
  );
  for (const base of dependentRoots) {
    const metadata = await readJson(join(root, base, 'education-center/.bos-product.json'));
    assert.equal(validate(metadata), true, JSON.stringify(validate.errors));
    assert.deepEqual(metadata.authentication_handoff.recognized_condition_categories, expectedConditions);
    for (const dependencies of ['not-bos', ['bos', 'bos'], ['bos', 3], []]) {
      assert.equal(validate({...metadata, dependency_products: dependencies}), false);
    }
    for (const conditions of [expectedConditions.slice(0, -1), [...expectedConditions, 'EXTRA'], [...expectedConditions].reverse()]) {
      const changed = structuredClone(metadata);
      changed.authentication_handoff.recognized_condition_categories = conditions;
      assert.equal(validate(changed), false);
      const directory = await mkdtemp(join(tmpdir(), 'bos-condition-negative-'));
      try {
        await writeFile(join(directory, '.bos-product.json'), JSON.stringify(changed));
        const result = await verifyExternalProductPackage({root, packageRoot: directory});
        assert(result.violations.some(({code}) => code === 'authentication_condition_categories'));
      } finally { await rm(directory, {recursive: true, force: true}); }
    }
    assert.equal(validate({...metadata, oauth: {}}), false);
    assert.equal(validate({...metadata, mcp_server_name: 'Another-Connection'}), false);
    assert.equal(validate({...metadata, schema_version: '1'}), false);
  }
});

test('v2 verifier enforces the complete closed authentication handoff schema', async () => {
  const metadata = await readJson(join(root, 'clients/codex/plugins/education-center/.bos-product.json'));
  const directory = await mkdtemp(join(tmpdir(), 'bos-full-schema-negative-'));
  try {
    metadata.authentication_handoff.unpublished_field = true;
    await writeFile(join(directory, '.bos-product.json'), JSON.stringify(metadata));
    const result = await verifyExternalProductPackage({root, packageRoot: directory});
    assert.equal(result.status, 'failed');
    assert(result.violations.some(({code}) => code === 'external_schema_contract'));
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test('BOS host name stays separate from the immutable OAuth audience and route', async () => {
  const bos = await readJson(join(root, 'products/bos/product.json'));
  assert.equal(bos.display_name, 'BOS Platform');
  assert.equal(bos.mcp_server_name, 'BOS-Platform');
  assert.equal(bos.mcp_group_name, 'platform');
  assert.equal(bos.mcp_resource_url, 'https://dfsm.ai/mcp/apps/bos/platform');
  assert.ok(validateProduct({...bos, mcp_server_name:'BOS Platform'}).some(message => message.includes('invalid mcp_server_name')));
  for (const path of ['clients/codex/plugins/bos/.mcp.json', 'clients/copilot/products/bos/.github/mcp.json', 'clients/gemini/extensions/bos/mcp_config.json']) {
    const config = await readJson(join(root, path));
    assert.deepEqual(Object.keys(config.mcpServers), ['BOS-Platform']);
    const server = config.mcpServers['BOS-Platform'];
    assert.equal(server.url ?? server.serverUrl, bos.mcp_resource_url);
  }
});
