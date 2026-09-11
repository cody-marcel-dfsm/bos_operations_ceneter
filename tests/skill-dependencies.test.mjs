import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSkillDependencies } from '../scripts/lib/skill-dependencies.mjs';

const skill = (name, text = '') => ({ name, include: `platform/${name}`, files: [{ path: `source/platform/${name}/SKILL.md`, text }] });
const product = (name, includes, dependencies = [], release_status = 'active', clients = ['claude', 'codex']) => ({ name, includes: includes.map(n => `platform/${n}`), dependencies, release_status, clients });

test('a missing required skill fails even when its source and a disabled product exist', () => {
  const skills = [skill('settings', 'Invoke `initializer`.'), skill('initializer')];
  const failures = validateSkillDependencies([product('bos', ['settings']), product('future', ['initializer'], [], 'disabled')], skills);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /bos.*settings.*initializer/);
});

test('available same-product and transitive dependency skills satisfy references', () => {
  const skills = [skill('lead', 'Use `journey` and `context`.'), skill('journey', 'Use `context`.'), skill('context')];
  assert.deepEqual(validateSkillDependencies([product('bos', ['context']), product('middle', [], ['bos']), product('education', ['lead', 'journey'], ['middle'])], skills), []);
});

test('product dependencies must be active, client-compatible and acyclic', () => {
  assert.match(validateSkillDependencies([product('a', [], ['absent'])], [])[0], /unknown dependency/);
  assert.match(validateSkillDependencies([product('a', [], ['b']), product('b', [], [], 'disabled')], [])[0], /disabled dependency/);
  assert.match(validateSkillDependencies([product('a', [], ['b']), product('b', [], [], 'active', ['codex'])], [])[0], /claude/);
  assert.match(validateSkillDependencies([product('a', [], ['b']), product('b', [], ['a'])], []).join('\n'), /cycle/);
});

test('reference documents and relative sibling skill paths are checked; examples do not create requirements', () => {
  const lead = skill('lead');
  lead.files.push({ path: 'source/platform/lead/references/read.md', text: 'Read `../context/scripts/read.mjs`.\n```json\n{"example": "`journey`"}\n```' });
  const skills = [lead, skill('context'), skill('journey')];
  assert.deepEqual(validateSkillDependencies([product('a', ['lead', 'context'])], skills), []);
  assert.match(validateSkillDependencies([product('a', ['lead'])], skills)[0], /context/);
});


test('active repository products satisfy workflow dependencies and standalone BOS initialization', async () => {
  const { listProducts, resolveProductSkills } = await import('../scripts/lib/package-model.mjs');
  const { checkSkillDependencies } = await import('../scripts/lib/skill-dependencies.mjs');
  const products = (await listProducts()).map(p => p.manifest);
  assert.deepEqual(await checkSkillDependencies(products), []);
  const bos = products.find(p => p.name === 'bos');
  assert((await resolveProductSkills(bos)).some(s => s.name === 'bos-plugin-settings-initialization'));
  assert.deepEqual(bos.dependencies, []);
  const broken = structuredClone(products);
  broken.find(p => p.name === 'bos').includes = bos.includes.filter(i => !i.endsWith('/bos-plugin-settings-initialization'));
  assert.match((await checkSkillDependencies(broken)).join('\n'), /bos.*unavailable skill bos-plugin-settings-initialization/);
  const education = broken.find(p => p.name === 'education-center');
  education.includes = education.includes.filter(i => !i.endsWith('/my-crm-customer-journey'));
  assert.match((await checkSkillDependencies(broken)).join('\n'), /education-center.*unavailable skill my-crm-customer-journey/);
});
