import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveProductSkills, root } from "../scripts/lib/package-model.mjs";
import {
  readClientPreferences,
  setDefaultOrganizationPreference
} from "../source/platform/bos-mcp-client/scripts/client-preferences.mjs";

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
  assert.match(guidance, /sole local selection operation/i);
  assert.match(guidance, /explicitly named[\s\S]*default_organization_label/i);
  assert.match(guidance, /Never enumerate service data for every[\s\S]*organization by default/i);
  assert.match(
    guidance,
    /client-preferences\.mjs read[\s\S]*all current returned organization labels[\s\S]*state: current/i
  );
  assert.match(
    guidance,
    /missing, stale,[\s\S]*ambiguous[\s\S]*configuration_required[\s\S]*stop/i
  );
  assert.match(
    guidance,
    /Never[\s\S]*prior-task response[\s\S]*typed-settings cache[\s\S]*multi-organization summary/i
  );
});

test("unqualified Plugin Console requests use one validated default organization", async () => {
  const guidance = await readFile(
    `${root}/source/platform/bos-plugin-console/SKILL.md`,
    "utf8"
  );
  const contextOrganizations = [
    "Primary Center",
    "Secondary Center",
    "Acceptance Test Organization"
  ];
  const preferencesRoot = await mkdtemp(join(tmpdir(), "bos-console-preferences-"));
  await setDefaultOrganizationPreference({
    organization_label: "Primary Center",
    available_organization_labels: contextOrganizations
  }, { preferencesRoot, now: "2026-08-31T22:50:00.000Z" });

  assert.deepEqual(
    await readClientPreferences({
      available_organization_labels: contextOrganizations
    }, { preferencesRoot }),
    { state: "current", default_organization_label: "Primary Center" }
  );
  assert.match(
    guidance,
    /Resolve exactly one organization[\s\S]*before any console[\s\S]*data call/i
  );
  assert.match(
    guidance,
    /Within the selected organization[\s\S]*bos_list_plugin_services/i
  );
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
    assert.equal(await readFile(`${skillRoot}/SKILL.md`, "utf8"), canonicalGuidance);
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
