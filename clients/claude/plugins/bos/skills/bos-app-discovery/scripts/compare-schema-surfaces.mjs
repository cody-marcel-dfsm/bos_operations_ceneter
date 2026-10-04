import {fileURLToPath} from 'node:url';

const sets=new Set(['required','enum','type']);
const annotations=new Set(['title','description','$comment','examples']);
const schemaMaps=new Set(['properties','patternProperties','$defs','definitions','dependentSchemas']);
const schemaArrays=new Set(['allOf','anyOf','oneOf','prefixItems']);
const schemaValues=new Set(['additionalProperties','unevaluatedProperties','items','additionalItems','unevaluatedItems','contains','propertyNames','not','if','then','else','contentSchema']);
const pointerPart=value=>value.replaceAll('~','~0').replaceAll('/','~1');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const sorted=items=>items.sort((a,b)=>{const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;});
function literal(value,depth=0){
  if(depth>128)throw new Error('Schema comparison depth exceeded');
  if(Array.isArray(value))return value.map(item=>literal(item,depth+1));
  if(object(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,literal(value[key],depth+1)]));
  if(value===null||['string','boolean'].includes(typeof value)||typeof value==='number'&&Number.isFinite(value))return value;
  throw new Error('Schema comparison requires JSON declarations');
}
function normalizeSchema(schema,annotationPaths,path='',depth=0){
  if(depth>128)throw new Error('Schema comparison depth exceeded');
  if(typeof schema==='boolean')return schema;
  if(!object(schema))return literal(schema,depth);
  return Object.fromEntries(Object.keys(schema).sort().map(key=>{
    const value=schema[key],next=path+'/'+pointerPart(key);
    if(annotations.has(key))annotationPaths.add(next);
    if(schemaMaps.has(key)&&object(value))return [key,Object.fromEntries(Object.keys(value).sort().map(name=>[name,normalizeSchema(value[name],annotationPaths,next+'/'+pointerPart(name),depth+1)]))];
    if(schemaArrays.has(key)&&Array.isArray(value))return [key,value.map((item,index)=>normalizeSchema(item,annotationPaths,next+'/'+index,depth+1))];
    if(schemaValues.has(key)){
      if(key==='items'&&Array.isArray(value))return [key,value.map((item,index)=>normalizeSchema(item,annotationPaths,next+'/'+index,depth+1))];
      return [key,normalizeSchema(value,annotationPaths,next,depth+1)];
    }
    if(sets.has(key)&&Array.isArray(value))return [key,sorted(value.map(item=>literal(item,depth+1)))];
    if(key==='dependentRequired'&&object(value))return [key,Object.fromEntries(Object.keys(value).sort().map(name=>[name,Array.isArray(value[name])?sorted(literal(value[name],depth+1)):literal(value[name],depth+1)]))];
    if(key==='dependencies'&&object(value))return [key,Object.fromEntries(Object.keys(value).sort().map(name=>[name,Array.isArray(value[name])?sorted(literal(value[name],depth+1)):normalizeSchema(value[name],annotationPaths,next+'/'+pointerPart(name),depth+1)]))];
    // const, enum entries, defaults and unknown extensions are JSON values.
    // Their keyword-shaped property names never acquire schema semantics.
    return [key,literal(value,depth+1)];
  }));
}

// Differences describe declarations only. They establish neither semantic
// correspondence nor interoperability, authorization, validation, or readiness.
export function compareSchemaSurfaces(left,right){
  for(const schema of [left,right])if(typeof schema!=='boolean'&&(!schema||typeof schema!=='object'||Array.isArray(schema)))throw new Error('Expected a schema object or boolean');
  const annotationPaths=new Set(),a=normalizeSchema(left,annotationPaths),b=normalizeSchema(right,annotationPaths),differences=[];
  const visit=(x,y,path,parts=[])=>{
    if(JSON.stringify(x)===JSON.stringify(y))return;
    if(x&&y&&typeof x==='object'&&typeof y==='object'&&!Array.isArray(x)&&!Array.isArray(y)){
      for(const key of [...new Set([...Object.keys(x),...Object.keys(y)])].sort()){
        const next=path+'/'+pointerPart(key),nextParts=[...parts,key];
        if(Object.hasOwn(x,key)&&Object.hasOwn(y,key))visit(x[key],y[key],next,nextParts);
        else record(next,nextParts,Object.hasOwn(x,key),x[key],Object.hasOwn(y,key),y[key]);
      }
    }else record(path,parts,true,x,true,y);
  };
  const record=(pointer,parts,hasLeft,leftValue,hasRight,rightValue)=>{
    if(differences.length>=2048)throw new Error('Schema comparison difference limit exceeded');
    const annotation=[...annotationPaths].some(root=>pointer===root||pointer.startsWith(root+'/'));
    differences.push({pointer,kind:annotation?'annotation':'declaration',left:{declared:hasLeft,...(hasLeft?{value:leftValue}:{})},right:{declared:hasRight,...(hasRight?{value:rightValue}:{})}});
  };
  visit(a,b,'');
  return {complete:true,declaration_differences:differences.filter(row=>row.kind==='declaration'),annotation_differences:differences.filter(row=>row.kind==='annotation'),guarantee:'declaration_comparison_only'};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>1048576)throw new Error('Schema comparison input limit exceeded');}
    const request=JSON.parse(input);
    if(!Array.isArray(request.pairs)||request.pairs.length<1||request.pairs.length>32)throw new Error('Expected one to 32 schema pairs');
    console.log(JSON.stringify({comparisons:request.pairs.map(pair=>compareSchemaSurfaces(pair.left,pair.right))}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
