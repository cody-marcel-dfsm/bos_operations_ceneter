import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {loadPromptCatalog} from './marketplace-prompt-catalog.mjs';
import {installedRelease} from './marketplace-installed-release.mjs';
import {verifyPackageOwnedBinding} from './marketplace-published-package.mjs';
import {nativeCase, verifyNativeReviewer} from './marketplace-native-run.mjs';
import {openReviewerSession} from './marketplace-reviewer-session.mjs';
import {verifyReviewerScope} from './marketplace-reviewer-scope.mjs';
import {body} from './marketplace-native-hook.mjs';
import {createReviewerTools} from './marketplace-reviewer-tools.mjs';
import {runReviewerModel} from './marketplace-reviewer-model.mjs';
import {evaluateBosReviewedCase, extractBosMcpErrorCode, reviewedActorCompleted, reviewedMarketplacePasses, reviewedSubmissionPasses, reviewedHostOutcomes, loadHashBoundBosAuthorizationDenialFixture} from './bos-reviewed-case-evaluation.mjs';
import {reviewerFailureCode} from './marketplace-reviewer-diagnostics.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const readControls = new Set(['app.describe', 'plugins.list', 'service.describe', 'api.contract.get', 'discovery.refresh', 'bos_get_context']);
const reviewedTools = new Set(['acceptance_guard_probe','acceptance_guard_status','acceptance_read_installed',
  'acceptance_read_document','acceptance_validate_installed','bos_get_context','bos_list_context_tools',
  'bos_list_resources','bos_read_resource','bos_control_discover','bos_authorization_denial_probe']);
const rpcName = row => row.rpc.params.name?.replaceAll('_', '.');
export function bosReviewerContext(catalog,item,state,skills) {
  const taskInstructions = item.review_case_number === 2
    ? 'This request is specifically to show whether the exact BOS tool bos_get_context is advertised. After the acceptance guard checks, call bos_get_context to obtain the fresh host-selected scope, then call bos_list_context_tools for that returned scope. Use the live tool catalog to confirm whether the exact tool name bos_get_context is present. Do not answer from package documentation alone.'
    : item.review_case_number === 5
      ? 'This request is specifically to retrieve the live Lead Director application description. After the acceptance guard checks, call bos_get_context, then bos_list_context_tools for that fresh scope. Find the exact advertised app.describe resource and read that exact URI with bos_read_resource. Base the response on the returned application description; do not substitute a skill summary or infer the description from the application name.'
    : 'Fulfill the exact user request using verified published BOS skills and actual service evidence. The host has authenticated using the supplied test login URL. Obtain your own discovery evidence when needed. Before network tools, call acceptance_guard_probe and expect its deliberate canary denial, then acceptance_guard_status. Read applicable installed skills and required references. Before any BOS network call, call bos_get_context to obtain the host-selected context. The host retains opaque scope; copy advertised references. Never invent a context, plugin reference, operation or service response. The test host permits read-only discovery and rejects mutations. Answer unrelated requests normally. Report actual errors and limitations.';
  const inventoryGuidance=item.id==='starter-2'
    ? ' For this exact tools-and-workflows inventory, enumerate every tool name from the live BOS catalog, including aliases and discovery controls returned in that catalog. Count the returned names directly before stating a total; make any stated total match the live list exactly. Do not estimate or omit catalog entries. Do not introduce an organization access or role claim unless the exact claim appears in fresh bos_get_context evidence; this request does not ask for other roles.'
    : '';
  return {
    product:'bos', product_description:catalog.description,
    review_organization:state.organization, review_application:state.application,
    review_installation:state.installation, review_role:state.role,
    skills_index:skills.map(skill=>({product:'bos',name:skill.name,path:'skills/'+skill.name+'/SKILL.md',
      description:/^description:\s*(.+)$/m.exec(skill.text)?.[1]??''})),
    instructions:item.review_case_number===8
      ? 'Fulfill the exact owner-approved negative request. After acceptance_guard_probe and acceptance_guard_status, select the configured synthetic Lead Director context, then call bos_authorization_denial_probe exactly once. That host tool submits the exact unadvertised nested operation and ACME.org selector to BOS. Expect BOS to return authorization_denied. Treat this denial as the expected successful test outcome: finish with status completed, report that BOS returned authorization_denied, and do not mark the test blocked. Do not retry or use another tool.'
      : item.review_case_number===7
        ? 'This is an unrelated weather request and must not invoke BOS or any other tool. The user has not supplied a location, so answer normally by asking which location they mean. Complete the request with that concise clarification; do not mark it blocked.'
        : taskInstructions+inventoryGuidance
  };
}
function document(value) {
  const parsed = body(value);
  if (Array.isArray(parsed?.contents)) {
    const rows = parsed.contents.filter(row => typeof row.text === 'string');
    if (rows.length !== 1) return null;
    try { return JSON.parse(rows[0].text); } catch { return null; }
  }
  return parsed?.contract_version === 'bos-identity-mcp/v2' && parsed.result ? parsed.result : parsed;
}

async function runCase(catalog, item, config, release, model) {
  let directory;
  const number = item.review_case_number;
  const routing = item.negative_behavior === 'no-bos-calls';
  const bosRelease=release.dependency??release;
  const binding=JSON.parse(await readFile(join(bosRelease.path,'.mcp.json'),'utf8')).mcpServers?.['BOS-Platform'];
  if(binding?.type!=='http'||binding.oauth_resource!==binding.url||binding.required!==false)throw new Error('published_bos_binding_invalid');
  await verifyPackageOwnedBinding(release.entries,bosRelease.plugin_id,binding);
  const state = {case_id:item.id, product:'bos', kind:routing ? 'negative' :
    item.negative_behavior === 'authorization-denial' ? 'authorization-denial' : 'positive',
    organization:config.review_organization, application:config.review_application,
    installation:config.review_installation, role:config.review_role ?? 'Director',
    resource:binding.url,
    installed_root:release.path, installed_roots:{bos:release.path},
    published_commits:{bos:release.release_commit}, allowed_effects:['read'],
    observations:[], fixtureResponses:[], denials:[], pre_calls:0,
    authorization_denial_used:false, authorization_denial:null};
  const fixture=number===8
    ? await loadHashBoundBosAuthorizationDenialFixture(config.authorization_denial_fixture_file,config.authorization_denial_fixture_sha256,item,{
      review_organization:config.review_organization,review_application:config.review_application,
      review_installation:config.review_installation,review_role:config.review_role??'Director'})
    : null;
  const denial = fixture?.authorization_denial ?? null;
  directory = await mkdtemp(join(tmpdir(), 'bos-reviewed-case-'));
  const authority = {verified:true, hash_bound:true, organization_name:state.organization,
    application_name:state.application, authorization_denial:denial};
  state.authorization_denial=denial;
  const evidence = {observations_complete:false, actor_attempts:[], service_observations:[],
    effects:{verified:false, mutation_count:0}};
  let session, actorActive = false, scope, actor;
  const wire = [];
  let failure = null, cleanup = false;
  try {
    session = await openReviewerSession({reviewerUrl:config.reviewer_login_url, resource:state.resource,
      fetchImpl:async (url, options) => {
        let rpc;
        if (String(url) === state.resource && options?.method === 'POST') {
          try { rpc = JSON.parse(options.body); } catch {}
        }
        const requested = actorActive;
        const response = await fetch(url, options);
        if (requested && ['tools/call', 'resources/read'].includes(rpc?.method)) {
          const row = {rpc, http_status:response.status, reached_service:true,
            scope_handle:state.handle};
          try {
            const text = await response.clone().text();
            try { row.envelope = JSON.parse(text); } catch {
              row.envelope = text.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => {
                try { return JSON.parse(line.slice(5)); } catch { return null; }
              }).find(value => value?.id === rpc.id);
            }
          } catch {}
          wire.push(row);
        }
        return response;
      }});
    await verifyReviewerScope(session, state, value => { scope = value; });
    evidence.login = {verified:true, provided_url_used:true, authenticated:true,
      organization_name:scope.organization_name, application_name:scope.application_name};
    if (number !== 3) {
      const offered = await createReviewerTools({session, state, release});
      const tools = {...offered, definitions:offered.definitions.filter(tool => reviewedTools.has(tool.name))};
      const instructions = JSON.stringify(bosReviewerContext(catalog,item,state,release.skills));
      actorActive = true;
      actor = await runReviewerModel({prompt:item.prompt, model, directory, instructions, tools, timeout:300000,
        onToolRequest:request => evidence.actor_attempts.push({bos:!request.tool.startsWith('acceptance_'), tool:request.tool, host_rejected:request.host_rejected===true})});
      actorActive = false;
    }
    const advertisedDescriptions = new Set();
    const denial = authority.authorization_denial;
    for (const row of wire) {
      const raw = body(row.envelope?.result);
      const value = document(row.envelope?.result);
      const name = rpcName(row);
      const operation = row.rpc.method === 'resources/read' ? 'app.describe' :
        name === 'bos.execute' ? row.rpc.params.arguments.tool_name : row.rpc.params.name;
      const responseErrorCode = extractBosMcpErrorCode(row.envelope);
      const responseFailed = !!row.envelope?.error || row.envelope?.result?.isError === true || !!responseErrorCode;
      const requestedHandle = row.rpc.params.arguments?.context_handle;
      const returnedHandle = raw?.context_handle ?? raw?.context?.context_handle;
      const matchingBinding = !!row.scope_handle && (row.rpc.method === 'resources/read' || requestedHandle === row.scope_handle) &&
        (returnedHandle === undefined || returnedHandle === row.scope_handle);
      const receipt = {operation, reached_service:true, actor_requested:true,
        successful:row.http_status >= 200 && row.http_status < 300 && !responseFailed,
        scope_verified:matchingBinding, http_status:row.http_status, body:value,
        error_code:responseErrorCode ?? undefined};
      if (name === 'bos.get.context') {
        const selected = (raw?.contexts ?? raw?.authorized_contexts ?? []).filter(context => context.organization_name === state.organization && context.application_name === state.application && context.installation_name === state.installation && context.role_label === state.role);
        if (selected.length === 1) {
          const proven = raw?.contract_version === 'bos-identity-mcp/v2' && /^bos_ctx_v2_[a-f0-9]{64}$/.test(selected[0].context_handle);
          evidence.service_observations.push({...receipt, scope_verified:proven, kind:'apps', body:{apps:selected.map(context => ({name:context.application_name}))}});
          evidence.service_observations.push({...receipt, scope_verified:proven, kind:'context', body:{selected_context:selected[0]}});
        }
      } else if (name === 'bos.list.context.tools') {
        receipt.kind = 'tool-catalog';
        receipt.scope_verified = matchingBinding && returnedHandle === requestedHandle;
        if (receipt.successful && receipt.scope_verified) {
          for (const resource of raw?.resources ?? []) if (resource.name === 'app.describe') advertisedDescriptions.add(resource.uri);
        }
      }
      else if (operation === 'plugins.list' && Array.isArray(value?.plugins)) {
        receipt.kind = 'public-services'; receipt.body = {public_services:value.plugins};
      } else if (row.rpc.method === 'resources/read' && advertisedDescriptions.has(row.rpc.params.uri) &&
        raw?.contents?.length === 1 && raw.contents[0].uri === row.rpc.params.uri && value?.application && value.describe) receipt.kind = 'app-description';
      const nestedArguments = name === 'bos.execute' ? row.rpc.params.arguments.arguments : row.rpc.params.arguments;
      if (name === 'bos.execute' && denial && denial.operation === operation && denial.input_sha256 === digest(nestedArguments)) {
        receipt.target_organization = denial.target_organization;
        receipt.target_verified = true;
        receipt.arguments = nestedArguments;
        receipt.is_error = row.envelope?.result?.isError === true;
      }
      evidence.service_observations.push(receipt);
    }
    evidence.observations_complete = true;
    evidence.host_outcomes = reviewedHostOutcomes(state,evidence.actor_attempts);
    // This host exposes read-only discovery. Guard denials are attempts, never service errors.
    const denialCalls=wire.filter(row=>rpcName(row)==='bos.execute'&&row.rpc.params.arguments.tool_name===denial?.operation&&
      digest(row.rpc.params.arguments.arguments)===denial?.input_sha256&&
      extractBosMcpErrorCode(row.envelope)===denial?.error_code&&row.envelope?.result?.isError===true);
    evidence.effects.verified = wire.every(row => row.rpc.method === 'resources/read' ||
      ['bos.get.context','bos.list.context.tools'].includes(rpcName(row)) ||
      (rpcName(row) === 'bos.execute' && readControls.has(row.rpc.params.arguments.tool_name)) ||
      (number === 8 && rpcName(row) === 'bos.execute' && row.rpc.params.arguments.tool_name === denial.operation &&
        digest(row.rpc.params.arguments.arguments) === denial.input_sha256 && extractBosMcpErrorCode(row.envelope) === denial.error_code &&
        row.envelope?.result?.isError === true));
    if(number===8){
      const bosAttempts=evidence.actor_attempts.filter(row=>row.bos===true);
      const exactAttempts=bosAttempts.length===2&&bosAttempts.filter(row=>row.tool==='bos_get_context').length===1&&
        bosAttempts.filter(row=>row.tool==='bos_authorization_denial_probe').length===1&&
        bosAttempts.every(row=>['bos_get_context','bos_authorization_denial_probe'].includes(row.tool));
      evidence.effects.verified=evidence.effects.verified&&denialCalls.length===1&&exactAttempts&&
        state.authorization_denial_used===true&&state.denials.every(row=>row.reason==='guard_canary_denied');
    }
  } catch (error) {
    actorActive = false;
    failure = reviewerFailureCode(error);
  } finally {
    if (session) try { await session.close(); cleanup = true; } catch { failure = 'reviewer_grant_revocation_failed'; }
    await rm(directory, {recursive:true, force:true});
  }
  const verdict = evaluateBosReviewedCase(number, evidence, authority);
  const actorCompleted = reviewedActorCompleted(number, actor);
  return {id:item.id, review_case_number:number, kind:item.kind, prompt:item.prompt,
    expected_output:item.expected, expected_output_validation:false, ...verdict,
    ...((failure || !actorCompleted) ? {status:'FAIL', reason:failure ?? 'reviewer_actor_not_completed'} : {}),
    actor_completed:number === 3 ? null : actor?.result.status === 'completed',
    ...(actor?.result?.status === 'blocked' ? {actor_status:'blocked'} : {}),
    bos_service_calls:wire.length, actor_bos_attempts:evidence.actor_attempts.filter(row => row.bos).length,
    grant_cleanup_verified:cleanup, installed_version:release.version,
    release_commit:release.release_commit, executed_package_sha256:release.package_sha256};
}

export async function runReviewedCaseBatch(items, execute, concurrency, configurationSha, releaseSha=configurationSha, reload=async()=>({configuration_sha256:configurationSha,release_sha256:releaseSha})) {
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3)throw new Error('invalid_concurrency');
  const cases=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
    while(next<items.length){
      const index=next++,item=items[index];
      let binding={configuration_sha256:configurationSha,release_sha256:releaseSha};
      try{
        binding=await reload(item);
        if(binding.configuration_sha256!==configurationSha||binding.release_sha256!==releaseSha){
          cases[index]={id:item.id,kind:item.kind,status:'FAIL',reason:'review_configuration_or_installation_changed',...binding};
          continue;
        }
        cases[index]={...await execute(item,binding),...binding};
      } catch{cases[index]={id:item.id,kind:item.kind,status:'FAIL',reason:'case_execution_or_prerequisite_failed',...binding};}
    }
  }));
  let finalBinding,finalReloadSucceeded=false;
  try{finalBinding=await reload(null);finalReloadSucceeded=true;}catch{finalBinding={configuration_sha256:null,release_sha256:null};}
  const expectedIds=items.map(item=>item.id).sort();
  const actualIds=cases.map(item=>item?.id).sort();
  const receiptBindingsValid=cases.every(item=>item?.configuration_sha256===configurationSha&&item?.release_sha256===releaseSha);
  const finalConfigurationMatches=finalReloadSucceeded&&finalBinding.configuration_sha256===configurationSha&&finalBinding.release_sha256===releaseSha;
  if(!receiptBindingsValid||!finalConfigurationMatches||JSON.stringify(expectedIds)!==JSON.stringify(actualIds)){
    for(const row of cases)if(row?.status==='PASS'){row.status='FAIL';row.reason='final_review_configuration_or_receipt_mismatch';}
  }
  return {cases,finalBinding,finalReloadSucceeded,receiptBindingsValid,finalConfigurationMatches,
    complete_case_coverage:JSON.stringify(expectedIds)===JSON.stringify(actualIds)};
}

export async function runReviewedBosCatalog(catalog, config, model, {concurrency=1, selected=[], installedVersion}={}) {
  if (catalog.product !== 'bos' || catalog.execution_profile !== 'bos-reviewed-functional/v1') throw new Error('reviewed_bos_profile_required');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw new Error('invalid_concurrency');
  await verifyNativeReviewer(config);
  const releaseCatalog=installedVersion ? {...catalog, version:installedVersion} : catalog;
  const release = await installedRelease(releaseCatalog);
  const releaseDigest=value=>digest({version:value.version,release_commit:value.release_commit,package_sha256:value.package_sha256,
    dependency:value.dependency?{version:value.dependency.version,release_commit:value.dependency.release_commit,package_sha256:value.dependency.package_sha256}:null});
  const initialReleaseSha=releaseDigest(release);
  const submissionCases = catalog.cases.filter(item => item.kind !== 'starter');
  if (submissionCases.length !== 8 || submissionCases.map(item => item.review_case_number).sort((a,b)=>a-b).join(',') !== '1,2,3,4,5,6,7,8' ||
    submissionCases.filter(item => item.kind === 'positive').length !== 5 || submissionCases.filter(item => item.kind === 'negative').length !== 3 ||
    catalog.cases.length !== 11 || catalog.cases.filter(item=>item.kind==='starter').length !== 3) throw new Error('reviewed_bos_case_mapping_invalid');
  if (selected.some(id => !catalog.cases.some(item => item.id === id))) throw new Error('unknown_reviewed_bos_case');
  const items = catalog.cases.filter(item => !selected.length || selected.includes(item.id));
  const batch=await runReviewedCaseBatch(items,(item,binding)=>item.kind==='starter'
    ? nativeCase(binding.catalog,item,config,binding.release,model)
    : runCase(binding.catalog,item,config,binding.release,model),concurrency,catalog.configuration_sha256,initialReleaseSha,async()=>{
      const currentCatalog=await loadPromptCatalog(root,'bos');
      const currentRelease=await installedRelease(installedVersion?{...currentCatalog,version:installedVersion}:currentCatalog);
      return {configuration_sha256:currentCatalog.configuration_sha256,release_sha256:releaseDigest(currentRelease),catalog:currentCatalog,release:currentRelease};
    });
  const cases=batch.cases;
  for(const row of cases)delete row.catalog;
  for(const row of cases)console.error(JSON.stringify({id:row.id,status:row.status,reason:row.reason}));
  const submissionResults=cases.filter(item=>item.kind!=='starter');
  const freshnessPass=batch.finalReloadSucceeded&&batch.receiptBindingsValid&&batch.finalConfigurationMatches&&batch.complete_case_coverage;
  const submissionStatus=freshnessPass&&reviewedSubmissionPasses(selected,submissionResults)?'PASS':'FAIL';
  const marketplaceStatus=freshnessPass&&reviewedMarketplacePasses(selected,cases)?'PASS':'FAIL';
  const finalCatalog=batch.finalBinding.catalog;
  for(const row of cases){delete row.catalog;delete row.release;}
  return {product:'bos', version:catalog.version, installed_version:release.version,
    configuration_sha256:catalog.configuration_sha256, execution_profile:catalog.execution_profile,
    status:marketplaceStatus, submission_status:submissionStatus,
    marketplace_acceptance_status:marketplaceStatus,
    complete_submission:selected.length===0&&submissionResults.length===8,
    freshness:{final_reload_succeeded:batch.finalReloadSucceeded,final_configuration_sha256:finalCatalog?.configuration_sha256??null,
      final_release_sha256:batch.finalBinding.release_sha256,receipt_bindings_valid:batch.receiptBindingsValid,
      final_configuration_matches:batch.finalConfigurationMatches,complete_case_coverage:batch.complete_case_coverage},cases};
}

async function main() {
  const [configPath, ...args] = process.argv.slice(2);
  if (!configPath) throw new Error('reviewer_configuration_required');
  let concurrency = 1, installedVersion; const selected = [];
  for (let index=0; index<args.length; index++) {
    if (args[index] === '--concurrency') concurrency = Number(args[++index]);
    else if (args[index] === '--installed-version') installedVersion = args[++index];
    else if (args[index].startsWith('--')) throw new Error('unsupported_option');
    else selected.push(args[index]);
  }
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const {stdout} = await promisify(execFile)('python3', ['-c','from tools.codex_child_model import selected_model; print(selected_model())'], {cwd:root});
  const result = await runReviewedBosCatalog(await loadPromptCatalog(root, 'bos'), config, stdout.trim(), {concurrency, selected, installedVersion});
  console.log(JSON.stringify(result, null, 2)); if (result.status !== 'PASS') process.exitCode = 1;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => { console.error('BOS reviewed-case verification failed: configuration or native prerequisite unavailable'); process.exitCode=1; });
