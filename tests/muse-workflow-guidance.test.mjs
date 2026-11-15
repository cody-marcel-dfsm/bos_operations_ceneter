import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {root} from '../scripts/lib/package-model.mjs';
const read = path => readFile(`${root}/${path}`, 'utf8');
const section = (text, title) => text.split(title)[1]?.split('\n## ')[0];
const workflow = text => {
  for (const pattern of [/current host supports/, /Mermaid fallback/, /authorized.*source/, /partial-evidence/, /Graph, always visible/, /BOSL source beside/, /same account/, /Never invent/, /one transaction/, /checksum/, /attempt count, charge count/, /proposed, not/, /Never encode credentials/, /toy\/demo/]) assert.match(text, pattern);
};
const routing = text => {
  assert.match(text, /Verify the current identity/);
  assert.match(text, /customer's configured feedback routing/);
  assert.match(text, /ISM maintainer.*demo/is);
  assert.match(text, /only when current\s+authenticated discovery or verified customer configuration/is);
  assert.match(text, /preserve a draft/i);
  assert.match(text, /Never infer target authority/);
  assert.doesNotMatch(text, /All feedback.*ISM queue/is);
};
test('workflow guidance exposes evidence, host limits, and honest financial execution states', async () => {
  workflow(section(await read('source/platform/bos-visual-output/SKILL.md'), '## Workflow execution display'));
  const graph = await read('source/platform/bos-visual-output/references/graph-rendering.md');
  assert.match(graph, /attempt count and charge count/);
  assert.match(graph, /Disclose unavailable\s+persistence or layout/);
});
test('feedback keeps tenant routing and uncertain receipt reconciliation within discovered authority', async () => {
  const text = await read('source/platform/submit-feedback/SKILL.md');
  routing(section(text, '### File in the scope that owns the broken surface'));
  assert.match(text, /currently discovered read or status capabilities/);
  assert.match(text, /absent list result proves no safe replay/);
  assert.match(text, /never automatically re-submit/);
  assert.doesNotMatch(text.split('A client-side parse failure')[1]?.split('4. On success')[0], /`bos_list_feedback`/);
  assert.match(text, /numbered acceptance\s+criteria/);
  assert.match(text, /new defect.*own item/is);
});
test('all five generated host packages retain exact workflow and scoped-feedback guidance', async () => {
  const visual = section(await read('source/platform/bos-visual-output/SKILL.md'), '## Workflow execution display');
  const feedback = section(await read('source/platform/submit-feedback/SKILL.md'), '### File in the scope that owns the broken surface');
  const graph = await read('source/platform/bos-visual-output/references/graph-rendering.md');
  for (const prefix of ['clients/claude/plugins', 'clients/codex/plugins', 'clients/copilot/products', 'clients/gemini/extensions', 'clients/muse/plugins']) {
    const v = section(await read(`${prefix}/bos/skills/bos-visual-output/SKILL.md`), '## Workflow execution display');
    assert.equal(v, visual); workflow(v);
    assert.equal(await read(`${prefix}/bos/skills/bos-visual-output/references/graph-rendering.md`), graph);
    for (const product of ['bos', 'education-center']) {
      const f = section(await read(`${prefix}/${product}/skills/submit-feedback/SKILL.md`), '### File in the scope that owns the broken surface');
      assert.equal(f, feedback); routing(f);
    }
  }
});
