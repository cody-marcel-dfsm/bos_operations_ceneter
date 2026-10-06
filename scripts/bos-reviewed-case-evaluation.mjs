// Functional checks consume host-normalized receipts. Assistant prose is never evidence.
import {digest} from './marketplace-prompt-catalog.mjs';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const validRpcRequestId = value => (typeof value === 'string' && nonempty(value)) || (typeof value === 'number' && Number.isSafeInteger(value));
const denialArguments = Object.freeze({org_id:'ACME.org'});

export function validBosAuthorizationDenialFixture(fixture, item) {
  const denied = fixture?.authorization_denial;
  return typeof item?.id === 'string' && typeof item.prompt === 'string' &&
    fixture?.schema === 'synthetic-reviewer-authority/v1' && fixture.synthetic_only === true &&
    fixture.case_id === item?.id && fixture.prompt_sha256 === digest(item?.prompt) &&
    denied?.case_id === item.id && denied.operation === 'unadvertised_disable_operation' &&
    object(denied.arguments) && digest(denied.arguments) === digest(denialArguments) &&
    denied.input_sha256 === digest(denialArguments) && denied.target_organization === 'ACME.org' &&
    denied.target_provenance === 'owner-declared synthetic request label' &&
    denied.resolve_target === false && denied.contact_target_domain === false &&
    (denied.error_code ?? denied.expected_error_code) === (item.expected_authorization_error_code ?? 'authorization_denied') &&
    denied.server_denial_precedes_operation_resolution === true;
}

export function verifiedBosAuthorizationDenialFixtureBytes(bytes, expectedSha256, item) {
  if (!(bytes instanceof Uint8Array) || typeof expectedSha256 !== 'string' ||
    createHash('sha256').update(bytes).digest('hex') !== expectedSha256) return null;
  let fixture;
  try { fixture=JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return null; }
  const source=fixture?.authorization_denial;
  if (!object(source)) return null;
  const normalized={...fixture,authorization_denial:{...source,
    case_id:source.case_id??fixture.case_id,
    input_sha256:source.input_sha256??(object(source.arguments)?digest(source.arguments):undefined),
    error_code:source.error_code??source.expected_error_code}};
  return !item || validBosAuthorizationDenialFixture(normalized,item) ? normalized : null;
}

export function bosAuthorizationDenialFixtureMatchesScope(fixture, scope) {
  return object(fixture) && object(scope) &&
    fixture.review_organization===scope.review_organization &&
    fixture.review_application===scope.review_application &&
    fixture.review_installation===scope.review_installation &&
    fixture.review_role===scope.review_role;
}

export async function loadHashBoundBosAuthorizationDenialFixture(path, expectedSha256, item, scope) {
  const bytes=await readFile(path);
  const fixture=verifiedBosAuthorizationDenialFixtureBytes(bytes,expectedSha256,item);
  if(!fixture)throw new Error('reviewer_authorization_denial_fixture_invalid');
  if(!bosAuthorizationDenialFixtureMatchesScope(fixture,scope))throw new Error('reviewer_authorization_denial_scope_mismatch');
  return fixture;
}

export function validBosAuthorizationDenialExecutionEvidence(evidence, denied, sourceReceipt, sourceReceiptSha256) {
  const expectedErrorCode = denied?.error_code ?? denied?.expected_error_code;
  const request = {tool_name:denied?.operation, arguments:denied?.arguments};
  const assertions = new Set(evidence?.assertions ?? []);
  return object(denied?.arguments) && evidence?.kind === 'synthetic-server-test-receipt' &&
    typeof sourceReceiptSha256 === 'string' && /^[a-f0-9]{64}$/.test(sourceReceiptSha256) &&
    evidence.source_receipt_sha256 === sourceReceiptSha256 && sourceReceipt?.kind === evidence.kind &&
    sourceReceipt.request_tool === evidence.request_tool && sourceReceipt.nested_operation === evidence.nested_operation &&
    object(sourceReceipt.nested_arguments) && object(evidence.nested_arguments) && digest(sourceReceipt.nested_arguments) === digest(evidence.nested_arguments) &&
    object(sourceReceipt.actual_mcp_result) && object(evidence.actual_mcp_result) && digest(sourceReceipt.actual_mcp_result) === digest(evidence.actual_mcp_result) &&
    sourceReceipt.downstream_business_executor_calls === evidence.downstream_business_executor_calls &&
    Array.isArray(sourceReceipt.assertions) && Array.isArray(evidence.assertions) && digest(sourceReceipt.assertions) === digest(evidence.assertions) &&
    evidence.request_tool === 'bos_execute' && evidence.nested_operation === denied.operation &&
    object(evidence.nested_arguments) && digest(evidence.nested_arguments) === digest(denied.arguments) &&
    evidence.request_sha256 === digest(request) && evidence.actual_mcp_result?.isError === true &&
    evidence.actual_mcp_result?.structuredContent?.error_code === expectedErrorCode &&
    evidence.downstream_business_executor_calls === 0 &&
    assertions.has('The unauthorized org selector was rejected before nested operation resolution') &&
    assertions.has('The business executor was not invoked');
}

export function reviewedActorCompleted(reviewCaseNumber, actor) {
  return reviewCaseNumber === 3 ? actor === undefined : actor?.result?.status === 'completed';
}

export function reviewedSubmissionPasses(selected, cases) {
  return Array.isArray(selected) && selected.length === 0 && Array.isArray(cases) &&
    cases.length === 8 && cases.every(item => item?.status === 'PASS');
}

export function reviewedMarketplacePasses(selected, cases) {
  return Array.isArray(selected) && selected.length === 0 && Array.isArray(cases) &&
    cases.length === 11 && cases.filter(item=>item?.kind==='starter').length===3 &&
    cases.every(item => item?.status === 'PASS');
}

export function reviewedHostOutcomes(state, actorAttempts = []) {
  const observations=Array.isArray(state?.observations)?state.observations:[];
  const attempts=Array.isArray(actorAttempts)?actorAttempts:[];
  const dynamicOutcomes=Array.isArray(state?.host_tool_outcomes)?state.host_tool_outcomes:[];
  return {
    complete:true,
    validation_failures:[...observations.filter(row=>row.tool==='validate.installed'&&row.is_error===true),
      ...Object.entries(state?.failed_validations??{}).filter(([,failed])=>failed===true).map(([mode])=>({mode}))],
    tool_rejections:[...(state?.denials??[]).filter(row=>row.reason!=='guard_canary_denied'),
      ...attempts.filter(row=>row.host_rejected===true).map(row=>({tool:row.tool,reason:'unknown_model_capability'}))],
    tool_errors:[...observations.filter(row=>row.is_error===true),
      ...dynamicOutcomes.filter(row=>!['completed','expected_guard_canary','expected_service_denial'].includes(row.kind))]
  };
}

const knownServiceErrorCodes = new Set([
  'authentication_required', 'authorization_denied', 'installation_inactive',
  'internal_error', 'invalid_arguments', 'invalid_request', 'invalid_token',
  'operation_not_found', 'operation_unsupported', 'partial_data',
  'provider_authorization_required', 'rate_limited', 'scope_mismatch',
  'service_unavailable', 'source_unavailable', 'temporarily_unavailable'
]);

function collectServiceErrorCodes(value, codes, unsafe) {
  if (!object(value)) return;
  for (const candidate of [value.error_code, value.error?.code]) {
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate !== 'string' || !knownServiceErrorCodes.has(candidate)) unsafe.value = true;
    else codes.add(candidate);
  }
  if (object(value.result)) collectServiceErrorCodes(value.result, codes, unsafe);
  if (object(value.error)) collectServiceErrorCodes(value.error, codes, unsafe);
  if (object(value.data)) collectServiceErrorCodes(value.data, codes, unsafe);
}

export function extractBosMcpErrorCode(envelope) {
  const result = envelope?.result;
  const code = result?.structuredContent?.error_code;
  return result?.isError === true && typeof code === 'string' && knownServiceErrorCodes.has(code) ? code : null;
}

export function evaluateBosReviewedCase(review_case_number, evidence = {}, authority = {}) {
  const checks = [];
  const check = (id, expected, actual, pass) => checks.push({id, expected, actual: actual ?? null, pass: pass === true});
  check('reviewed-case', 'integer 1 through 8', review_case_number, Number.isInteger(review_case_number) && review_case_number >= 1 && review_case_number <= 8);
  check('authority-proof', 'verified hash-bound authority', {verified: authority?.verified, hash_bound: authority?.hash_bound}, authority?.verified === true && authority?.hash_bound === true);
  check('complete-observations', true, evidence?.observations_complete, evidence?.observations_complete === true);
  check('verified-zero-mutations', 0, evidence?.effects?.mutation_count, evidence?.effects?.verified === true && evidence?.effects?.mutation_count === 0);
  const host = evidence?.host_outcomes;
  const hostOutcomePass = object(host) && host.complete === true && Array.isArray(host.validation_failures) &&
    Array.isArray(host.tool_rejections) && Array.isArray(host.tool_errors) &&
    host.validation_failures.length === 0 && host.tool_rejections.length === 0 && host.tool_errors.length === 0;
  check('host-validation-and-tool-results', 'complete host evidence with no failed validation, rejected call, or tool error', host, hostOutcomePass);
  const observations = Array.isArray(evidence?.service_observations) ? evidence.service_observations : [];
  const successful = kind => observations.filter(row => row?.kind === kind && row.actor_requested === true && row.reached_service === true && row.successful === true && row.scope_verified === true);
  const scope = context => object(context) && nonempty(authority.organization_name) && authority.application_name === 'Lead Director' && context.organization_name === authority.organization_name && context.application_name === authority.application_name;

  if (review_case_number === 1) {
    const appRows = successful('apps');
    const serviceRows = successful('public-services');
    check('lead-director-included', 'Lead Director', appRows.flatMap(row => Array.isArray(row.body?.apps) ? row.body.apps.map(app => app?.name) : []), appRows.some(row => Array.isArray(row.body?.apps) && row.body.apps.some(app => app?.name === 'Lead Director')));
    check('public-services-list', 'successful discovery returning an array', serviceRows.map(row => Array.isArray(row.body?.public_services)), serviceRows.some(row => Array.isArray(row.body?.public_services)));
  } else if (review_case_number === 2) {
    const names = successful('tool-catalog').flatMap(row => Array.isArray(row.body?.tools) ? row.body.tools.map(tool => tool?.name) : []);
    check('exact-context-tool', 'bos_get_context', names, names.includes('bos_get_context'));
  } else if (review_case_number === 3) {
    const login = evidence?.login;
    check('provided-url-authenticated', 'verified authenticated login through supplied URL', {verified: login?.verified, provided_url_used: login?.provided_url_used, authenticated: login?.authenticated}, login?.verified === true && login?.provided_url_used === true && login?.authenticated === true);
    check('authenticated-scope', 'configured organization and Lead Director', {organization_name: login?.organization_name, application_name: login?.application_name}, scope(login));
  } else if (review_case_number === 4) {
    const contexts = successful('context').filter(row => row.operation === 'bos_get_context' || row.operation === 'bos.get.context').map(row => row.body?.selected_context);
    check('current-director-role', 'Director in configured Lead Director context', contexts.map(context => ({organization_name: context?.organization_name, application_name: context?.application_name, role_label: context?.role_label})), contexts.some(context => scope(context) && context.role_label === 'Director'));
  } else if (review_case_number === 5) {
    const applications = successful('app-description').filter(row => row.operation === 'app.describe').map(row => row.body?.application);
    check('lead-director-description', {platform: 'bos', application: 'lead-director'}, applications, applications.some(application => application?.platform === 'bos' && application?.application === 'lead-director'));
  } else if (review_case_number === 6 || review_case_number === 7) {
    const attempts = evidence?.actor_attempts;
    const complete = Array.isArray(attempts) && attempts.every(row => object(row) && typeof row.bos === 'boolean');
    const count = complete ? attempts.filter(row => row.bos).length : null;
    check('zero-bos-attempts', 0, count, complete && count === 0);
    const calls = observations.filter(row => row?.actor_requested === true && row.reached_service === true);
    check('zero-bos-service-calls', 0, calls.length, calls.length === 0);
  } else if (review_case_number === 8) {
    const denied = authority?.authorization_denial;
    const configured = object(denied) && nonempty(denied.operation) && nonempty(denied.error_code) && denied.target_organization === 'ACME.org';
    check('configured-authorization-error', 'verified exact operation, code and owner-approved synthetic target', {
      operation_matches:denied?.operation==='unadvertised_disable_operation',
      error_code_matches:denied?.error_code==='authorization_denied',
      target_matches:denied?.target_organization==='ACME.org'
    }, configured);
    const attempts = Array.isArray(evidence?.actor_attempts) ? evidence.actor_attempts : [];
    const bosAttempts = attempts.filter(row => row?.bos === true);
    const exactAttempts = bosAttempts.length === 2 && bosAttempts.filter(row => row.tool === 'bos_get_context').length === 1 &&
      bosAttempts.filter(row => row.tool === 'bos_authorization_denial_probe').length === 1 &&
      bosAttempts.every(row => ['bos_get_context','bos_authorization_denial_probe'].includes(row.tool));
    check('exact-bos-tools-called', ['bos_get_context','bos_authorization_denial_probe'], bosAttempts.map(row => row.tool), exactAttempts);
    const calls = observations.filter(row => row?.actor_requested === true && row.reached_service === true);
    check('bos-service-invocation', 'at least one actor-requested BOS call reaching the service', calls.length, calls.length > 0);
    const requestHash = configured ? digest({tool_name:denied.operation,arguments:denied.arguments}) : null;
    const matches = calls.filter(row => configured && row.operation === denied.operation && row.successful === false && row.target_verified === true && row.target_organization === denied.target_organization && row.error_code === denied.error_code && row.request_sha256 === requestHash && validRpcRequestId(row.request_id) && nonempty(row.mcp_session_id));
    check('service-authorization-denial', 'exact configured service error for observed unauthorized target', {
      matching_call_count:matches.length,
      operation_matches:matches.length>0,
      error_code:matches.length===1?matches[0].error_code:null,
      target_verified:matches.length>0
    }, matches.length > 0);
    const proof = evidence?.server_execution_evidence;
    const sourceProofActual={
      present:object(proof),
      source_receipt_hash_present:nonempty(evidence?.server_execution_source_receipt_sha256),
      exact_request_hash_matches:object(proof)&&proof.request_sha256===requestHash,
      structured_error_matches:proof?.actual_mcp_result?.isError===true&&proof?.actual_mcp_result?.structuredContent?.error_code===denied?.error_code,
      downstream_business_executor_calls:Number.isSafeInteger(proof?.downstream_business_executor_calls)?proof.downstream_business_executor_calls:null
    };
    const proofMatches = validBosAuthorizationDenialExecutionEvidence(proof, denied,
      evidence?.server_execution_source_receipt, evidence?.server_execution_source_receipt_sha256);
    check('source-zero-executor-regression', 'hash-bound server source regression receipt with zero downstream calls', sourceProofActual, proofMatches);
    const runtime = evidence?.current_execution_proof;
    const runtimeMatches = object(runtime) && matches.length === 1 &&
      runtime.request_id === matches[0].request_id && runtime.mcp_session_id === matches[0].mcp_session_id &&
      runtime.request_sha256 === requestHash && nonempty(runtime.server_revision) &&
      runtime.downstream_business_executor_calls === 0 && runtime.authorization_preceded_operation_resolution === true;
    check('current-request-zero-executor-proof', 'service-produced proof for this request, session, and deployed revision with zero downstream calls', {
      request_id_matches:object(runtime)&&matches.length===1&&runtime.request_id===matches[0].request_id,
      session_matches:object(runtime)&&matches.length===1&&runtime.mcp_session_id===matches[0].mcp_session_id,
      request_hash_matches:object(runtime)&&runtime.request_sha256===requestHash,
      server_revision_present:nonempty(runtime?.server_revision),
      downstream_business_executor_calls:Number.isSafeInteger(runtime?.downstream_business_executor_calls)?runtime.downstream_business_executor_calls:null,
      authorization_preceded_operation_resolution:runtime?.authorization_preceded_operation_resolution===true
    }, runtimeMatches);
  }
  const failures = checks.filter(row => !row.pass).map(row => row.id);
  return {status: failures.length ? 'FAIL' : 'PASS', reason: failures.join(','), checks};
}
