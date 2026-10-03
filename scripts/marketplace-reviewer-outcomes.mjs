import {isDeepStrictEqual} from 'node:util';

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
function responseBody(evidence, selector) {
  if (!selector || Object.keys(selector).sort().join(',') !== 'operation,transport' || typeof selector.operation !== 'string' || !selector.operation || !transports.has(selector.transport)) return undefined;
  const matches = (evidence.responses ?? []).filter(row => row.operation === selector.operation && row.transport === selector.transport && row.successful === true);
  return matches.length === 1 ? matches[0].body : undefined;
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
  const base = rule[prefix + 'response'] ? responseBody(evidence, rule[prefix + 'response']) : rule[prefix + 'evidence'] === 'answer' ? evidence.answer : rule[prefix + 'evidence'] === 'effects' ? {prohibited_effects: evidence.prohibited_effects} : undefined;
  return projected(at(base, rule[prefix + 'path']), rule[prefix + 'project_paths']);
}
function selectedLocations(evidence, rule, other = false) {
  const prefix = other ? 'other_' : '', selector = rule[prefix + 'response'];
  if (!selector) return [];
  const matches = (evidence.responses ?? []).map((row, index) => ({row, index})).filter(({row}) => row.operation === selector.operation && row.transport === selector.transport && row.successful === true);
  if (matches.length !== 1) return [];
  const {row, index} = matches[0], path = rule[prefix + 'path'];
  const value = at(row.body, path);
  if (!Array.isArray(value)) return [];
  const origin = `/responses/${index}/body${path}`;
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
  if (typeof value !== 'string') return NaN;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return NaN;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return NaN;
  return Date.parse(value);
}
export function reviewerOutcomeMatches(assertion, evidence, requirements = [], binding = {}) {
  if (Object.keys(assertion ?? {}).sort().join(',') !== 'case_id,product,rules,schema' || assertion?.schema !== 'marketplace-case-assertions/v1' || !binding.product || !binding.case_id || assertion.product !== binding.product || assertion.case_id !== binding.case_id) return false;
  const rules = assertion.rules;
  const ruleKeys = new Set(['requirement', 'operator', 'response', 'path', 'project_paths', 'value', 'evidence', 'other_response', 'other_path', 'other_project_paths', 'other_evidence', 'distinct_by_path']);
  if (!Array.isArray(rules) || !rules.every(rule => rule && typeof rule === 'object' && !Array.isArray(rule) && Object.keys(rule).every(key => ruleKeys.has(key)))) return false;
  if (!Array.isArray(rules) || !rules.length || rules.length > 64 || !rules.some(rule => rule.response && rule.operator === 'equals' && rule.value !== undefined && rule.value !== null)) return false;
  if (!requirements.every(required => rules.some(rule => rule.requirement === required.id && rule.operator === required.operator && (required.minimum === undefined || (typeof rule.value === 'number' && rule.value >= required.minimum)) && (required.operator !== 'timestamp_age' || (rule.value?.maximum_age_ms <= required.maximum_age_ms && rule.value?.future_skew_ms <= required.future_skew_ms))))) return false;
  return rules.every(rule => {
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
      if (!Number.isFinite(clock) || !limit || !Number.isInteger(limit.maximum_age_ms) || limit.maximum_age_ms < 1 || limit.maximum_age_ms > 604800000 || !Number.isInteger(limit.future_skew_ms) || limit.future_skew_ms < 0 || limit.future_skew_ms > 300000) return false;
      const timestamps = Array.isArray(value) ? value : [value];
      return timestamps.length > 0 && timestamps.length <= 1000 && timestamps.every(row => Number.isFinite(timestamp(row)) && clock - timestamp(row) <= limit.maximum_age_ms && timestamp(row) - clock <= limit.future_skew_ms);
    }
    return false;
  });
}
