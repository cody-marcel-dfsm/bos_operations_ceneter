import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { root, readJson, pathExists } from '../scripts/lib/package-model.mjs';
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
  for (const base of dependentRoots) {
    const metadata = await readJson(join(root, base, 'education-center/.bos-product.json'));
    assert.equal(validate(metadata), true, JSON.stringify(validate.errors));
    for (const dependencies of ['not-bos', ['bos', 'bos'], ['bos', 3], []]) {
      assert.equal(validate({...metadata, dependency_products: dependencies}), false);
    }
    assert.equal(validate({...metadata, oauth: {}}), false);
    assert.equal(validate({...metadata, schema_version: '1'}), false);
  }
});
