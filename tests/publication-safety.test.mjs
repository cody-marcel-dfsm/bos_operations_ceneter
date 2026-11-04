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
  // Since 6d75ed26 the workflow delegates to the fixed deterministic gate,
  // whose release check category runs the publication audit itself.
  assert.match(workflow, /python3 tools\/deterministic_package\.py ci --base/);
  assert.match(packageGate, /\['npm', 'run', 'check:publication'\]/);
  assert.equal(packageJson.scripts["release:check"], "python3 tools/deterministic_package.py validate");
});
