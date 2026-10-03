import {isDeepStrictEqual} from 'node:util';

function at(value,path) {
  if(typeof path!=='string'||!path.startsWith('/'))return undefined;
  for(const part of path.slice(1).split('/')){
    const key=part.replaceAll('~1','/').replaceAll('~0','~');
    if(!value||typeof value!=='object'||!Object.hasOwn(value,key))return undefined;
    value=value[key];
  }
  return value;
}
export function reviewerOutcomeMatches(rules,evidence,requirements=[]) {
  if(!Array.isArray(rules)||!rules.length||!rules.some(rule=>/^\/responses\/\d+\/body\//.test(rule.path??'')))return false;
  if(!requirements.every(required=>rules.some(rule=>rule.requirement===required.id&&rule.operator===required.operator&&(required.minimum===undefined||rule.value>=required.minimum))))return false;
  return rules.every(rule=>{
    const value=at(evidence,rule.path);if(value===undefined||value===null)return false;
    if(rule.operator==='equals')return rule.value!==undefined&&rule.value!==null&&isDeepStrictEqual(value,rule.value);
    if(rule.operator==='contains')return typeof value==='string'&&typeof rule.value==='string'&&rule.value.length>0&&value.includes(rule.value);
    if(rule.operator==='same_values'){
      const other=at(evidence,rule.other_path);
      return rule.other_path!==rule.path&&Array.isArray(value)&&Array.isArray(other)&&value.length>0&&isDeepStrictEqual(value.map(row=>JSON.stringify(row)).sort(),other.map(row=>JSON.stringify(row)).sort());
    }
    if(rule.operator==='min_length'){
      if(!Array.isArray(value)||!Number.isInteger(rule.value)||rule.value<1||value.length<rule.value)return false;
      if(['source-provenance','multiple-sources'].includes(rule.requirement)&&!rule.distinct_by_path)return false;
      const distinct=rule.distinct_by_path?value.map(row=>at(row,rule.distinct_by_path)):value;
      return distinct.every(row=>row!==undefined&&row!==null)&&new Set(distinct.map(row=>JSON.stringify(row))).size===distinct.length;
    }
    return false;
  });
}
