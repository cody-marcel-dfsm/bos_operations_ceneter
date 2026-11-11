import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

  assert.doesNotMatch(workflow, /refs\/pull|publication-audit/);
  // Owner direction 2026-11-11: the sealed Oracle spec gate runs first, then the fixed
  // deterministic category (which includes check:publication) and the spec's own tests.
  const gate = workflow.indexOf("python3 tools/validation_contract.py gate");
  const category = workflow.indexOf("python3 tools/deterministic_package.py ci");
  assert.ok(gate > 0, "workflow runs the sealed Oracle spec gate");
  assert.ok(category > gate, "the spec gate precedes the fixed deterministic category");
});
