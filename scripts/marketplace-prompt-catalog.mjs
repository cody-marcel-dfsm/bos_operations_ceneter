import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function loadPromptCatalog(root, product) {
  if (!/^[a-z][a-z0-9-]+$/.test(product)) throw new Error('Invalid product');
  const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const manifest = await json(`products/${product}/product.json`);
  const submission = await json(`products/${product}/${manifest.openai_submission.import_file}`);
  const policy = await json(`products/${product}/openai/acceptance-policy.json`);
  const plugin = await json(`clients/codex/plugins/${product}/.codex-plugin/plugin.json`);
  if (JSON.stringify(manifest.default_prompts) !== JSON.stringify(plugin.interface.defaultPrompt)) {
    throw new Error('Generated starter prompts differ from canonical configuration; regenerate packages');
  }
  if (manifest.long_description !== submission.app_info.description || manifest.long_description !== plugin.description) {
    throw new Error('Generated/submitted description differs from canonical configuration');
  }
  if (manifest.default_prompts.length !== 3) throw new Error('Expected three configured starters');
  const cases = [
    ...manifest.default_prompts.map((prompt, i) => ({id: `starter-${i + 1}`, kind: 'starter', prompt, expected: 'Fulfill the configured prompt using current discovered contracts; report genuine missing prerequisites.'})),
    ...submission.test_cases.map((item, i) => ({id: `positive-${i + 1}`, kind: 'positive', prompt: item.user_prompt, expected: item.expected_output, expected_operation: item.tools_triggered})),
    ...submission.negative_test_cases.map((item, i) => ({id: `negative-${i + 1}`, kind: 'negative', prompt: item.user_prompt, expected: item.expected_output}))
  ];
  for (const item of cases) {
    if (!item.prompt?.trim() || !item.expected?.trim()) throw new Error('Empty configured case');
    if (!policy.cases[item.id]) throw new Error('Missing configured case policy');
    Object.assign(item, policy.cases[item.id]);
  }
  const catalog = {product, version: manifest.version, description: manifest.long_description, cases,
    ...(policy.execution_profile ? {execution_profile:policy.execution_profile} : {})};
  return {...catalog, configuration_sha256: digest(catalog)};
}
