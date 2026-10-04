import {body,selectReviewerContext} from './marketplace-native-hook.mjs';

// Host-owned evidence only: this preflight never populates the model's scope,
// observations or callable operation catalog.
export async function verifyReviewerScope(session,state,captureEvidence) {
  const catalog=await session.rpc('tools/list');
  const tools=Array.isArray(catalog?.tools)?catalog.tools:[];
  const matches=tools.filter(row=>typeof row?.name==='string'&&row.name.replaceAll('_','.')==='bos.get.context');
  if(matches.length!==1)throw new Error('reviewer_identity_unverified');
  const response=await session.rpc('tools/call',{name:matches[0].name,arguments:{}});
  const value=body(response);
  if(response?.isError===true||value?.contract_version!=='bos-identity-mcp/v2')throw new Error('reviewer_identity_unverified');
  const contexts=value.contexts??value.authorized_contexts;
  if(!Array.isArray(contexts)||contexts.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new Error('reviewer_identity_unverified');
  const selected=selectReviewerContext(contexts,state);
  if(!selected||typeof selected.context_handle!=='string'||!/^bos_ctx_v2_[a-f0-9]{64}$/u.test(selected.context_handle))throw new Error('reviewer_identity_unverified');
  captureEvidence?.(Object.freeze(Object.fromEntries(['organization_name','application_name','installation_name','role_label'].map(key=>[key,selected[key]]))));
  return true;
}
