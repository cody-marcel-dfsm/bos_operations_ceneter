import {fileURLToPath} from 'node:url';
import {validateOperationDescription, validateApiContractResponse} from './validate-discovery.mjs';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);
const escape = value => value.replaceAll('~', '~0').replaceAll('/', '~1');
const stable = value => JSON.stringify(value, (_, item) => object(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const scopeKeys = ['organization', 'application', 'installation', 'role'];
function scopeOf(value) {
  if (!object(value) || Object.keys(value).length !== scopeKeys.length ||
      scopeKeys.some(key => typeof value[key] !== 'string' || !value[key].trim() ||
        value[key].length > 200 || /[\u0000-\u001f\u007f]/u.test(value[key]))) {
    throw new Error('Expected descriptive organization, application, installation and role labels');
  }
  return Object.fromEntries(scopeKeys.map(key => [key, value[key]]));
}
function fields(value, pointer) {
  return Object.entries(value).map(([field, item]) => ({field, pointer: pointer + '/' + escape(field), value: copy(item)}));
}
function executionFacts(value, pointer) {
  // Header names are declarations. URI and authority/header values are omitted.
  return ['method', 'transport', 'context_header'].map(field => ({
    field, pointer: pointer + '/' + field, declared: Object.hasOwn(value, field),
    ...(Object.hasOwn(value, field) ? {value: copy(value[field])} : {})
  }));
}
function inputFacts(value, pointer) {
  return {
    required: copy(value.required ?? []), property_names: Object.keys(value.properties ?? {}),
    required_pointer: pointer + '/required', properties_pointer: pointer + '/properties'
  };
}
const schemaMaps = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']);
const schemaArrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const schemaValues = new Set(['additionalProperties', 'unevaluatedProperties', 'items', 'additionalItems',
  'unevaluatedItems', 'contains', 'propertyNames', 'not', 'if', 'then', 'else', 'contentSchema']);
function paginationSelectors(schema, pointer, depth = 0) {
  if (depth > 128) throw new Error('Schema projection depth exceeded');
  if (!object(schema)) return [];
  const rows = [];
  for (const [keyword, value] of Object.entries(schema)) {
    const next = pointer + '/' + escape(keyword);
    if (schemaMaps.has(keyword) && object(value)) {
      for (const [name, nested] of Object.entries(value)) {
        const path = next + '/' + escape(name);
        const normalized = name.replace(/[a-z][A-Z]/gu, match => match[0] + '_' + match[1]).toLowerCase();
        if (keyword === 'properties' && /^(?:cursor|next_cursor|delta_cursor|page_token|next_page_token|continuation_token)$/u.test(normalized)) {
          rows.push({field: name, pointer: path, declared: true,
            required: Array.isArray(schema.required) && schema.required.includes(name)});
        }
        rows.push(...paginationSelectors(nested, path, depth + 1));
      }
    } else if ((schemaArrays.has(keyword) || keyword === 'items') && Array.isArray(value)) {
      value.forEach((nested, index) => rows.push(...paginationSelectors(nested, next + '/' + index, depth + 1)));
    } else if (schemaValues.has(keyword)) rows.push(...paginationSelectors(value, next, depth + 1));
  }
  return rows;
}
function paginationTensions(operation, pointer) {
  if (operation.limits?.pagination_supported !== false) return [];
  const selectors = ['input_schema', 'output_schema'].flatMap(key =>
    paginationSelectors(operation[key], pointer + '/' + key));
  return selectors.map(selector => ({
    classification: 'observed_declaration_tension', selector,
    pagination: {pointer: pointer + '/limits/pagination_supported', value: false}
  }));
}
function sourceFacts(source, pointer) {
  return {
    pointer, source: copy(source.source), availability: source.availability,
    ...(source.limits ? {limits: fields(source.limits, pointer + '/limits')} : {}),
    ...(source.input_schema ? {input: inputFacts(source.input_schema, pointer + '/input_schema')} : {}),
    ...(source.guarantees ? {guarantees: copy(source.guarantees), guarantees_pointer: pointer + '/guarantees'} : {}),
    ...(source.error_contract ? {errors: copy(source.error_contract), errors_pointer: pointer + '/error_contract'} : {}),
    pagination_tensions: paginationTensions(source, pointer)
  };
}
function rowFacts(operation, metadata, base) {
  const row = {...base, operation: operation.operation, status: operation.status ?? 'described',
    ...(Object.hasOwn(operation, 'source') ? {source: copy(operation.source)} : {}),
    contract_version: metadata.contract_version,
    ...(Object.hasOwn(metadata, 'metadata_version') ? {metadata_version: metadata.metadata_version} : {}),
    ...(Object.hasOwn(metadata, 'observed_at') ? {observed_at: metadata.observed_at} : {}),
    ...(Object.hasOwn(metadata, 'ttlMs') ? {ttlMs: metadata.ttlMs} : {}),
    ...(Object.hasOwn(metadata, 'cacheScope') ? {cacheScope: metadata.cacheScope} : {})};
  if (row.status === 'not_available') return row;
  const pointer = row.pointer;
  return {...row,
    execution: executionFacts(operation.execution, pointer + '/execution'),
    ...(Object.hasOwn(operation.execution, 'response') ? {execution_response: {
      pointer: pointer + '/execution/response', value: copy(operation.execution.response)
    }} : {}),
    limits: fields(operation.limits, pointer + '/limits'),
    input: inputFacts(operation.input_schema, pointer + '/input_schema'),
    guarantees: copy(operation.guarantees), guarantees_pointer: pointer + '/guarantees',
    errors: copy(operation.public_errors ?? operation.error_contract),
    errors_pointer: pointer + (Object.hasOwn(operation, 'public_errors') ? '/public_errors' : '/error_contract'),
    sources: (operation.sources ?? []).map((source, index) => sourceFacts(source, pointer + '/sources/' + index)),
    pagination_tensions: paginationTensions(operation, pointer)
  };
}
function withoutProvenance(value) {
  if (Array.isArray(value)) return value.map(withoutProvenance);
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'pointer' && !key.endsWith('_pointer') &&
    !['document_index', 'observed_at', 'metadata_version'].includes(key))
    .map(([key, item]) => [key, withoutProvenance(item)]));
}
function declarationFingerprint(row) {
  const facts = withoutProvenance(row);
  const normalize = value => {
    if (value.limits) value.limits = [...value.limits].sort((left, right) => left.field.localeCompare(right.field));
    if (value.input) value.input = {...value.input,
      required: [...value.input.required].sort(), property_names: [...value.input.property_names].sort()};
    if (value.pagination_tensions) value.pagination_tensions = [...value.pagination_tensions]
      .sort((left, right) => stable(left).localeCompare(stable(right)));
    return value;
  };
  normalize(facts);
  // The validator defines binary response header names as an exact set.
  // Preserve their returned order in fact rows, normalize only comparison.
  if (facts.execution_response) facts.execution_response.value.headers.sort();
  // Source row sequence is preserved: no source correspondence or precedence
  // equivalence is inferred. Normalize only each source's unordered declarations.
  if (facts.sources) facts.sources = facts.sources.map(normalize);
  return stable(facts);
}
function transportKey(row) {
  if (row.status !== 'described') return 'unavailable';
  const fact = row.execution.find(item => item.field === 'transport');
  return !fact.declared ? 'absent' : fact.value === null ? 'declared_null' : 'value:' + fact.value;
}
function declarationGroups(rows) {
  const executions = new Map(), errors = new Map();
  const add = (groups, key, declaration, observation) => {
    if (!groups.has(key)) groups.set(key, {...declaration, observations: []});
    groups.get(key).observations.push(observation);
  };
  for (const row of rows) {
    if (row.status !== 'described') continue;
    const source = Object.hasOwn(row, 'source') ? {source: copy(row.source)} : {};
    const observation = {document_index: row.document_index, operation: row.operation, ...source};
    const declarations = row.execution.map(({field, declared, value}) => ({field, declared,
      ...(declared ? {value: copy(value)} : {})}));
    const response = row.execution_response
      ? {declared: true, value: copy(row.execution_response.value)} : {declared: false};
    const normalizedResponse = copy(response);
    if (normalizedResponse.declared) normalizedResponse.value.headers.sort();
    add(executions, stable([row.source ?? null, declarations, normalizedResponse]),
      {...source, declarations, response}, {...observation, execution_pointer: row.pointer + '/execution',
        ...(row.execution_response ? {response_pointer: row.execution_response.pointer} : {})});
    add(errors, stable([row.source ?? null, row.errors]), {...source, declaration: copy(row.errors)},
      {...observation, errors_pointer: row.errors_pointer});
    for (const nested of row.sources) {
      if (!Object.hasOwn(nested, 'errors')) continue;
      add(errors, stable([nested.source, nested.errors]),
        {source: copy(nested.source), declaration: copy(nested.errors)},
        {document_index: row.document_index, operation: row.operation,
          source: copy(nested.source), errors_pointer: nested.errors_pointer});
    }
  }
  return {execution_groups: [...executions.values()], error_groups: [...errors.values()]};
}
function summariesOf(operations) {
  const groups = new Map();
  for (const row of operations) {
    const key = stable([row.kind, row.scope]);
    if (!groups.has(key)) groups.set(key, {kind: row.kind, scope: row.scope, operations: new Map()});
    const rows = groups.get(key).operations;
    const operationKey = stable([row.operation, row.source ?? null]);
    if (!rows.has(operationKey)) rows.set(operationKey, []);
    rows.get(operationKey).push(row);
  }
  return [...groups.values()].map(group => {
    const summary = {kind: group.kind, scope: group.scope, unique_operations: group.operations.size,
      described_operations: 0, unavailable_operations: 0, duplicate_observations: 0,
      conflicting_operations: 0, transport: {absent: 0, declared_null: 0, declared_values: {}, conflicting: 0}};
    for (const rows of group.operations.values()) {
      summary.duplicate_observations += rows.length - 1;
      const described = rows.filter(row => row.status === 'described');
      if (described.length) summary.described_operations++;
      else summary.unavailable_operations++;
      if (new Set(rows.map(declarationFingerprint)).size > 1) summary.conflicting_operations++;
      if (!described.length) continue;
      const transports = new Set(rows.map(transportKey));
      if (transports.size !== 1) summary.transport.conflicting++;
      else {
        const key = [...transports][0];
        if (key.startsWith('value:')) {
          const value = key.slice(6);
          summary.transport.declared_values[value] = (summary.transport.declared_values[value] ?? 0) + 1;
        } else summary.transport[key]++;
      }
    }
    return {...summary, ...declarationGroups([...group.operations.values()].flat())};
  });
}

// Scope labels group facts only; this helper establishes no authorization,
// source equivalence, execution permission, or current runtime readiness.
export function projectContractFacts({documents} = {}) {
  if (!Array.isArray(documents) || !documents.length || documents.length > 128) throw new Error('Expected one to 128 observed documents');
  const operations = [];
  documents.forEach((entry, document_index) => {
    if (!object(entry) || Object.keys(entry).sort().join(',') !== 'document,kind,scope') throw new Error('Expected exact observed document, kind and descriptive scope');
    const scope = scopeOf(entry.scope), base = {kind: entry.kind, scope, document_index};
    if (entry.kind === 'operation-describe') {
      validateOperationDescription(entry.document);
      entry.document.operations.forEach((operation, index) => operations.push(rowFacts(operation, entry.document,
        {...base, pointer: '/operations/' + index})));
    } else if (entry.kind === 'api-contract') {
      validateApiContractResponse(entry.document, {operation: entry.document?.operation});
      operations.push(rowFacts(entry.document, entry.document, {...base, pointer: ''}));
    } else throw new Error('Unsupported observed contract kind');
  });
  // Counts precede the larger fact rows for bounded tool views.
  return {schema_version: 1, guarantee: 'validated_declarations_only', summaries: summariesOf(operations), operations};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    let input = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 4194304) throw new Error('Contract fact input exceeds bound');
    }
    process.stdout.write(JSON.stringify(projectContractFacts(JSON.parse(input))) + '\n');
  } catch {
    process.stderr.write('Contract facts input invalid\n');
    process.exitCode = 1;
  }
}
