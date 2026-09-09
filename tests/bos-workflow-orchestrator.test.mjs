import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolveProductSkills,
  root,
  transformProductSkillGuidance
} from "../scripts/lib/package-model.mjs";

const generatedSkillRoots = [
  `${root}/clients/codex/plugins/bos/skills/bos-workflow-orchestrator`,
  `${root}/clients/claude/plugins/bos/skills/bos-workflow-orchestrator`,
  `${root}/clients/copilot/products/bos/skills/bos-workflow-orchestrator`,
  `${root}/clients/gemini/extensions/bos/skills/bos-workflow-orchestrator`
];

test("BOS exposes one application-neutral deterministic workflow entrypoint", async () => {
  const product = JSON.parse(await readFile(`${root}/products/bos/product.json`, "utf8"));
  assert(product.includes.includes("platform/bos-workflow-orchestrator"));

  const skills = await resolveProductSkills(product);
  assert(skills.some(({ name }) => name === "bos-workflow-orchestrator"));

  const guidance = await readFile(
    `${root}/source/platform/bos-workflow-orchestrator/SKILL.md`,
    "utf8"
  );
  assert.match(guidance, /deterministic workflow/i);
  assert.match(guidance, /federated (?:agentic )?service mesh/i);
  assert.match(guidance, /bos_get_context/);
  assert.match(guidance, /bos_list_plugin_services/);
  assert.match(guidance, /bos_get_plugin_settings/);
  assert.match(guidance, /bos_set_plugin_enabled/);
  assert.match(guidance, /bos_begin_plugin_service_connection/);
  assert.match(guidance, /bos_resume_operation/);
  assert.match(guidance, /owning product(?:'s)? MCP/i);
  assert.match(guidance, /explicit user approval/i);
  assert.match(guidance, /evidence/i);
  assert.doesNotMatch(guidance, /Bright Horizons|Northstar Coding Academy/);

  for (const generatedRoot of generatedSkillRoots) {
    await access(`${generatedRoot}/SKILL.md`);
    await access(`${generatedRoot}/agents/openai.yaml`);
    assert.equal(
      await readFile(`${generatedRoot}/SKILL.md`, "utf8"),
      transformProductSkillGuidance(product, "bos-workflow-orchestrator", guidance)
    );
  }
});

