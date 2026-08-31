import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  listProducts,
  resolveProductSkills,
  root,
  validateProduct
} from "../scripts/lib/package-model.mjs";

test("BOS and its subservices compose plugin settings through one connection", async () => {
  const products = await listProducts();
  for (const { manifest } of products) {
    assert.deepEqual(validateProduct(manifest), []);
    assert(
      manifest.includes.includes("platform/bos-plugin-settings"),
      `${manifest.name} must include bos-plugin-settings`
    );
    if (!manifest.plugin_settings_initializer) continue;
    assert(
      manifest.includes.includes("platform/bos-plugin-settings-initialization"),
      `${manifest.name} must include bos-plugin-settings-initialization`
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
  assert.match(initialization, /client-preferences\.mjs/i);
  assert.match(initialization, /Default BOS organization/i);
  assert.match(initialization, /exactly one organization[\s\S]*commit that sole label/i);
  assert.match(initialization, /configuration_required[\s\S]*no organization-scoped settings call/i);
  assert.match(
    initialization,
    /selected organization[\s\S]*unique[\s\S]*default interactive role/i
  );
  assert.match(initialization, /bos_list_plugin_services/);
  assert.match(initialization, /every server-returned plugin-service row/i);
  assert.match(initialization, /never repeat the call for[\s\S]*other organizations/i);
  assert.match(initialization, /Preserve `connected` rows[\s\S]*never reconnect/i);
  assert.match(initialization, /`not_required` rows as ready/i);
  assert.match(initialization, /exactly one \*\*Connect\*\* action/i);
  assert.match(initialization, /bos_begin_plugin_service_connection/);
  assert.match(initialization, /bos_get_authorization_status/);
  assert.match(initialization, /Never silently enable a plugin/i);
  assert.match(initialization, /Poll `bos_get_authorization_status`[\s\S]*refresh context and tools[\s\S]*bos_list_plugin_services/i);
  assert.match(initialization, /Walk unresolved services one at a time/i);
  assert.match(initialization, /Return `connection_required`[\s\S]*preserve[\s\S]*pending request/i);
  assert.match(initialization, /no actionable connection row[\s\S]*receipt/i);
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
    await access(`${clientRoot}/bos-mcp-client/scripts/client-preferences.mjs`);
    await access(
      `${clientRoot}/bos-mcp-client/references/plugin-settings-cache-protocol.md`
    );
  }
});
