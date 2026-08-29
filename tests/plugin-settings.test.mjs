import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  listProducts,
  resolveProductSkills,
  root,
  validateProduct
} from "../scripts/lib/package-model.mjs";

test("runtime products compose generic plugin settings operation and initialization", async () => {
  const products = await listProducts();
  for (const { manifest } of products.filter(({ manifest }) => manifest.runtime)) {
    assert.deepEqual(validateProduct(manifest), []);
    assert(
      manifest.includes.includes("platform/bos-plugin-settings"),
      `${manifest.name} must include bos-plugin-settings`
    );
    assert(
      manifest.includes.includes("platform/bos-plugin-settings-initialization"),
      `${manifest.name} must include bos-plugin-settings-initialization`
    );
    assert(
      manifest.includes.includes("platform/submit-feedback"),
      `${manifest.name} must include submit-feedback`
    );
    assert.equal(
      manifest.plugin_settings_initializer,
      "bos-plugin-settings-initialization"
    );
  }
});

test("plugin settings skills encode cache-first reads and delegated resilient mutations", async () => {
  const operation = await readFile(
    `${root}/source/platform/bos-plugin-settings/SKILL.md`,
    "utf8"
  );
  const operationContract = await readFile(
    `${root}/source/platform/bos-plugin-settings/references/settings-operation-contract.md`,
    "utf8"
  );
  const initialization = await readFile(
    `${root}/source/platform/bos-plugin-settings-initialization/SKILL.md`,
    "utf8"
  );
  assert.match(operation, /cache hit[\s\S]*confirmed snapshot/i);
  assert.match(operation, /bos_get_plugin_settings/);
  assert.match(operation, /parallel settings mutation worker/i);
  assert.match(operation, /bos_prepare_plugin_settings/);
  assert.match(operation, /bos_apply_plugin_settings/);
  assert.match(operation, /status: committed/);
  assert.match(operation, /submit-feedback/);
  assert.match(operationContract, /five total apply attempts/i);
  assert.match(operationContract, /1, 2, 4, and 8 seconds/i);
  assert.match(operationContract, /reconcile an uncertain mutation before replay/i);
  assert.match(initialization, /after host-managed BOS authentication/i);
  assert.match(initialization, /customer\/client-settings initializer/i);
  assert.match(initialization, /bos_get_plugin_settings_initialization/);
  assert.match(initialization, /bounded parallel research workers/i);
  assert.match(initialization, /Business Hours prioritizes the[\s\S]*client website/i);
  assert.match(initialization, /Persist no recommendation\s+before confirmation/i);
});

test("active generated clients contain equivalent plugin settings skills and helper", async () => {
  const education = (await listProducts()).find(
    ({ manifest }) => manifest.name === "education-center"
  )?.manifest;
  assert(education);
  const skills = await resolveProductSkills(education);
  assert(skills.some(({ name }) => name === "bos-plugin-settings"));
  assert(skills.some(({ name }) => name === "bos-plugin-settings-initialization"));

  for (const clientRoot of [
    `${root}/clients/codex/plugins/education-center/skills`,
    `${root}/clients/claude/plugins/education-center/skills`,
    `${root}/clients/copilot/products/education-center/skills`,
    `${root}/clients/gemini/extensions/education-center/skills`
  ]) {
    await access(`${clientRoot}/bos-plugin-settings/SKILL.md`);
    await access(`${clientRoot}/bos-plugin-settings-initialization/SKILL.md`);
    await access(`${clientRoot}/bos-mcp-client/scripts/plugin-settings-cache.mjs`);
    await access(
      `${clientRoot}/bos-mcp-client/references/plugin-settings-cache-protocol.md`
    );
  }
});
