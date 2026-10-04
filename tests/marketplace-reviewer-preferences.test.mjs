import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readReviewerPreferences} from '../scripts/marketplace-reviewer-preferences.mjs';
import {readPluginPreferences} from '../source/platform/bos-mcp-client/scripts/customer-preferences.mjs';
import {withGradingContext,failedNativeCaseReceipt} from '../scripts/marketplace-native-run.mjs';

test('reviewer reads only each calling plugin using the verified helper and preserves stored defaults',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'reviewer-preferences-test-'));
 try{
  for(const product of ['bos','education-center','my-crm']){
   const file=join(directory,product+'.json');
   const bytes=JSON.stringify({schema_version:'bos.plugin-customer-preferences/v1',plugin_name:product,default_context:{organization_name:'Other saved organization',installation_name:'Other saved installation',role_label:'Other saved role'}});
   await writeFile(file,bytes);const events=[];
   const proof=await readReviewerPreferences(product,{path:'verified-root',release_commit:'published-commit'},{
    verify:async(...args)=>events.push(['verify',...args]),
    locate:async(...args)=>{events.push(['locate',...args]);return 'verified-helper';},
    load:async path=>{events.push(['load',path]);return {readPluginPreferences:async requested=>{events.push(['read',requested]);return readPluginPreferences(requested,file,[]);}};}
   });
   assert.deepEqual(events,[['verify','verified-root','published-commit','skills/bos-mcp-client/scripts/customer-preferences.mjs'],['locate','verified-root','skills/bos-mcp-client/scripts/customer-preferences.mjs'],['load','verified-helper'],['read',product]]);
   assert.deepEqual(proof,{plugin_name:product,read_performed:true,default_present:true,values_discarded:true,write_performed:false});
   assert.equal(await readFile(file,'utf8'),bytes);
   const evidence=withGradingContext({},{scope:{organization_name:'Explicit reviewer organization'},scopeVerified:true,bos:{},preferences:proof});
   assert.equal(evidence.reviewer_scope.organization_name,'Explicit reviewer organization');
   assert.equal(evidence.reviewer_scope.preference_read_performed,true);
   assert.doesNotMatch(JSON.stringify(evidence),/Other saved/);
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('absent defaults are actual reads; malformed, foreign and unverified preferences fail closed',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'reviewer-preferences-test-'));
 try{
  const file=join(directory,'preferences.json');let reads=0;
  const dependencies={verify:async()=>{},locate:async()=>file,load:async()=>({readPluginPreferences:async product=>{reads++;return readPluginPreferences(product,file,[]);}})};
  const absent=await readReviewerPreferences('my-crm',{},dependencies);
  assert.equal(absent.read_performed,true);assert.equal(absent.default_present,false);assert.equal(reads,1);
  for(const bytes of ['invalid JSON',JSON.stringify({schema_version:'bos.plugin-customer-preferences/v1',plugin_name:'bos',default_context:{organization_name:'Foreign default'}})]){
   await writeFile(file,bytes);await assert.rejects(readReviewerPreferences('my-crm',{},dependencies),{message:'reviewer_preference_read_failed'});
   assert.equal(await readFile(file,'utf8'),bytes);
  }
  const before=reads;
  await assert.rejects(readReviewerPreferences('my-crm',{}, {...dependencies,verify:async()=>{throw new Error('private failure');}}),{message:'reviewer_preference_read_failed'});
  await assert.rejects(readReviewerPreferences('foreign',{},dependencies),{message:'reviewer_preference_read_failed'});
  assert.equal(reads,before);
  assert.equal(withGradingContext({},{bos:{}}).reviewer_scope.preference_read_performed,false);
  assert.equal(failedNativeCaseReceipt({},null,false,new Error('reviewer_preference_read_failed')).reason,'reviewer_preference_read_failed');
 }finally{await rm(directory,{recursive:true,force:true});}
});
