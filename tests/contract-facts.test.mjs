import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {projectContractFacts} from '../source/platform/bos-app-discovery/scripts/project-contract-facts.mjs';
import {syntheticOperationDescribe, syntheticApiContract} from './helpers/synthetic-bos-discovery-service.mjs';

const scope = {organization: 'Synthetic organization', application: 'Synthetic application', installation: 'Synthetic installation', role: 'Reviewer'};
const registration = () => JSON.parse(readFileSync(new URL('./fixtures/journey-registration-contract.json', import.meta.url), 'utf8'));
const registrationV2 = () => JSON.parse(readFileSync(new URL('./fixtures/journey-registration-contract-v2.json', import.meta.url), 'utf8'));
const parent = (...operations) => ({...syntheticOperationDescribe(), operations});
const operation = name => ({...structuredClone(syntheticOperationDescribe().operations[0]), operation: name});
const entry = (document, kind = 'operation-describe', labels = scope) => ({kind, document, scope: labels});
const execution = row => Object.fromEntries(row.execution.filter(fact => fact.declared).map(fact => [fact.field, fact.value]));
const limits = row => Object.fromEntries(row.limits.map(fact => [fact.field, fact.value]));

test('registration projections preserve separately advertised v1 and v2 versions', () => {
  const documents = [registration(), registrationV2()];
  const result = projectContractFacts({documents: documents.map(raw => entry(raw, 'api-contract'))});
  assert.deepEqual(result.operations.map(row => row.contract_version), documents.map(raw => raw.contract_version));
  assert.equal(result.operations.length, 2);
  assert.deepEqual(documents[0], registration());
  assert.deepEqual(documents[1], registrationV2());
});

test('projects every registration limit and safe execution field without mutating observed contracts', () => {
  const raw = registration();
  Object.keys(raw.limits).forEach((key, index) => raw.limits[key] = index + 11);
  raw.execution.uri = '/bos/apps/lead-director/api/v1/organizations/private-fixture-route/journeys/register';
  const before = structuredClone(raw);
  const result = projectContractFacts({documents: [entry(raw, 'api-contract')]});
  const row = result.operations[0];
  assert.deepEqual(raw, before);
  assert.deepEqual(limits(row), raw.limits);
  assert.deepEqual(execution(row), {method: raw.execution.method, transport: raw.execution.transport, context_header: raw.execution.context_header});
  assert.deepEqual(row.input.required, raw.input_schema.required);
  assert.deepEqual(row.input.property_names, Object.keys(raw.input_schema.properties));
  assert.deepEqual(row.guarantees, raw.guarantees);
  assert.deepEqual(row.errors, raw.public_errors);
  assert.equal(row.document_index, 0);
  assert.equal(row.pointer, '');
  assert.equal(row.limits[0].pointer, '/limits/' + row.limits[0].field);
  const serialized = JSON.stringify(result);
  assert(!serialized.includes('private-fixture-route'));
  assert(!serialized.includes(raw.execution.uri));
  assert.deepEqual(Object.keys(result), ['schema_version', 'guarantee', 'summaries', 'operations']);
});

test('counts null, absent and declared transport by unique scope and contract kind', () => {
  const absent = operation('absent_transport');
  delete absent.execution.transport;
  const explicit = operation('null_transport');
  explicit.execution.transport = null;
  const runtime = operation('runtime_transport');
  runtime.execution = {transport: 'journey_runtime', method: null, uri: null, context_header: null};
  const unavailable = {operation: 'unavailable', status: 'not_available'};
  const result = projectContractFacts({documents: [entry(parent(absent, explicit, runtime, unavailable)), entry(registration(), 'api-contract')]});
  const publicSummary = result.summaries.find(row => row.kind === 'operation-describe');
  assert.equal(publicSummary.unique_operations, 4);
  assert.equal(publicSummary.described_operations, 3);
  assert.equal(publicSummary.unavailable_operations, 1);
  assert.deepEqual(publicSummary.transport, {absent: 1, declared_null: 1, declared_values: {journey_runtime: 1}, conflicting: 0});
  const apiSummary = result.summaries.find(row => row.kind === 'api-contract');
  assert.equal(apiSummary.unique_operations, 1);
  assert.deepEqual(apiSummary.transport.declared_values, {https: 1});
});

test('transport totals are derived from arbitrary mixed cardinalities rather than a fixed inventory', () => {
  for (let count = 1; count <= 17; count++) {
    const documents = [];
    const expected = {absent: 0, declared_null: 0, declared_values: {journey_runtime: 0}, conflicting: 0};
    for (let index = 0; index < count; index++) {
      const item = operation('generated_' + index);
      if (index % 3 === 0) { delete item.execution.transport; expected.absent++; }
      else if (index % 3 === 1) { item.execution.transport = null; expected.declared_null++; }
      else { item.execution = {transport: 'journey_runtime'}; expected.declared_values.journey_runtime++; }
      documents.push(entry(parent(item)));
      if (index % 2 === 0) documents.push(entry(parent(structuredClone(item))));
    }
    if (!expected.declared_values.journey_runtime) delete expected.declared_values.journey_runtime;
    const result = projectContractFacts({documents});
    assert.equal(result.summaries[0].unique_operations, count);
    assert.deepEqual(result.summaries[0].transport, expected);
    assert.equal(result.operations.length, documents.length);
    assert.equal(result.summaries[0].execution_groups.reduce((sum, group) => sum + group.observations.length, 0), documents.length);
  }
});

test('deduplicates equal observations while preserving conflicts and separate scopes', () => {
  const first = operation('repeat');
  first.execution.transport = null;
  const conflict = structuredClone(first);
  delete conflict.execution.transport;
  const changedLimit = structuredClone(first);
  changedLimit.limits.maximum_duration_seconds++;
  const result = projectContractFacts({documents: [entry(parent(first)), entry(parent(structuredClone(first))),
    entry(parent(conflict)), entry(parent(changedLimit)), entry(parent(first), 'operation-describe', {...scope, role: 'Another reviewer'})]});
  assert.equal(result.operations.length, 5);
  assert.deepEqual(result.operations.map(row => row.document_index), [0, 1, 2, 3, 4]);
  assert.equal(result.summaries.length, 2);
  assert.equal(result.summaries[0].duplicate_observations, 3);
  assert.equal(result.summaries[0].unique_operations, 1);
  assert.equal(result.summaries[0].conflicting_operations, 1);
  assert.equal(result.summaries[0].transport.conflicting, 1);
  assert.equal(result.summaries[0].transport.declared_null, 0);
  assert.equal(result.summaries[1].transport.declared_null, 1);
});

test('unordered declaration permutations remain duplicates while literal output order is preserved', () => {
  const raw = operation('permuted');
  raw.input_schema.properties.cursor = {type: 'string'};
  raw.input_schema.properties.next_cursor = {type: 'string'};
  raw.input_schema.required.push('cursor', 'next_cursor');
  raw.sources[0].input_schema = structuredClone(raw.input_schema);
  const permuted = structuredClone(raw);
  const reverseObject = value => Object.fromEntries(Object.entries(value).reverse());
  permuted.limits = reverseObject(permuted.limits);
  permuted.input_schema.properties = reverseObject(permuted.input_schema.properties);
  permuted.input_schema.required.reverse();
  permuted.sources[0].limits = reverseObject(permuted.sources[0].limits);
  permuted.sources[0].input_schema.properties = reverseObject(permuted.sources[0].input_schema.properties);
  permuted.sources[0].input_schema.required.reverse();
  const result = projectContractFacts({documents: [entry(parent(raw)), entry(parent(permuted))]});
  assert.equal(result.summaries[0].conflicting_operations, 0);
  assert.equal(result.summaries[0].duplicate_observations, 1);
  assert.deepEqual(result.operations[1].limits.map(row => row.field), Object.keys(permuted.limits));
  assert.deepEqual(result.operations[1].input.required, permuted.input_schema.required);
  assert.deepEqual(result.operations[1].input.property_names, Object.keys(permuted.input_schema.properties));
  assert.deepEqual(result.operations[1].sources[0].limits.map(row => row.field), Object.keys(permuted.sources[0].limits));
  assert.equal(result.operations[1].pagination_tensions[0].selector.field, 'next_cursor');
  permuted.limits.maximum_duration_seconds++;
  assert.equal(projectContractFacts({documents: [entry(parent(raw)), entry(parent(permuted))]}).summaries[0].conflicting_operations, 1);
});

test('source sequence changes remain visible without inferring source equivalence', () => {
  const raw = operation('source_sequence');
  const second = structuredClone(raw.sources[0]);
  second.source.plugin = 'second-provider';
  raw.sources.push(second);
  const reordered = structuredClone(raw);
  reordered.sources.reverse();
  const result = projectContractFacts({documents: [entry(parent(raw)), entry(parent(reordered))]});
  assert.equal(result.summaries[0].conflicting_operations, 1);
  assert.deepEqual(result.operations[1].sources.map(row => row.source), reordered.sources.map(row => row.source));
});

test('keeps distinct declared API sources separate and preserves source-specific declarations', () => {
  const first = syntheticApiContract();
  const other = structuredClone(first);
  other.source.plugin = 'another-synthetic-provider';
  const result = projectContractFacts({documents: [entry(first, 'api-contract'), entry(other, 'api-contract'), entry(structuredClone(first), 'api-contract')]});
  assert.equal(result.summaries[0].unique_operations, 2);
  assert.equal(result.summaries[0].duplicate_observations, 1);
  assert.equal(result.summaries[0].conflicting_operations, 0);
  assert.deepEqual(result.operations[0].source, first.source);
  const publicRaw = operation('source_details');
  const publicResult = projectContractFacts({documents: [entry(parent(publicRaw))]});
  assert.deepEqual(publicResult.operations[0].sources[0].source, publicRaw.sources[0].source);
  assert.deepEqual(limits(publicResult.operations[0].sources[0]), publicRaw.sources[0].limits);
  assert.equal(publicResult.operations[0].sources[0].pointer, '/operations/0/sources/0');
});

test('reports cursor declarations and false pagination flags as scoped tensions without rejecting contracts', () => {
  const raw = operation('cursor_operation');
  raw.input_schema.properties.cursor = {type: 'string', maxLength: 73};
  raw.input_schema.required.push('cursor');
  raw.output_schema.properties.records.items = {type: 'object', properties: {nextCursor: {type: 'string'}}};
  raw.output_schema.properties.literal = {type: 'object', const: {properties: {cursor: 'literal data'}}};
  raw.sources[0].input_schema = structuredClone(raw.input_schema);
  const result = projectContractFacts({documents: [entry(parent(raw))]});
  const row = result.operations[0];
  assert.equal(row.pagination_tensions.length, 2);
  assert.deepEqual(row.pagination_tensions[0], {classification: 'observed_declaration_tension',
    selector: {field: 'cursor', pointer: '/operations/0/input_schema/properties/cursor', declared: true, required: true},
    pagination: {pointer: '/operations/0/limits/pagination_supported', value: false}});
  assert.equal(row.pagination_tensions[1].selector.field, 'nextCursor');
  assert.equal(row.sources[0].pagination_tensions[0].selector.pointer, '/operations/0/sources/0/input_schema/properties/cursor');
  assert.equal(result.guarantee, 'validated_declarations_only');
  raw.limits.pagination_supported = true;
  assert.equal(projectContractFacts({documents: [entry(parent(raw))]}).operations[0].pagination_tensions.length, 0);
});

test('rejects invalid parents, wrong document kinds, authority-bearing scope and extra inputs', () => {
  const bad = parent(operation('bad'));
  bad.operations[0].limits.maximum_fan_out = 0;
  assert.throws(() => projectContractFacts({documents: [entry(bad)]}));
  assert.throws(() => projectContractFacts({documents: [entry(operation('individual_contact'))]}));
  assert.throws(() => projectContractFacts({documents: [entry(parent(operation('wrong')), 'api-contract')]}));
  assert.throws(() => projectContractFacts({documents: [entry(parent(operation('scope')), 'operation-describe', {...scope, context_handle: 'private'})]}));
  assert.throws(() => projectContractFacts({documents: [{...entry(parent(operation('extra'))), observation_id: 'injected'}]}));
  assert.throws(() => projectContractFacts({documents: []}));
});

test('compact execution groups preserve complete null and absent declarations with exact observation pointers', () => {
  const http = operation('http');
  http.execution.transport = null;
  const absent = operation('legacy_http');
  delete absent.execution.transport;
  const runtime = operation('runtime');
  runtime.execution = {transport: 'journey_runtime', method: null, uri: null, context_header: null};
  const documents = [entry(parent(http, absent, runtime)), entry(parent(structuredClone(http))), entry(registration(), 'api-contract')];
  const result = projectContractFacts({documents});
  const groups = result.summaries[0].execution_groups;
  assert.equal(groups.length, 3);
  assert.equal(groups[0].observations.length, 2);
  assert.deepEqual(groups[0].declarations, ['method', 'transport', 'context_header'].map(field => ({field, declared: true, value: http.execution[field]})));
  assert.deepEqual(groups[1].declarations.find(row => row.field === 'transport'), {field: 'transport', declared: false});
  assert.deepEqual(groups[2].declarations, [{field: 'method', declared: true, value: null},
    {field: 'transport', declared: true, value: 'journey_runtime'}, {field: 'context_header', declared: true, value: null}]);
  assert.deepEqual(groups[0].response, {declared: false});
  const resolve = (document, pointer) => pointer.split('/').slice(1).reduce((value, key) => value[key.replaceAll('~1', '/').replaceAll('~0', '~')], document);
  for (const summary of result.summaries) for (const group of summary.execution_groups) for (const observed of group.observations) {
    const raw = resolve(documents[observed.document_index].document, observed.execution_pointer);
    for (const declaration of group.declarations) {
      assert.equal(declaration.declared, Object.hasOwn(raw, declaration.field));
      if (declaration.declared) assert.deepEqual(declaration.value, raw[declaration.field]);
    }
  }
  assert.equal(result.summaries[1].execution_groups.length, 1);
});

test('binary response declarations retain public header names and literal order without false permutation conflicts', () => {
  const raw = operation('binary_download');
  raw.execution.uri = '/private-download-route-sentinel';
  raw.execution.response = {body: 'binary', content_type: 'provider',
    headers: ['Content-Disposition', 'Content-Length', 'Content-Type', 'Digest', 'X-Content-SHA256', 'X-Correlation-ID']};
  const reordered = structuredClone(raw);
  reordered.execution.response.headers.reverse();
  const result = projectContractFacts({documents: [entry(parent(raw)), entry(parent(reordered))]});
  assert.equal(result.summaries[0].conflicting_operations, 0);
  assert.equal(result.summaries[0].execution_groups.length, 1);
  assert.equal(result.summaries[0].execution_groups[0].observations.length, 2);
  assert.deepEqual(result.summaries[0].execution_groups[0].response, {declared: true, value: raw.execution.response});
  assert.deepEqual(result.operations[1].execution_response, {pointer: '/operations/0/execution/response', value: reordered.execution.response});
  assert.equal(result.summaries[0].execution_groups[0].observations[1].response_pointer, '/operations/0/execution/response');
  assert(!JSON.stringify(result).includes('private-download-route-sentinel'));
  const invalid = structuredClone(raw);
  invalid.execution.response.headers[0] = 'Authorization';
  assert.throws(() => projectContractFacts({documents: [entry(parent(invalid))]}));
});

test('exact error groups retain registration statuses and retryability plus separately declared source errors', () => {
  const api = registration();
  const raw = operation('source_errors');
  const result = projectContractFacts({documents: [entry(api, 'api-contract'), entry(parent(raw))]});
  assert.deepEqual(result.summaries[0].error_groups, [{declaration: api.public_errors,
    observations: [{document_index: 0, operation: api.operation, errors_pointer: '/public_errors'}]}]);
  const publicGroups = result.summaries[1].error_groups;
  assert.deepEqual(publicGroups[0].declaration, raw.error_contract);
  assert.deepEqual(publicGroups[1], {source: raw.sources[0].source, declaration: raw.sources[0].error_contract,
    observations: [{document_index: 1, operation: raw.operation, source: raw.sources[0].source, errors_pointer: '/operations/0/sources/0/error_contract'}]});
  const missing = structuredClone(raw);
  delete missing.sources[0].error_contract;
  // A non-ready source carries no invented described contract or error declaration.
  missing.sources[0] = {source: missing.sources[0].source, availability: 'temporarily_unavailable'};
  assert.equal(projectContractFacts({documents: [entry(parent(missing))]}).summaries[0].error_groups.length, 1);
});

test('compact groups retain duplicate and conflicting observations and separate exact API sources', () => {
  const first = syntheticApiContract();
  const other = structuredClone(first);
  other.source.plugin = 'distinct-provider';
  const changed = structuredClone(first);
  changed.execution.method = first.execution.method === 'POST' ? 'GET' : 'POST';
  const result = projectContractFacts({documents: [entry(first, 'api-contract'), entry(structuredClone(first), 'api-contract'),
    entry(other, 'api-contract'), entry(changed, 'api-contract')]});
  const summary = result.summaries[0];
  assert.equal(summary.unique_operations, 2);
  assert.equal(summary.conflicting_operations, 1);
  assert.equal(summary.execution_groups.length, 3);
  assert.deepEqual(summary.execution_groups.map(group => group.observations.map(row => row.document_index)), [[0, 1], [3], [2]]);
  assert.equal(summary.error_groups.length, 2);
  assert.deepEqual(summary.error_groups.map(group => group.source), [first.source, other.source]);
});

test('CLI emits the same projection and keeps invalid-input stderr generic', () => {
  const script = new URL('../source/platform/bos-app-discovery/scripts/project-contract-facts.mjs', import.meta.url);
  const request = {documents: [entry(parent(operation('cli')))]};
  const run = spawnSync(process.execPath, [script.pathname], {input: JSON.stringify(request), encoding: 'utf8'});
  assert.equal(run.status, 0);
  assert.deepEqual(JSON.parse(run.stdout), projectContractFacts(request));
  const failed = spawnSync(process.execPath, [script.pathname], {input: JSON.stringify({documents: [{secret: 'private-stderr-sentinel'}]}), encoding: 'utf8'});
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, '');
  assert.equal(failed.stderr, 'Contract facts input invalid\n');
});
