import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { resolveProductSkills, root } from "../scripts/lib/package-model.mjs";

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
  assert.match(guidance, /client's content window/);
  assert.match(guidance, /never create a report file/i);
  assert.match(guidance, /start a local process or service/i);
  assert.match(guidance, /never inspect the local filesystem/i);
  assert.match(guidance, /explicitly named[\s\S]*validated shared[\s\S]*default organization/i);
  assert.match(guidance, /Never enumerate service data for every[\s\S]*organization by default/i);
});

test("BOS distributes the in-memory Plugin Console to every supported client", async () => {
  const manifest = JSON.parse(await readFile(`${root}/products/bos/product.json`, "utf8"));
  assert(manifest.includes.includes("platform/bos-plugin-console"));

  const skills = await resolveProductSkills(manifest);
  assert(skills.some((skill) => skill.name === "bos-plugin-console"));

  for (const skillRoot of generatedSkillRoots) {
    await access(`${skillRoot}/SKILL.md`);
    await access(`${skillRoot}/agents/openai.yaml`);
    const files = await listRelativeFiles(skillRoot);
    assert.deepEqual(files, ["SKILL.md", "agents/openai.yaml"]);
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
