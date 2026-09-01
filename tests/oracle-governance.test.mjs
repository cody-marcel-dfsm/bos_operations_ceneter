import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("every repository implementation requires a fresh Oracle verdict", () => {
  const agents = read("AGENTS.md");
  const implementation = read(".agents/skills/operations-center-implementation/SKILL.md");
  const review = read(".agents/skills/operations-center-review/SKILL.md");
  const oracle = read(".agents/skills/oracle/SKILL.md");

  assert.match(agents, /Every implementation, fix, refactor/i);
  assert.match(agents, /literal verdict\s+`APPROVED`/i);
  assert.match(implementation, /complete actual diff and validation evidence/i);
  assert.match(implementation, /fresh\s+review after each correction/i);
  assert.match(review, /End with exactly one verdict: `APPROVED` or `REJECTED`/i);
  assert.match(oracle, /`REJECTED` blocks completion/i);
});

test("Oracle owns indexed active and resolved issue history", () => {
  const oracle = read(".agents/skills/oracle/SKILL.md");
  const tracker = read("Vault/docs/issues/ISSUE_HISTORY.md");
  const conclusion = read("Vault/docs/issues/conclusions/ISSUE_0001_CONCLUSION.md");
  const schema = read("Vault/schemas/ISSUE_HISTORY_TEMPLATE.md");

  assert.match(oracle, /Issue-history ownership/i);
  assert.match(oracle, /tools\/vault_index\.py query/i);
  assert.match(tracker, /Issue #0001/i);
  assert.match(conclusion, /Root cause/i);
  assert.match(conclusion, /Prevention/i);
  assert.match(schema, /Preserve failed attempts/i);
});

test("repository-maintainer Oracle workflows are absent from generated clients", () => {
  const generatedSkillRoots = [
    "clients/codex/plugins/bos/skills",
    "clients/claude/plugins/bos/skills",
    "clients/copilot/products/bos/skills",
    "clients/gemini/extensions/bos/skills",
  ];
  const localSkills = [
    "oracle",
    "operations-center-implementation",
    "operations-center-planning",
    "operations-center-review",
  ];

  for (const rootPath of generatedSkillRoots) {
    for (const skill of localSkills) {
      assert.equal(existsSync(new URL(`${rootPath}/${skill}`, root)), false);
    }
  }
});
