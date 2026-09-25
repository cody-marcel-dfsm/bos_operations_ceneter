import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveContext } from '../source/platform/bos-mcp-client/scripts/context-selection.mjs';
import { validateCustomerSettings } from '../scripts/install-package.mjs';
const context = (org, role = 'Staff', install = 'Main', isDefault = role === 'Staff') => ({
  context_handle: `bos_ctx_v2_${createHash('sha256').update(`${org}:${role}:${install}`).digest('hex')}`,
  organization_name: org,
  application_name: 'Lead Director',
  installation_name: install,
  role_label: role,
  is_default: isDefault
});
const discovery = {
  contract_version: 'bos-identity-mcp/v2',
  contexts: [context('North'), context('South'), context('North', 'Director', 'Main', false)]
};

test('identity compatibility publishes only the approved v2 context shape and header', async () => {
  const contract = JSON.parse(await readFile(
    new URL('../contracts/identity-context-compatibility.v1.json', import.meta.url),
    'utf8'
  ));
  assert.deepEqual(contract.public_context_fields, [
    'context_handle',
    'organization_name',
    'application_name',
    'installation_name',
    'role_label',
    'is_default'
  ]);
  assert.equal(contract.deterministic_http_context_header, 'X-BOS-Context-Handle');
  assert.deepEqual(contract.deterministic_http_context_binding_scope, [
    'described_operations',
    'journey_registration',
    'returned_journey_lifecycle_and_state_actions'
  ]);
  assert.equal(contract.legacy_http_context_header, null);
  const serialized = JSON.stringify(contract.public_context_fields);
  for (const forbidden of [
    'org_id', 'app_code', 'installed_app_id', 'role_id', 'rank', 'capabilities'
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
test('saved defaults resolve a fresh authorized context without repeated organization questions', () => {
  assert.equal(
    resolveContext(discovery, {
      defaults: { organization_name: 'North' },
      applicationName: 'Lead Director'
    }).context.role_label,
    'Staff'
  );
  assert.equal(
    resolveContext(discovery, {
      request: { organization_name: 'North', role_label: 'Director' },
      applicationName: 'Lead Director'
    }).context.role_label,
    'Director'
  );
});
test('explicit organization replaces all defaults and never changes them', () => {
  const defaults = { organization_name: 'North', installation_name: 'Old', role_label: 'Director' };
  assert.equal(resolveContext(discovery, {
    request: { organization_name: 'South' }, defaults, applicationName: 'Lead Director'
  }).context.organization_name, 'South');
  assert.equal(defaults.organization_name, 'North');
});
test('missing default never scans or falls back to another organization', () => {
  assert.equal(resolveContext(discovery, { defaults: { organization_name: 'Removed' } }).status, 'default_context_unavailable');
});
test('multiple roles or installations require disambiguation without privilege ranking', () => {
  const tied = {
    ...discovery,
    contexts: [context('North', 'Staff', 'Main', true), context('North', 'Director', 'Main', true)]
  };
  assert.equal(resolveContext(tied, { defaults: { organization_name: 'North' } }).status, 'context_ambiguous');
  const multi = {
    ...discovery,
    contexts: [context('South'), context('South', 'Staff', 'Other')]
  };
  assert.equal(resolveContext(multi, { defaults: { organization_name: 'South' } }).status, 'context_ambiguous');
});
test('wrong app, malformed discovery and fabricated handle preferences fail closed', () => {
  assert.equal(resolveContext(discovery, { applicationName: 'Other' }).status, 'default_context_unavailable');
  assert.equal(resolveContext({ ...discovery, contexts: [{}] }).status, 'invalid_discovery');
  assert.equal(resolveContext({
    ...discovery,
    contexts: [{ ...context('North'), org_id: 'private' }]
  }).status, 'invalid_discovery');
  assert.equal(resolveContext({
    ...discovery,
    contexts: [{ ...context('North'), authority_rank: 100 }]
  }).status, 'invalid_discovery');
  assert.equal(resolveContext({
    ...discovery,
    contexts: [{ ...context('North'), capabilities: ['admin'] }]
  }).status, 'invalid_discovery');
  assert.equal(resolveContext(discovery, { defaults: { context_handle: 'invented' } }).status, 'invalid_preference');
  assert.equal(resolveContext({ ...discovery, contract_version: 'legacy' }).status, 'unsupported_contract');
});
test('customer settings accepts bounded labels and rejects authority and executable selectors', () => {
  const base = { schema_version: '1', brand_display_name: 'Example', organization_display_name: 'Example', organization_website_url: 'https://example.com', location_display_name: 'Example', timezone: 'UTC' };
  assert.deepEqual(validateCustomerSettings({ ...base, default_context: { organization_name: 'North', installation_name: '', role_label: '' } }), []);
  assert.deepEqual(validateCustomerSettings({ ...base, default_context: { organization_name: 'North', role_code: 'Staff' } }), []);
  assert(validateCustomerSettings({
    ...base,
    default_context: { organization_name: 'North', role_label: 'Staff', role_code: 'staff' }
  }).some(message => message.includes('both role_label and legacy role_code')));
  for (const default_context of [{ org_id: 'raw' }, { organization_name: '' }, { organization_name: 'North\nSouth' }, [], null]) {
    assert(validateCustomerSettings({ ...base, default_context }).some(message => message.includes('default_context')));
  }
  assert.deepEqual(validateCustomerSettings(base), []); // Legacy overlays remain readable for setup migration.
});

test('plugin preferences persist outside product roots and remain isolated', async () => {
  const { mkdtemp, rm, stat } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { savePluginPreferences, readPluginPreferences } = await import('../source/platform/bos-mcp-client/scripts/customer-preferences.mjs');
  const root = await mkdtemp(join(tmpdir(), 'bos-default-test-'));
  try {
    const bosPath = join(root, 'BOS', 'plugins', 'bos', 'customer-preferences.json');
    const crmPath = join(root, 'BOS', 'plugins', 'my-crm', 'customer-preferences.json');
    assert.equal(await readPluginPreferences('bos', bosPath, []), null);
    assert.equal(await readPluginPreferences('my-crm', crmPath, []), null);
    await savePluginPreferences('bos', { organization_name: 'North', role_label: 'Staff' }, bosPath);
    await savePluginPreferences('my-crm', { organization_name: 'South' }, crmPath);
    assert.equal((await readPluginPreferences('bos', bosPath, [])).default_context.organization_name, 'North');
    assert.equal((await readPluginPreferences('my-crm', crmPath, [])).default_context.organization_name, 'South');
    await assert.rejects(readPluginPreferences('bos', crmPath, []), /Invalid customer preferences/);
    assert.equal((await stat(bosPath)).mode & 0o777, 0o600);
    assert.equal((await stat(crmPath)).mode & 0o777, 0o600);
    await assert.rejects(savePluginPreferences('my-crm', { organization_name: 'South', context_handle: 'stale' }, crmPath));
    await assert.rejects(savePluginPreferences('../escape', { organization_name: 'South' }, crmPath));
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('active Education Center composition detects default migration on every client', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const path of [
    'clients/codex/plugins/education-center', 'clients/claude/plugins/education-center',
    'clients/copilot/products/education-center', 'clients/gemini/extensions/education-center'
  ]) {
    const guidance = await readFile(`${path}/skills/crm-record-operations/SKILL.md`, 'utf8');
    assert.match(guidance, /missing\/invalid `default_context`/);
    assert.match(guidance, /missing\/invalid product-specific BOS/);
    assert.match(guidance, /confirmed valid mirror for this plugin without asking again/);
    assert.match(guidance, /optional plugin-profile setup tools do not block an independently advertised/);
    assert.match(guidance, /preserve operation-specific readiness requirements/);
    const metadata = JSON.parse(await readFile(`${path}/.bos-product.json`, 'utf8'));
    assert.equal(metadata.execution_context_compatibility, 'bos.identity-context-compatibility/v1');
  }
});


test('legacy confirmed organization survives upgrade without rewriting its file', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readPreferences, savePreferences } = await import('../source/platform/bos-mcp-client/scripts/customer-preferences.mjs');
  const root = await mkdtemp(join(tmpdir(), 'bos-legacy-default-'));
  try {
    const current = join(root, 'current.json'), legacy = join(root, 'legacy.json');
    const original = JSON.stringify({ schema_version: 'bos-client-preferences/v1', default_organization_label: 'North', updated_at: '2026-08-31T02:43:33Z' });
    await writeFile(legacy, original);
    assert.equal((await readPreferences(current, legacy)).default_context.organization_name, 'North');
    assert.equal(await readFile(legacy, 'utf8'), original);
    await savePreferences({ organization_name: 'South' }, current);
    assert.equal((await readPreferences(current, legacy)).default_context.organization_name, 'South');
    await rm(current);
    await writeFile(legacy, original.replace('bos-client-preferences/v1', 'unknown'));
    await assert.rejects(readPreferences(current, legacy));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('legacy shared preference migrates only to the BOS plugin namespace', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readPluginPreferences } = await import('../source/platform/bos-mcp-client/scripts/customer-preferences.mjs');
  const root = await mkdtemp(join(tmpdir(), 'bos-shared-default-'));
  try {
    const missingBos = join(root, 'plugins', 'bos', 'customer-preferences.json');
    const missingCrm = join(root, 'plugins', 'my-crm', 'customer-preferences.json');
    const shared = join(root, 'customer-preferences.json');
    await writeFile(shared, JSON.stringify({
      schema_version: 'bos.customer-preferences/v1',
      default_context: { organization_name: 'North' }
    }));
    assert.equal((await readPluginPreferences('bos', missingBos, [shared])).default_context.organization_name, 'North');
    assert.equal(await readPluginPreferences('my-crm', missingCrm, []), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('legacy current role code is converted only in memory and rematched as a safe label', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readPreferences } = await import('../source/platform/bos-mcp-client/scripts/customer-preferences.mjs');
  const root = await mkdtemp(join(tmpdir(), 'bos-current-default-'));
  try {
    const path = join(root, 'customer-preferences.json');
    const original = JSON.stringify({
      schema_version: 'bos.customer-preferences/v1',
      default_context: { organization_name: 'North', role_code: 'Staff' }
    });
    await writeFile(path, original);
    const migrated = await readPreferences(path, null);
    assert.deepEqual(migrated.default_context, {
      organization_name: 'North',
      role_label: 'Staff'
    });
    assert.equal(await readFile(path, 'utf8'), original);
  } finally { await rm(root, { recursive: true, force: true }); }
});
