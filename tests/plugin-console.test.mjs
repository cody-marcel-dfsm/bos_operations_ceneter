import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { resolveProductSkills, root, transformProductSkillGuidance } from "../scripts/lib/package-model.mjs";

const generatedSkillRoots = [
  `${root}/clients/codex/plugins/bos/skills/bos-plugin-console`,
  `${root}/clients/claude/plugins/bos/skills/bos-plugin-console`,
  `${root}/clients/copilot/products/bos/skills/bos-plugin-console`,
  `${root}/clients/gemini/extensions/bos/skills/bos-plugin-console`
];

test("BOS Plugin Console is an instructions-only in-memory client feature", async () => {
  const sourceRoot = `${root}/source/platform/bos-plugin-console`;
  const sourceEntries = (await readdir(sourceRoot, { withFileTypes: true }))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(sourceEntries, ["SKILL.md", "agents"]);

  const guidance = await readFile(`${sourceRoot}/SKILL.md`, "utf8");
  assert.match(guidance, /structuredContent/);
  assert.match(
    guidance,
    /generic[\s\S]*?Structured output[\s\S]*?unsupported[\s\S]*?presentation/i
  );
  assert.match(
    guidance,
    /safe URLs[\s\S]*?clickable Markdown links[\s\S]*?email[\s\S]*?phone/i
  );
  assert.match(
    guidance,
    /Never show raw JSON[\s\S]*?object[\s\S]*?Structured output/i
  );
  assert.match(
    guidance,
    /actual host control[\s\S]*?button[\s\S]*?toggle/i
  );
  assert.match(guidance, /client's content window/);
  assert.match(guidance, /never create a report file/i);
  assert.match(guidance, /start a local renderer or service/i);
  assert.match(guidance, /never directly inspect the local filesystem/i);
  assert.match(guidance, /no client-side authority[\s\S]*selection/i);
  assert.match(
    guidance,
    /protected resource's OAuth challenge[\s\S]*native login action[\s\S]*preserve the request[\s\S]*resume it afterward/i
  );
  assert.match(
    guidance,
    /HTTP 401[\s\S]*WWW-Authenticate[\s\S]*resource-metadata[\s\S]*native[\s\S]*Sign in/i
  );
  assert.match(
    guidance,
    /Never replace[\s\S]*plugin-install recommendation, external[\s\S]*install page/i
  );
  assert.doesNotMatch(guidance, /list_available_plugins_to_install/i);
  assert.doesNotMatch(guidance, /`request_plugin_install`/i);
  assert.match(
    guidance,
    /Preserve the current\s+request while the customer signs in/i
  );
  assert.match(
    guidance,
    /refresh live discovery of dynamic\s+domain-specific MCP services and tooling[\s\S]*continue this same request/i
  );
  assert.match(
    guidance,
    /manual navigation[\s\S]*Never ask[\s\S]*repeat\s+the\s+prompt/i
  );
  assert.match(guidance, /grant binds exactly[\s\S]*one organization[\s\S]*application[\s\S]*installation[\s\S]*role/i);
  assert.match(guidance, /bos_list_plugin_services[\s\S]*without organization, role, or context/i);
  assert.doesNotMatch(guidance, /client-preferences\.mjs|default_organization_label|context_id/i);
  assert.match(
    guidance,
    /Never[\s\S]*prior-task response[\s\S]*typed-settings cache[\s\S]*multi-organization summary/i
  );
});

test("Plugin Console uses only the server-scoped grant", async () => {
  const guidance = await readFile(
    `${root}/source/platform/bos-plugin-console/SKILL.md`,
    "utf8"
  );
  assert.match(
    guidance,
    /OAuth grant binds exactly[\s\S]*one organization[\s\S]*application[\s\S]*installation[\s\S]*role/i
  );
  assert.match(
    guidance,
    /server derives the exact inventory from the validated grant/i
  );
  assert.doesNotMatch(guidance, /explicitly named organization|selected organization|default role|context_id/i);
});

test("BOS distributes the in-memory Plugin Console to every supported client", async () => {
  const manifest = JSON.parse(await readFile(`${root}/products/bos/product.json`, "utf8"));
  assert(manifest.includes.includes("platform/bos-plugin-console"));
  const canonicalGuidance = await readFile(
    `${root}/source/platform/bos-plugin-console/SKILL.md`,
    "utf8"
  );

  const skills = await resolveProductSkills(manifest);
  assert(skills.some((skill) => skill.name === "bos-plugin-console"));

  for (const skillRoot of generatedSkillRoots) {
    await access(`${skillRoot}/SKILL.md`);
    await access(`${skillRoot}/agents/openai.yaml`);
    assert.equal(await readFile(`${skillRoot}/SKILL.md`, "utf8"),
      transformProductSkillGuidance(manifest, "bos-plugin-console", canonicalGuidance));
    const files = await listRelativeFiles(skillRoot);
    assert.deepEqual(files, ["SKILL.md", "agents/openai.yaml"]);
  }
});

test("generated Plugin Consoles preserve resource-level OAuth presentation", async () => {
  for (const generatedSkillRoot of generatedSkillRoots) {
    const guidance = await readFile(`${generatedSkillRoot}/SKILL.md`, "utf8");
    assert.match(
      guidance,
      /HTTP 401[\s\S]*WWW-Authenticate[\s\S]*resource-metadata[\s\S]*native[\s\S]*Sign in/i,
      `${generatedSkillRoot} must preserve native authentication presentation`
    );
    assert.doesNotMatch(guidance, /list_available_plugins_to_install/i);
    assert.doesNotMatch(guidance, /`request_plugin_install`/i);
  }
});

test("broad BOS server-settings requests stay in the in-memory console", async () => {
  const consoleGuidance = await readFile(
    `${root}/source/platform/bos-plugin-console/SKILL.md`,
    "utf8"
  );
  const settingsGuidance = await readFile(
    `${root}/source/platform/bos-plugin-settings/SKILL.md`,
    "utf8"
  );

  assert.match(consoleGuidance, /show the server settings for the BOS plugins/i);
  assert.match(consoleGuidance, /Do not invoke a product customer\s+initializer/i);
  assert.match(settingsGuidance, /## Route before preflight/);
  assert.match(
    settingsGuidance,
    /broad request[\s\S]*belongs to `bos-plugin-console`[\s\S]*before product customer initialization/i
  );
  assert.match(
    consoleGuidance,
    /all settings of one unambiguously named plugin[\s\S]*typed settings workflow/i
  );

  for (const skillRoot of [
    `${root}/clients/codex/plugins/education-center/skills/bos-plugin-settings`,
    `${root}/clients/claude/plugins/education-center/skills/bos-plugin-settings`,
    `${root}/clients/copilot/products/education-center/skills/bos-plugin-settings`,
    `${root}/clients/gemini/extensions/education-center/skills/bos-plugin-settings`
  ]) {
    const guidance = await readFile(`${skillRoot}/SKILL.md`, "utf8");
    assert.match(guidance, /## Route before preflight/);
    assert.doesNotMatch(guidance, /## Product initialization preflight/);
    assert.doesNotMatch(guidance, /config\/customer-settings\.json/);
  }
});

async function listRelativeFiles(rootPath, prefix = "") {
  const files = [];
  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listRelativeFiles(`${rootPath}/${entry.name}`, relative));
    } else {
      files.push(relative);
    }
  }
  return files.sort();
}
