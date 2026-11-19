import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  publicationFailures,
  validatePublicationPaths,
} from "../scripts/check-publication-safety.mjs";

test("publication safety rejects Vault and unclassified top-level paths", () => {
  assert.deepEqual(validatePublicationPaths(["package-lock.json"]), []);
  assert.deepEqual(validatePublicationPaths(["skill-release-manifest.json"]), []);
  assert.deepEqual(validatePublicationPaths(["CLAUDE.md", ".claude/skills/operations-center-implementation/SKILL.md"]), []);
  assert.deepEqual(validatePublicationPaths(["CLAUDE.md.backup"]), [
    "Path is outside the public allowlist: CLAUDE.md.backup",
  ]);
  assert.deepEqual(validatePublicationPaths(["skill-release-manifest.json.backup"]), [
    "Path is outside the public allowlist: skill-release-manifest.json.backup",
  ]);
  assert.deepEqual(validatePublicationPaths(["package-lock.json.backup"]), [
    "Path is outside the public allowlist: package-lock.json.backup",
  ]);
  assert.deepEqual(validatePublicationPaths(["Vault/docs/private.md"]), [
    "Private Vault path is public: Vault/docs/private.md",
  ]);
  assert.deepEqual(validatePublicationPaths(["private-notes/incident.md"]), [
    "Path is outside the public allowlist: private-notes/incident.md",
  ]);
});

test("current tracked files and reachable refs contain no Vault history", async () => {
  assert.deepEqual(await publicationFailures(), []);
});

test("publication workflow audits release refs without importing retained pull-request refs", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/publication-safety.yml", import.meta.url),
    "utf8",
  );

  const packageGate = await readFile(
    new URL("../tools/deterministic_package.py", import.meta.url),
    "utf8",
  );
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.doesNotMatch(workflow, /refs\/pull|publication-audit/);
  // Owner direction 2026-11-11: the sealed Oracle spec gate runs first, then the fixed
  // deterministic category (which includes check:publication) and the spec's own tests.
  const gate = workflow.indexOf("python3 tools/validation_contract.py gate");
  const category = workflow.indexOf("python3 tools/deterministic_package.py ci");
  assert.ok(gate > 0, "workflow runs the sealed Oracle spec gate");
  assert.ok(category > gate, "the spec gate precedes the fixed deterministic category");
  assert.match(packageGate, /\['npm', 'run', 'check:publication'\]/);
  assert.equal(packageJson.scripts["release:check"], "python3 tools/deterministic_package.py validate");
  assert.match(workflow, /python3 tools\/deterministic_package\.py ci --base/);
});

test("the single release branch is version-named and IDE-neutral", async () => {
  // Owner direction (Cody): one release branch named by version, never IDE specific.
  const workflow = await readFile(new URL("../.github/workflows/publication-safety.yml", import.meta.url), "utf8");
  const admission = await readFile(new URL("../tools/publication_admission.py", import.meta.url), "utf8");
  const packageGate = await readFile(new URL("../tools/deterministic_package.py", import.meta.url), "utf8");
  const shipIt = await readFile(new URL("../.agents/skills/ship-it/SKILL.md", import.meta.url), "utf8");
  const packageDoc = await readFile(new URL("../tools/deterministic-package.md", import.meta.url), "utf8");
  assert.match(workflow, /branches: \[main, 'release\/\*'/);
  assert.match(workflow, /refs\/heads\/release\/\*\)/);
  for (const text of [workflow, admission, packageGate, shipIt, packageDoc]) {
    assert.doesNotMatch(text, /codex\/release/);
  }
  assert.match(admission, /release\/\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/);
  assert.match(packageGate, /'release\/' \+ version/);
  assert.match(shipIt, /`release\/<next-version>`/);
});
