import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolveProductSkills,
  root,
  transformProductSkillGuidance
} from "../scripts/lib/package-model.mjs";

const generatedRoots = [
  `${root}/clients/codex/plugins/bos/skills`,
  `${root}/clients/claude/plugins/bos/skills`,
  `${root}/clients/copilot/products/bos/skills`,
  `${root}/clients/gemini/extensions/bos/skills`
];

test("BOS composes journey orchestration, discovery, cache maintenance, and visual output", async () => {
  const product = JSON.parse(await readFile(`${root}/products/bos/product.json`, "utf8"));
  for (const include of [
    "platform/bos-workflow-orchestrator",
    "platform/bos-app-discovery",
    "platform/bos-mcp-client",
    "platform/bos-cache-maintenance",
    "platform/bos-visual-output"
  ]) {
    assert(product.includes.includes(include), include);
  }
  const skills = await resolveProductSkills(product);
  const orchestrator = skills.find(({ name }) => name === "bos-workflow-orchestrator");
  const mcpClient = skills.find(({ name }) => name === "bos-mcp-client");
  assert(orchestrator);
  assert(mcpClient);

  const canonicalOrchestrator = await readFile(`${orchestrator.sourcePath}/SKILL.md`, "utf8");
  const canonicalCache = await readFile(
    `${mcpClient.sourcePath}/scripts/journey-contract-cache.mjs`,
    "utf8"
  );
  for (const generatedRoot of generatedRoots) {
    assert.equal(
      await readFile(`${generatedRoot}/bos-workflow-orchestrator/SKILL.md`, "utf8"),
      transformProductSkillGuidance(product, "bos-workflow-orchestrator", canonicalOrchestrator)
    );
    assert.equal(
      await readFile(`${generatedRoot}/bos-mcp-client/scripts/journey-contract-cache.mjs`, "utf8"),
      canonicalCache
    );
    for (const script of [
      "bosl-authoring.mjs",
      "journey-presentation.mjs",
      "journey-runtime-client.mjs"
    ]) {
      assert.equal(
        await readFile(`${generatedRoot}/bos-workflow-orchestrator/scripts/${script}`, "utf8"),
        await readFile(`${orchestrator.sourcePath}/scripts/${script}`, "utf8")
      );
    }
    for (const reference of [
      "bosl-authoring.md",
      "journey-lifecycle.md",
      "client-instructions.md",
      "canonical-walkthrough.md"
    ]) {
      assert.equal(
        await readFile(`${generatedRoot}/bos-workflow-orchestrator/references/${reference}`, "utf8"),
        await readFile(`${orchestrator.sourcePath}/references/${reference}`, "utf8")
      );
    }
  }
});

test("generated journey guidance creates no second connection or client-owned state", async () => {
  for (const generatedRoot of generatedRoots) {
    const guidance = await readFile(
      `${generatedRoot}/bos-workflow-orchestrator/references/journey-lifecycle.md`,
      "utf8"
    );
    assert.match(guidance, /sole exact returned `state` action/i);
    assert.match(guidance, /never sends or stores an execution/i);
    assert.doesNotMatch(guidance, /client[_ -]id|retry[_ -]key|construct.*journeys\//i);
  }
});
