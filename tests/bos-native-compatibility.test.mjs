import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const guidance = await readFile(new URL('../source/platform/bos-mcp-client/references/identity-context.md', import.meta.url), 'utf8');

test('existing named operational MCP compatibility remains usable without host HTTPS', () => {
  assert.match(guidance, /Existing operational MCP tools remain compatibility surfaces/);
  assert.match(guidance, /fresh `bos_list_context_tools` response[\s\S]*`tools`[\s\S]*`name`[\s\S]*`inputSchema`/);
  assert.match(guidance, /same selected `context_handle`[\s\S]*`bos_execute`/);
  assert.match(guidance, /Do not report `host_capability_unavailable`[\s\S]*native compatibility tool/);
});

test('Describe-only semantic operations cannot be invented as native tools', () => {
  assert.match(guidance, /Never convert a Describe\s+operation key into `tool_name`/);
  assert.match(guidance, /No similar name, cached descriptor, or Describe contract establishes a native tool/);
  assert.match(guidance, /For a discovered deterministic HTTPS operation without a suitable native\s+compatibility tool/);
  assert.match(guidance, /credentials inside the host; construct no alternate transport/);
});

test('existing operational compatibility preserves scoped exceptions and authority checks', () => {
  for (const name of ['feedback.recommendations.query', 'journeys.notifications.read', 'journeys.state.read']) {
    assert(guidance.includes('`' + name + '`'));
  }
  assert.match(guidance, /semantic business-read exceptions remain exactly/);
  assert.match(guidance, /verify the returned context before using its result/);
  assert.match(guidance, /A denial or missing operation\s+never permits another role or organization as a workaround/);
  assert.match(guidance, /The server reauthorizes every operation/);
});

const lifecycle = await readFile(new URL('../source/platform/bos-workflow-orchestrator/references/journey-lifecycle.md', import.meta.url), 'utf8');
const authoring = await readFile(new URL('../source/platform/bos-workflow-orchestrator/references/bosl-authoring.md', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../source/platform/bos-workflow-orchestrator/SKILL.md', import.meta.url), 'utf8');
const {createNativeBoslExecution, NATIVE_BOSL_TOOLS} = await import('../source/platform/bos-workflow-orchestrator/scripts/native-bosl-execution.mjs');
const {interpretJourneyResponse} = await import('../source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs');

const nativeContext = {context_handle: 'bos_ctx_v2_' + 'c'.repeat(64), organization_name: 'Synthetic organization',
  application_name: 'Lead Director', installation_name: 'Synthetic installation', role_label: 'Synthetic role', is_default: true};
const objectSchema = {type: 'object'};
const nativeDescriptors = {
  [NATIVE_BOSL_TOOLS.register]: {type: 'object', properties: {document: objectSchema}, required: ['document'], additionalProperties: false},
  [NATIVE_BOSL_TOOLS.action]: {type: 'object', properties: {href: {type: 'string', minLength: 1}, payload: objectSchema},
    required: ['href'], additionalProperties: false},
  [NATIVE_BOSL_TOOLS.graphExport]: {type: 'object', properties: {}, additionalProperties: false}
};
function nativeCatalog(names = Object.keys(nativeDescriptors), handle = nativeContext.context_handle) {
  return {isError: false, structuredContent: {contract_version: 'bos-identity-mcp/v2', context_handle: handle, resources: [],
    tools: names.map(name => ({name, description: 'Synthetic native BOSL tool.', inputSchema: nativeDescriptors[name]}))}};
}
const nativeResult = (result, selected = nativeContext) => ({isError: false, content: [],
  structuredContent: {contract_version: 'bos-identity-mcp/v2', context: selected, result: {...result, ttlMs: 0, cacheScope: 'private'}},
  _meta: {'bos/context': selected}});
const startHref = '/bos/apps/example/api/v1/organizations/demo/journeys/synthetic-journey/start?capability=cap_synthetic_start';
const completeAction = {verb: 'complete', method: 'POST', href: '/bos/apps/example/api/v1/organizations/demo/journeys/synthetic-journey/complete?capability=cap_synthetic_complete',
  payload_schema: {type: 'object', properties: {note: {type: 'string'}}, required: ['note'], additionalProperties: false}};
const startAction = {verb: 'start', method: 'POST', href: startHref, payload_schema: null};
const registrationContract = JSON.parse(await readFile(new URL('./fixtures/journey-registration-contract.json', import.meta.url), 'utf8'));
const plainDocument = () => ({identity: 'plain journey', name: 'Plain journey', inputs: {}, entry: 'done',
  nodes: [{code: 'done', type: 'server', inputs: {}, outputs: {}, terminal: true}]});
const stateAction = {verb: 'state', method: 'GET', href: '/bos/apps/example/api/v1/organizations/demo/journeys/synthetic-journey', payload_schema: null};

test('identity guidance admits exactly the owner-directed native BOSL execution tools', () => {
  for (const name of ['lead-director.journeys.register', 'lead-director.journeys.action', 'bos.graph_export.read']) {
    assert(guidance.includes('`' + name + '`'), name);
  }
  assert.match(guidance, /Owner-directed native BOSL execution exception \(2026-11-19\)/);
  assert.match(guidance, /`\{"document": <document>\}`/);
  assert.match(guidance, /`\{"href": <href>\}`[\s\S]*`\{"href": <href>, "payload": <payload>\}`/);
  assert.match(guidance, /`bos\.graph_export\.read` with exactly `\{\}`/);
  assert.match(guidance, /HTTPS remains the\s+default whenever the host supplies it/);
  assert.match(guidance, /Never invent these tools when they\s+are not advertised/);
  assert.match(guidance, /never put the handle, a context or another\s+authority selector in their arguments/);
  assert.match(guidance, /no step 7 native BOSL execution tool is freshly advertised/);
  for (const text of [lifecycle, authoring, orchestrator]) {
    assert.match(text, /native BOSL\s+execution/);
  }
});

test('native BOSL execution preserves exact hrefs, payload rules and the empty export', () => {
  const native = createNativeBoslExecution({context: nativeContext, catalog: nativeCatalog()});
  assert.deepEqual(native.action(startAction).arguments, {href: startHref});
  assert.deepEqual(native.action(stateAction).arguments, {href: stateAction.href});
  assert.equal(native.action(startAction).tool_name, 'lead-director.journeys.action');
  assert.equal(native.action(startAction).context_handle, nativeContext.context_handle);
  assert.deepEqual(native.action(completeAction, {note: 'done'}).arguments, {href: completeAction.href, payload: {note: 'done'}});
  assert.throws(() => native.action(startAction, {}), /must not include a caller payload/);
  assert.throws(() => native.action(completeAction), /requires a body/);
  assert.throws(() => native.action(completeAction, {note: 1}), /payload_schema/);
  assert.throws(() => native.action(completeAction, {note: nativeContext.context_handle}), /context handle/);
  assert.deepEqual(native.graphExport(), {tool_name: 'bos.graph_export.read', context_handle: nativeContext.context_handle, arguments: {}});
});

test('native BOSL tools are never invented and bind only the selected catalog', () => {
  const partial = createNativeBoslExecution({context: nativeContext, catalog: nativeCatalog([NATIVE_BOSL_TOOLS.register])});
  assert.equal(partial.available(NATIVE_BOSL_TOOLS.action), false);
  assert.throws(() => partial.action(startAction), error => error.code === 'host_capability_unavailable');
  assert.throws(() => partial.graphExport(), /host_capability_unavailable/);
  assert.throws(() => createNativeBoslExecution({context: nativeContext, catalog: nativeCatalog(undefined, 'bos_ctx_v2_' + 'd'.repeat(64))}),
    /bound to the selected handle/);
});

test('native results feed the same lifecycle interpretation after exact context verification', () => {
  const native = createNativeBoslExecution({context: nativeContext, catalog: nativeCatalog()});
  const response = native.unwrap(nativeResult({http_status: 202, headers: {'Retry-After': '1'},
    body: {identity: 'synthetic-journey', status: 'in_progress', current_node: {code: 'synthetic_wait', type: 'server', operation: 'synthetic.wait'},
      retry_after_seconds: 1, action: stateAction}}));
  assert.equal(response.http_status, 202);
  assert.equal(response.headers['Retry-After'], '1');
  assert.ok(interpretJourneyResponse(response));
  const refusal = native.unwrap(nativeResult({http_status: 429, headers: {'Retry-After': '30'},
    error: {code: 'RATE_LIMITED', message: 'Synthetic throttle.', retryable: true, correlation_id: 'corr_synthetic', details: []}}));
  assert.deepEqual(Object.keys(refusal.body), ['error']);
  assert.equal(refusal.headers['Retry-After'], '30');
  const other = {...nativeContext, organization_name: 'Other organization'};
  assert.throws(() => native.unwrap(nativeResult({http_status: 200, body: {}}, other)), /exact fresh structured/);
  assert.throws(() => native.unwrap({...nativeResult({http_status: 200, body: {}}),
    structuredContent: {contract_version: 'bos-identity-mcp/v2', context: nativeContext, result: {http_status: 200, body: {}}}}), /private uncached/);
});

test('native registration sends the unchanged document and never starts execution implicitly', () => {
  const native = createNativeBoslExecution({context: nativeContext, catalog: nativeCatalog()});
  const document = plainDocument();
  const registration = native.register(registrationContract, document);
  assert.equal(registration.tool_name, 'lead-director.journeys.register');
  assert.deepEqual(Object.keys(registration.arguments), ['document']);
  assert.deepEqual(registration.arguments.document, document);
  assert.doesNotMatch(JSON.stringify(registration.arguments), /bos_ctx_v2_/);
  const start = {...startAction, href: '/bos/apps/example/api/v1/organizations/demo/journeys/plain%20journey/start?capability=synthetic'};
  const decision = interpretJourneyResponse(native.unwrap(nativeResult({http_status: 201, headers: {},
    body: {compiled: true, identity: 'plain journey', actions: {start}}})), {registrationRequest: registration.registrationRequest});
  assert.equal(decision.next, 'invoke_action');
  assert.deepEqual(native.action(decision.action).arguments, {href: start.href});
  assert.throws(() => native.register(registrationContract, {...document, token: 'synthetic'}), /registration schema|authority selector|additional/i);
});

test('native arguments reject credentials and authority selectors', () => {
  const native = createNativeBoslExecution({context: nativeContext, catalog: nativeCatalog()});
  for (const payload of [{note: 'x', organization_id: 'o'}, {note: 'x', access_token: 't'}, {note: 'x', context_handle: 'h'}]) {
    assert.throws(() => native.action({...completeAction, payload_schema: {type: 'object'}}, payload), /authority selector/);
  }
});
