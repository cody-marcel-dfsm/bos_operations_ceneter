import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const guidance = await readFile(new URL('../source/platform/bos-mcp-client/references/identity-context.md', import.meta.url), 'utf8');

test('existing named operational MCP compatibility remains usable without host HTTPS', () => {
  assert.match(guidance, /Existing operational MCP tools remain compatibility surfaces/);
  assert.match(guidance, /fresh `bos_list_context_tools` response[\s\S]*`tools`[\s\S]*`name`[\s\S]*`inputSchema`/);
  assert.match(guidance, /same selected `context_handle`[\s\S]*`bos_execute`/);
  assert.match(guidance, /Do not report `host_capability_unavailable`[\s\S]*native compatibility tool/);
});

test('Describe-only semantic operations cannot be invented as native tools', () => {
  assert.match(guidance, /Never convert a Describe\s+operation key into `tool_name`/);
  assert.match(guidance, /No similar name, cached descriptor, or Describe contract establishes a native tool/);
  assert.match(guidance, /For a discovered deterministic HTTPS operation without a suitable native\s+compatibility tool/);
  assert.match(guidance, /credentials inside the host; construct no alternate transport/);
});

test('existing operational compatibility preserves scoped exceptions and authority checks', () => {
  for (const name of ['feedback.recommendations.query', 'journeys.notifications.read', 'journeys.state.read']) {
    assert(guidance.includes('`' + name + '`'));
  }
  assert.match(guidance, /new semantic business-read exceptions remain exactly/);
  assert.match(guidance, /verify the returned context before using its result/);
  assert.match(guidance, /A denial or missing operation\s+never permits another role or organization as a workaround/);
  assert.match(guidance, /The server reauthorizes every operation/);
});
