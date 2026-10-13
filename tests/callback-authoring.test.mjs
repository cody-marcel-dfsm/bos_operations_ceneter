import test from "node:test";
import assert from "node:assert/strict";
import {validateCallbackAuthoring} from "../source/platform/bos-workflow-orchestrator/scripts/callback-authoring.mjs";

const edges=node=>[node.next,...(node.transitions?.cases??[]).map(c=>c.next),node.transitions?.default].filter(Boolean);
const source={operation:"gmail.trigger",bosl_server_node:false,input_schema:{type:"object",properties:{},additionalProperties:false,"x-bos-callback-source":{event_schema:{type:"object",properties:{fields:{type:"object",properties:{subject:{type:"string"}}}}},match_fields:["$event.fields.subject"],dedupe_fields:["$event.fields.subject"]}}};
function graph() {return {inputs:{subject:"Hello"},entry:"prepare",bootstrap:{callbacks:[{code:"mail",source:"gmail.trigger",inputs:{},match:{left:{from:"$event.fields.subject"},op:"eq",right:{from:"$journey.inputs.subject"}}}]},nodes:[{code:"prepare",type:"server",outputs:{subject:{type:"string"}},next:"wait"},{code:"wait",type:"server",operation:"bosl.callbacks.await",inputs:{callback:{value:"mail"},match:{value:{left:{from:"$event.fields.subject"},op:"eq",right:{from:"$nodes.prepare.outputs.subject"}}}},next:"done"},{code:"done",type:"server",outputs:{},terminal:true}]};}
test("callback authoring requires independently discovered sources and typed dominating correlation",()=>{const findings=[];validateCallbackAuthoring(graph(),[source],edges,findings);assert.deepEqual(findings,[]);});
test("source absence, unadvertised fields and bootstrap node references reject authoring",()=>{
  for(const change of [g=>g.bootstrap.callbacks[0].source="unknown.trigger",g=>g.bootstrap.callbacks[0].match.left.from="$event.fields.body",g=>g.bootstrap.callbacks[0].match.right.from="$nodes.prepare.outputs.subject",g=>g.nodes[0].outputs.subject={type:"integer"}]) {const g=graph();change(g);const findings=[];validateCallbackAuthoring(g,[source],edges,findings);assert.ok(findings.length);}
});
test("a bypass path prevents earlier-output correlation",()=>{const g=graph();g.entry="branch";g.nodes.push({code:"branch",transitions:{cases:[{next:"prepare"}],default:"wait"},outputs:{}});const findings=[];validateCallbackAuthoring(g,[source],edges,findings);assert.ok(findings.some(f=>f.message.includes("dominating")));});
test("standing activation resolves a local bootstrap callback",()=>{const g=graph();g.bootstrap.activate_on="missing";const findings=[];validateCallbackAuthoring(g,[source],edges,findings);assert.ok(findings.some(f=>f.path==="$.bootstrap.activate_on"));});
