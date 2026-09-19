import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveContext } from '../source/platform/bos-mcp-client/scripts/context-selection.mjs';
import { validateCustomerSettings } from '../scripts/install-package.mjs';
const context = (org, role = 'staff', install = 'Main') => ({ organization_name: org, org_id: org, app_code: 'crm', installation_name: install, installed_app_id: org + install, actor_role_id: role, context_handle: org + install + role });
const discovery = { contract_version: 'bos-identity-mcp/v2', contexts: [context('North'), context('South'), context('North', 'director')] };
test('saved defaults resolve a fresh authorized context without repeated organization questions', () => {
  assert.equal(resolveContext(discovery, { defaults: { organization_name: 'North', role_code: 'staff' } }).context.context_handle, 'NorthMainstaff');
});
test('explicit organization replaces all defaults and never changes them', () => {
  const defaults = { organization_name: 'North', installation_name: 'Old', role_code: 'director' };
  assert.equal(resolveContext(discovery, { request: { organization_name: 'South' }, defaults }).context.org_id, 'South');
  assert.equal(defaults.organization_name, 'North');
});
test('missing default never scans or falls back to another organization', () => {
  assert.equal(resolveContext(discovery, { defaults: { organization_name: 'Removed' } }).status, 'default_context_unavailable');
});
test('multiple roles or installations require disambiguation without privilege ranking', () => {
  assert.equal(resolveContext(discovery, { defaults: { organization_name: 'North' } }).status, 'context_ambiguous');
  const multi = { ...discovery, contexts: [context('South'), context('South', 'staff', 'Other')] };
  assert.equal(resolveContext(multi, { defaults: { organization_name: 'South' } }).status, 'context_ambiguous');
});
test('wrong app, malformed discovery and fabricated handle preferences fail closed', () => {
  assert.equal(resolveContext(discovery, { appCode: 'other' }).status, 'default_context_unavailable');
  assert.equal(resolveContext({ ...discovery, contexts: [{}] }).status, 'invalid_discovery');
  assert.equal(resolveContext(discovery, { defaults: { context_handle: 'invented' } }).status, 'invalid_preference');
  assert.equal(resolveContext({ ...discovery, contract_version: 'legacy' }).status, 'unsupported_contract');
});
test('customer settings accepts bounded labels and rejects authority and executable selectors', () => {
  const base = { schema_version: '1', brand_display_name: 'Example', organization_display_name: 'Example', organization_website_url: 'https://example.com', location_display_name: 'Example', timezone: 'UTC' };
  assert.deepEqual(validateCustomerSettings({ ...base, default_context: { organization_name: 'North', installation_name: '', role_code: '' } }), []);
  for (const default_context of [{ org_id: 'raw' }, { organization_name: '' }, { organization_name: 'North\nSouth' }, [], null]) {
    assert(validateCustomerSettings({ ...base, default_context }).some(message => message.includes('default_context')));
  }
  assert.deepEqual(validateCustomerSettings(base), []); // Legacy overlays remain readable for setup migration.
});

test('shared preferences persist outside product roots and survive independent readers', async () => {
  const { mkdtemp, rm, stat } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { savePreferences, readPreferences } = await import('../source/platform/bos-mcp-client/scripts/customer-preferences.mjs');
  const root = await mkdtemp(join(tmpdir(), 'bos-default-test-'));
  try {
    const path = join(root, 'BOS', 'customer-preferences.json');
    assert.equal(await readPreferences(path), null);
    await savePreferences({ organization_name: 'North', role_code: 'staff' }, path);
    assert.equal((await readPreferences(path)).default_context.organization_name, 'North');
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await assert.rejects(savePreferences({ organization_name: 'North', context_handle: 'stale' }, path));
    assert.equal((await readPreferences(path)).default_context.role_code, 'staff');
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
    assert.match(guidance, /missing\/invalid shared BOS customer/);
    assert.match(guidance, /confirmed valid mirror without asking again/);
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
