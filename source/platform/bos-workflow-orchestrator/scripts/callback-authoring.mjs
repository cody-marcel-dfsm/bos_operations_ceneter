import Ajv2020 from "./vendor/ajv2020.bundle.mjs";

const reference = /^\$nodes\.([a-z][a-z0-9_]*)\.outputs\.(.+)$/u;
const predicates = condition => condition?.all ?? condition?.any ?? [condition];
function pathSchema(schema,path) {for(const key of path.split(".")) {schema=schema?.properties?.[key];if(!schema)return null;}return schema;}

export function validateCallbackAuthoring(document,callbackSources,edges,findings) {
  const issue=(path,message)=>findings.push({code:"bosl_callback_invalid",path,message});
  const declarations=document.bootstrap?.callbacks ?? [];
  const waits=document.nodes.filter(node=>node.operation==="bosl.callbacks.await");
  if(!declarations.length) {if(waits.length)issue("$.bootstrap","Wait nodes require bootstrap callbacks.");return;}
  const discovered=new Map(callbackSources.map(contract=>[contract.operation??contract.semantic_operation_id,contract]));
  const sources=new Map();const codes=new Set();
  const validateMatch=(condition,descriptor,path,wait,dominators)=>{
    for(const predicate of predicates(condition)) {
      if(!predicate || !["eq","neq","exists","not_exists","gt","gte","lt","lte"].includes(predicate.op)) {issue(path,"Callback predicates must use the published grammar.");continue;}
      if(["exists","not_exists"].includes(predicate.op)===Object.hasOwn(predicate,"right")) issue(path,"Comparison predicates require right; existence predicates omit it.");
      const schemas=[];const values=[];
      for(const operand of [predicate.left,predicate.right].filter(Boolean)) {
        if(Object.hasOwn(operand,"value")) {schemas.push(null);values.push(operand.value);continue;}
        const from=operand.from;let schema=null;
        if(typeof from!=="string") {issue(path,"Callback operands require a literal or a typed reference.");continue;}
        if(from.startsWith("$event.")) {
          if(!descriptor.match_fields.includes(from))issue(path,"The source does not advertise that match field.");
          schema=pathSchema(descriptor.event_schema,from.slice(7));
        } else if(from.startsWith("$journey.inputs.")) {
          let value=document.inputs;
          for(const key of from.slice(16).split("."))value=value?.[key];
          if(value===undefined)issue(path,"Callback correlation refers to an undefined journey input.");
          schemas.push(null);values.push(value);continue;
        } else {
          const match=reference.exec(from);
          if(!match || !wait || match[1]===wait || !dominators.get(wait)?.has(match[1])) issue(path,"Callback correlation requires a dominating earlier node.");
          else schema=pathSchema({properties:document.nodes.find(node=>node.code===match[1])?.outputs},match[2]);
        }
        if(!schema)issue(path,"Callback correlation requires an advertised typed field.");
        schemas.push(schema);values.push(undefined);
      }
      if(schemas.length===2) {
        const [left,right]=schemas;
        if(left && right && left.type!==right.type)issue(path,"Callback correlation operand types differ.");
        const ajv=new Ajv2020({strict:false});
        if(left && !right && !ajv.validate(left,values[1]))issue(path,"Callback literal type is incompatible.");
        if(right && !left && !ajv.validate(right,values[0]))issue(path,"Callback literal type is incompatible.");
      }
    }
  };
  for(const [index,callback] of declarations.entries()) {
    const path=`$.bootstrap.callbacks[${index}]`;
    if(codes.has(callback.code))issue(path,"Callback codes must be unique.");codes.add(callback.code);
    const contract=discovered.get(callback.source);const descriptor=contract?.input_schema?.["x-bos-callback-source"];
    if(!descriptor || contract.bosl_server_node!==false || contract.node_type!=null) {issue(path,"Discover the exact installed callback source contract.");continue;}
    if(!Array.isArray(descriptor.match_fields) || !Array.isArray(descriptor.dedupe_fields) || !descriptor.event_schema) {issue(path,"Callback source descriptor is incomplete.");continue;}
    const resolved={};
    for(const [key,binding] of Object.entries(callback.inputs??{})) {
      if(Object.hasOwn(binding,"value"))resolved[key]=binding.value;
      else if(typeof binding.from==="string" && /^\$journey\.inputs\.[A-Za-z_][A-Za-z0-9_]*$/u.test(binding.from))resolved[key]=document.inputs[binding.from.slice(16)];
      else issue(path,"Bootstrap inputs require static literal or journey-input bindings.");
    }
    if(!new Ajv2020({strict:false}).validate(contract.input_schema,resolved))issue(path,"Bootstrap source inputs violate the discovered contract.");
    validateMatch(callback.match,descriptor,path,null,null);
    if((callback.dedupe_on??[]).some(field=>!descriptor.dedupe_fields.includes(field)))issue(path,"Deduplication fields must be advertised by the source.");
    sources.set(callback.code,descriptor);
  }
  if(document.bootstrap.activate_on!==undefined && !codes.has(document.bootstrap.activate_on))issue("$.bootstrap.activate_on","Standing activation requires a declared callback.");
  const all=new Set(document.nodes.map(node=>node.code));const previous=new Map([...all].map(code=>[code,new Set()]));
  for(const node of document.nodes)for(const target of edges(node))previous.get(target)?.add(node.code);
  const dominators=new Map([...all].map(code=>[code,code===document.entry?new Set([code]):new Set(all)]));
  let changed=true;
  while(changed) {changed=false;for(const code of all) {if(code===document.entry)continue;const parents=[...previous.get(code)];const common=parents.length?[...dominators.get(parents[0])].filter(member=>parents.every(parent=>dominators.get(parent).has(member))):[];const next=new Set([code,...common]);if(next.size!==dominators.get(code).size || [...next].some(member=>!dominators.get(code).has(member))) {dominators.set(code,next);changed=true;}}}
  for(const node of waits) {const code=node.inputs?.callback?.value;const descriptor=sources.get(code);if(!descriptor)issue(`$.nodes.${node.code}.inputs.callback`,"Wait requires a declared callback literal.");else if(node.inputs.match)validateMatch(node.inputs.match.value,descriptor,`$.nodes.${node.code}.inputs.match`,node.code,dominators);}
}
