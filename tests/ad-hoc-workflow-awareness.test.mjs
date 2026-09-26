import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {readZipEntries} from "../scripts/lib/deterministic-zip.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const text = (relative) => readFile(path.join(root, relative), "utf8");
const json = async (relative) => JSON.parse(await text(relative));

test("product descriptions advertise governed ad hoc dynamic workflows", async () => {
  const bos = await json("products/bos/product.json");
  const education = await json("products/education-center/product.json");
  assert.match(`${bos.description} ${bos.long_description}`, /ad hoc dynamic workflow/i);
  assert.match(education.long_description, /ad hoc dynamic workflow/i);
  assert.match(education.long_description, /composition and control are owned by BOS/i);
  assert.doesNotMatch(bos.long_description, /can compose[\s\S]*then run/i);
  assert.match(bos.long_description, /when the required authoring and runtime contracts are available/i);
});

test("complete fixed workflows take precedence over ad hoc composition in every client", async () => {
  const files = [
    "source/platform/bos-workflow-orchestrator/SKILL.md",
    "source/verticals/education-center/education-center-service-routing/SKILL.md",
    "clients/codex/plugins/bos/skills/bos-workflow-orchestrator/SKILL.md",
    "clients/claude/plugins/bos/skills/bos-workflow-orchestrator/SKILL.md",
    "clients/copilot/products/bos/skills/bos-workflow-orchestrator/SKILL.md",
    "clients/gemini/extensions/bos/skills/bos-workflow-orchestrator/SKILL.md",
    "clients/codex/plugins/education-center/skills/education-center-service-routing/SKILL.md",
    "clients/claude/plugins/education-center/skills/education-center-service-routing/SKILL.md",
    "clients/copilot/products/education-center/skills/education-center-service-routing/SKILL.md",
    "clients/copilot/skills/education-center-service-routing/SKILL.md",
    "clients/gemini/extensions/education-center/skills/education-center-service-routing/SKILL.md"
  ];
  for (const file of files) {
    const guidance = await text(file);
    assert.match(guidance, /first (?:select|use) a complete applicable focused[\s\S]*workflow/i, file);
    assert.match(guidance, /select ad hoc composition only when no complete fixed\s+workflow[\s\S]*or the user explicitly requests custom\s+composition/i, file);
  }
});

test("canonical skills route multi-step objectives into BOS-owned composition", async () => {
  const orchestrator = await text("source/platform/bos-workflow-orchestrator/SKILL.md");
  const discovery = await text("source/platform/bos-app-discovery/SKILL.md");
  const education = await text("source/verticals/education-center/education-center-service-routing/SKILL.md");
  assert.match(orchestrator, /user does not need to say[\s\S]*BOSL/i);
  assert.match(discovery, /service\.describe\.journey[\s\S]*composition source/i);
  assert.match(discovery, /service\.describe\.behavior[\s\S]*never[\s\S]*executable node/i);
  assert.match(education, /multiple dependent\s+domain steps/i);
  assert.match(education, /BOS owns[\s\S]*ad hoc BOSL\s+composition/i);
});

test("generated client skills preserve ad hoc workflow awareness", async () => {
  const files = [
    "clients/codex/plugins/bos/skills/bos-workflow-orchestrator/SKILL.md",
    "clients/codex/plugins/bos/skills/bos-app-discovery/SKILL.md",
    "clients/claude/plugins/bos/skills/bos-workflow-orchestrator/SKILL.md",
    "clients/claude/plugins/bos/skills/bos-app-discovery/SKILL.md",
    "clients/copilot/products/bos/skills/bos-workflow-orchestrator/SKILL.md",
    "clients/copilot/products/bos/skills/bos-app-discovery/SKILL.md",
    "clients/gemini/extensions/bos/skills/bos-workflow-orchestrator/SKILL.md",
    "clients/gemini/extensions/bos/skills/bos-app-discovery/SKILL.md",
    "clients/codex/plugins/education-center/skills/education-center-service-routing/SKILL.md",
    "clients/claude/plugins/education-center/skills/education-center-service-routing/SKILL.md",
    "clients/copilot/products/education-center/skills/education-center-service-routing/SKILL.md",
    "clients/copilot/skills/education-center-service-routing/SKILL.md",
    "clients/gemini/extensions/education-center/skills/education-center-service-routing/SKILL.md"
  ];
  for (const file of files) {
    assert.match(await text(file), /ad hoc/i, file);
  }

  const archives = [
    ["products/bos/openai/bos-skills.zip", ["bos-workflow-orchestrator/SKILL.md", "bos-app-discovery/SKILL.md"]],
    ["products/education-center/openai/education-center-skills.zip", ["education-center-service-routing/SKILL.md"]]
  ];
  for (const [archivePath, entryPaths] of archives) {
    const entries = readZipEntries(await readFile(path.join(root, archivePath)));
    for (const entryPath of entryPaths) {
      const entry = entries.get(entryPath);
      assert.ok(entry, `${archivePath}:${entryPath}`);
      assert.match(entry.content.toString("utf8"), /ad hoc/i, `${archivePath}:${entryPath}`);
    }
  }
});
