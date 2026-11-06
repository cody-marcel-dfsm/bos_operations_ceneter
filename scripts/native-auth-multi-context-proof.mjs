// Private owner-produced synthetic boundary proof; never native authentication.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolveContext} from '../source/platform/bos-mcp-client/scripts/context-selection.mjs';

const contexts = ['North', 'South', 'West'].map(organization_name => ({
  context_handle: 'bos_ctx_v2_' + createHash('sha256').update(organization_name).digest('hex'),
  organization_name, application_name: 'Synthetic app', installation_name: 'Synthetic install',
  role_label: 'Staff', is_default: true
}));
const catalog = {contract_version: 'bos-identity-mcp/v2', contexts};
const select = organization_name => resolveContext(catalog, {request: {organization_name}});
const sequential = ['North', 'South', 'West', 'North'].map(name => select(name).context);
assert.deepEqual(sequential.map(row => row.organization_name), ['North', 'South', 'West', 'North']);
assert.equal(sequential[0].context_handle, sequential[3].context_handle);
const parallel = await Promise.all(contexts.map(async row => select(row.organization_name).context));
assert.equal(new Set(parallel.map(row => row.context_handle)).size, 3);
assert.deepEqual(parallel.map(row => row.organization_name), ['North', 'South', 'West']);
const combined = Object.fromEntries(parallel.map(row => [row.organization_name, row.context_handle]));
for (const row of contexts) assert.equal(combined[row.organization_name], row.context_handle);
assert.equal(select('Foreign').status, 'requested_context_unavailable');
assert.equal(resolveContext(catalog, {request: {organization_name: 'North', role_label: 'Owner'}}).status,
  'requested_context_unavailable');
assert.equal(resolveContext(catalog, {request: {context_handle: contexts[0].context_handle}}).status,
  'invalid_preference');
const revoked = { ...catalog, contexts: contexts.slice(1) };
assert.equal(resolveContext(revoked, {request: {organization_name: 'North'}}).status,
  'requested_context_unavailable');
console.log(JSON.stringify({schema: 'bos.native-synthetic-context-proof/v1', synthetic_only: true,
  checks: ['sequential_return', 'parallel_selection', 'combined_attribution', 'foreign_target',
    'foreign_role', 'handle_preference_denied', 'removed_context_denied'], status: 'PASSED'}));
