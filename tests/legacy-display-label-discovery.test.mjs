import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateApiContractResponse} from '../source/platform/bos-app-discovery/scripts/validate-discovery.mjs';
const published=JSON.parse(await readFile(new URL('./fixtures/google-drive-search-contract.json',import.meta.url),'utf8'));
const outputProperties=value=>value.output_schema.properties.files.items.properties;
const display=outputProperties(published).location_context;

test('actual published legacy Drive contract accepts its exact closed public output labels',()=>{
 const before=JSON.stringify(published);
 assert.equal(validateApiContractResponse(published,{operation:published.operation,source:published.source}),published);
 assert.equal(JSON.stringify(published),before);
 assert.throws(()=>validateApiContractResponse(published,{operation:'other.operation'}),/requested contract link/);
 assert.throws(()=>validateApiContractResponse(published,{source:{...published.source,plugin:'other-plugin'}}),/selected plugin/);
 for(const field of ['location_context','ownership_context']){
  const document=structuredClone(published);outputProperties(document)[field]=structuredClone(display);
  assert.equal(validateApiContractResponse(document),document);
 }
});

test('legacy output display labels retain exact shape, location and recursive privacy rejection',()=>{
 const invalid=[{...display,additionalProperties:true},{...display,additionalProperties:{}},{...display,type:'string'},{...display,required:[]},{...display,required:['label','extra']},{...display,properties:{label:{type:'string'}}},{...display,properties:{label:{type:'string',minLength:0,maxLength:255}}},{...display,properties:{label:{type:'string',minLength:1,maxLength:256}}},{...display,properties:{label:{type:'string',minLength:1,maxLength:255,default:'private'}}},{...display,properties:{...display.properties,context_handle:{type:'string'}}},{...display,description:'Bearer abcdefghijklmnopqrstuvwxyz'}];
 for(const field of ['location_context','ownership_context']){
  for(const shape of invalid){const document=structuredClone(published);outputProperties(document)[field]=shape;assert.throws(()=>validateApiContractResponse(document),/raw authority|private discovery/);}
  for(const location of ['input_schema','guarantees']){const document=structuredClone(published);document[location].properties??={};document[location].properties[field]=structuredClone(display);assert.throws(()=>validateApiContractResponse(document),/raw authority/);}
  for(const renamed of [field.toUpperCase(),field.replaceAll('_','-'),'tenant_context']){const document=structuredClone(published);outputProperties(document)[renamed]=structuredClone(display);assert.throws(()=>validateApiContractResponse(document),/raw authority/);}
 }
 for(const location of ['output','source']){const document=structuredClone(published);(location==='output'?outputProperties(document):document.source).context_handle={type:'string'};assert.throws(()=>validateApiContractResponse(document),/raw authority/);}
});
