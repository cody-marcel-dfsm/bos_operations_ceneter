import {isDeepStrictEqual} from 'node:util';
import {validateOperationDescription, validateApiContractResponse} from '../source/platform/bos-app-discovery/scripts/validate-discovery.mjs';

const transports = new Set(['deterministic_https', 'https_discovery', 'mcp_discovery']);
const stable = value => JSON.stringify(value, (_, row) => row && typeof row === 'object' && !Array.isArray(row) ? Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]])) : row);
function at(value, path) {
  if (path === '') return value;
  if (typeof path !== 'string' || path.length > 512 || !path.startsWith('/') || /~(?:[^01]|$)/.test(path)) return undefined;
  for (const part of path.slice(1).split('/')) {
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    if (['__proto__', 'prototype', 'constructor'].includes(key) || !value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const publicName = value => typeof value === 'string' && value.trim().length > 0;
function identityMetadata(body, operation) {
  if (!record(body) || body.contract_version !== 'bos-identity-mcp/v2') return false;
  if (operation === 'bos.get.context') return Array.isArray(body.contexts) && body.contexts.length > 0 && body.contexts.every(row => record(row) && ['organization_name', 'application_name', 'installation_name', 'role_label'].every(key => publicName(row[key])));
  return Array.isArray(body.tools) && body.tools.every(row => record(row) && publicName(row.name) && typeof row.description === 'string' && record(row.inputSchema)) && Array.isArray(body.resources) && body.resources.every(row => record(row) && publicName(row.uri) && publicName(row.name));
}
function responseSelection(evidence, selector, operator) {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector) || typeof selector.operation !== 'string' || !selector.operation || !transports.has(selector.transport) || !Array.isArray(evidence.responses ?? [])) return undefined;
  const consistent = Object.hasOwn(selector, 'consistent_metadata');
  if (consistent && (selector.consistent_metadata !== true || operator !== 'equals')) return undefined;
  const keys = Object.keys(selector).filter(key => key !== 'consistent_metadata').sort().join(',');
  const described = keys === 'described_operation,operation,transport';
  const apiContract = keys === 'api_contract_operation,operation,transport';
  if (keys !== 'operation,transport' && !described && !apiContract) return undefined;
  if (described && (selector.operation !== 'app.describe' || selector.transport !== 'https_discovery' || typeof selector.described_operation !== 'string' || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(selector.described_operation))) return undefined;
  if (apiContract && (selector.operation !== 'api.contract.get' || selector.transport !== 'mcp_discovery' || typeof selector.api_contract_operation !== 'string' || !/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/u.test(selector.api_contract_operation))) return undefined;
  const identity = selector.transport === 'mcp_discovery' && ['bos.get.context', 'bos.list.context.tools'].includes(selector.operation);
  if (consistent && !described && !identity) return undefined;
  const matches = (evidence.responses ?? []).map((row, index) => ({row, index})).filter(({row}) => row?.operation === selector.operation && row.transport === selector.transport && row.successful === true);
  if (!described && !apiContract) {
    if (consistent ? !matches.length || !matches.every(({row}) => identityMetadata(row.body, selector.operation) && isDeepStrictEqual(row.body, matches[0].row.body)) : matches.length !== 1) return undefined;
    return {body: matches[0].row.body, origin: `/responses/${matches[0].index}/body`};
  }
  const contracts = [];
  for (const {row, index} of matches) {
    if (apiContract) {
      const body = row.body?.result;
      try { validateApiContractResponse(body); } catch { return undefined; }
      if (body.operation === selector.api_contract_operation) contracts.push({body, origin: `/responses/${index}/body/result`});
      continue;
    }
    try { validateOperationDescription(row.body); } catch { return undefined; }
    row.body.operations.forEach((body, operationIndex) => {
      if (body.operation === selector.described_operation) contracts.push({body, origin: `/responses/${index}/body/operations/${operationIndex}`});
    });
  }
  const unique = consistent ? contracts.length > 0 && contracts.every(row => isDeepStrictEqual(row.body, contracts[0].body)) : contracts.length === 1;
  return unique && (apiContract || contracts[0].body.status === 'described') ? contracts[0] : undefined;
}
function projected(value, paths) {
  if (paths === undefined) return value;
  if (!Array.isArray(paths) || !paths.length || paths.length > 4 || !Array.isArray(value)) return undefined;
  for (const path of paths) {
    if (value.length > 1000) return undefined;
    const rows = value.map(row => at(row, path));
    if (rows.some(row => row === undefined || row === null)) return undefined;
    value = rows.flat(1);
  }
  return value.length <= 1000 ? value : undefined;
}
function selected(evidence, rule, other = false) {
  const prefix = other ? 'other_' : '';
  const base = rule[prefix + 'response'] ? responseSelection(evidence, rule[prefix + 'response'], rule.operator)?.body : rule[prefix + 'evidence'] === 'answer' ? evidence.answer : rule[prefix + 'evidence'] === 'effects' ? {prohibited_effects: evidence.prohibited_effects} : undefined;
  return projected(at(base, rule[prefix + 'path']), rule[prefix + 'project_paths']);
}
function selectedLocations(evidence, rule, other = false) {
  const prefix = other ? 'other_' : '', selector = rule[prefix + 'response'];
  if (!selector) return [];
  const selection = responseSelection(evidence, selector, rule.operator), path = rule[prefix + 'path'];
  if (!selection) return [];
  const value = at(selection.body, path);
  if (!Array.isArray(value)) return [];
  const origin = selection.origin + path;
  let entries = value.map((value, index) => ({value, path: `${origin}/${index}`}));
  for (const projection of rule[prefix + 'project_paths'] ?? []) {
    const next = [];
    for (const entry of entries) {
      const value = at(entry.value, projection), path = entry.path + projection;
      if (value === undefined || value === null) return [];
      if (Array.isArray(value)) next.push(...value.map((value, index) => ({value, path: `${path}/${index}`})));
      else next.push({value, path});
    }
    entries = next;
  }
  return entries.map(entry => entry.path);
}
function completeSource(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === 'application,platform,plugin' && Object.values(value).every(row => typeof row === 'string' && row.trim());
}
function timestamp(value) {
  if (typeof value !== 'string') return undefined;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return undefined;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return undefined;
  if (parts[8] !== 'Z') {
    const [offsetHour, offsetMinute] = parts[8].slice(1).split(':').map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return undefined;
  }
  const milliseconds = Date.parse(value.replace(/\.\d+(?=Z|[+-])/, ''));
  if (!Number.isFinite(milliseconds)) return undefined;
  return BigInt(milliseconds) * 1000000n + BigInt((parts[7] ?? '').padEnd(9, '0'));
}
const safeRequirementId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);

function matchesRule(rule, evidence, binding) {
  const value = selected(evidence, rule);
  if (value === undefined || value === null) return false;
  if (rule.operator === 'equals') return rule.value !== undefined && rule.value !== null && isDeepStrictEqual(value, rule.value);
  if (rule.operator === 'contains') return typeof value === 'string' && typeof rule.value === 'string' && rule.value.length > 0 && value.includes(rule.value);
  if (rule.operator === 'same_values') {
    const other = selected(evidence, rule, true);
    if (!Array.isArray(value) || !Array.isArray(other) || !value.length || !value.every(row => row !== undefined && row !== null) || !other.every(row => row !== undefined && row !== null)) return false;
    const locations = selectedLocations(evidence, rule), otherLocations = new Set(selectedLocations(evidence, rule, true));
    return locations.length > 0 && otherLocations.size > 0 && !locations.some(path => otherLocations.has(path)) && isDeepStrictEqual(value.map(stable).sort(), other.map(stable).sort());
  }
  if (rule.operator === 'min_length') {
    if (!Array.isArray(value) || value.length > 1000 || !Number.isInteger(rule.value) || rule.value < 1 || value.length < rule.value) return false;
    const provenance = ['source-provenance', 'multiple-sources'].includes(rule.requirement);
    if (provenance && typeof rule.distinct_by_path !== 'string') return false;
    const distinct = typeof rule.distinct_by_path === 'string' ? value.map(row => at(row, rule.distinct_by_path)) : value;
    if (provenance && !distinct.every(completeSource)) return false;
    return distinct.every(row => row !== undefined && row !== null) && new Set(distinct.map(stable)).size === distinct.length;
  }
  if (rule.operator === 'timestamp_age') {
    const clock = timestamp(binding.execution_started_at), limit = rule.value;
    if (typeof clock !== 'bigint' || !limit || !Number.isInteger(limit.maximum_age_ms) || limit.maximum_age_ms < 1 || limit.maximum_age_ms > 604800000 || !Number.isInteger(limit.future_skew_ms) || limit.future_skew_ms < 0 || limit.future_skew_ms > 300000) return false;
    const timestamps = Array.isArray(value) ? value : [value];
    return timestamps.length > 0 && timestamps.length <= 1000 && timestamps.every(row => {
      const time = timestamp(row);
      return typeof time === 'bigint' && clock - time <= BigInt(limit.maximum_age_ms) * 1000000n && time - clock <= BigInt(limit.future_skew_ms) * 1000000n;
    });
  }
  return false;
}

export function reviewerOutcomeDiagnostics(assertion, evidence, requirements = [], binding = {}) {
  const promptIds = [...new Set(requirements.map(row => row?.id).filter(safeRequirementId))].sort();
  const unmatchedPrompt = () => promptIds.map(requirement_id => ({requirement_id, status: 'unmatched'}));
  const fail = issue_class => ({status: 'unmatched', issue_class, requirements: unmatchedPrompt()});
  if (assertion === undefined || assertion === null) return fail('case_assertion_missing');
  if (Object.keys(assertion ?? {}).sort().join(',') !== 'case_id,product,rules,schema' || assertion?.schema !== 'marketplace-case-assertions/v1') return fail('assertion_schema_invalid');
  if (!binding.product || !binding.case_id || assertion.product !== binding.product || assertion.case_id !== binding.case_id) return fail('assertion_case_binding_mismatch');
  const rules = assertion.rules;
  const ruleKeys = new Set(['requirement', 'operator', 'response', 'path', 'project_paths', 'value', 'evidence', 'other_response', 'other_path', 'other_project_paths', 'other_evidence', 'distinct_by_path']);
  if (!Array.isArray(rules) || !rules.every(rule => rule && typeof rule === 'object' && !Array.isArray(rule) && Object.keys(rule).every(key => ruleKeys.has(key)))) return fail('assertion_rules_invalid');
  if (rules.some(rule => rule.other_response && Object.hasOwn(rule.other_response, 'consistent_metadata'))) return fail('assertion_rules_invalid');
  if (!rules.length || rules.length > 64 || !rules.some(rule => rule.response && rule.operator === 'equals' && rule.value !== undefined && rule.value !== null)) return fail('assertion_rules_invalid');
  const coversPrompt = requirements.every(required => rules.some(rule => rule.requirement === required.id && rule.operator === required.operator && (required.minimum === undefined || (typeof rule.value === 'number' && rule.value >= required.minimum)) && (required.operator !== 'timestamp_age' || (rule.value?.maximum_age_ms <= required.maximum_age_ms && rule.value?.future_skew_ms <= required.future_skew_ms))));
  if (!coversPrompt) return fail('prompt_requirements_uncovered');
  const allowedIds = new Set(promptIds);
  const statuses = new Map(promptIds.map(requirement_id => [requirement_id, 'matched']));
  let unboundRuleCount = 0;
  let rulesMatched = true;
  for (const rule of rules) {
    const matched = matchesRule(rule, evidence, binding);
    rulesMatched &&= matched;
    if (!allowedIds.has(rule.requirement)) {
      unboundRuleCount += 1;
      continue;
    }
    if (!matched) statuses.set(rule.requirement, 'unmatched');
  }
  const issue_class = rulesMatched ? 'all_rules_matched' : unboundRuleCount ? 'rule_requirement_unbound' : 'observation_rule_mismatch';
  return {
    status: rulesMatched ? 'matched' : 'unmatched',
    issue_class,
    requirements: [...statuses].map(([requirement_id, status]) => ({requirement_id, status})),
    ...(unboundRuleCount ? {unbound_rule_count: unboundRuleCount} : {})
  };
}

export function reviewerOutcomeMatches(assertion, evidence, requirements = [], binding = {}) {
  return reviewerOutcomeDiagnostics(assertion, evidence, requirements, binding).status === 'matched';
}
