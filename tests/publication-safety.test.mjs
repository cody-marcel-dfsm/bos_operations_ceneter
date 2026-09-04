import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  publicationFailures,
  validatePublicationPaths,
} from "../scripts/check-publication-safety.mjs";

test("publication safety rejects Vault and unclassified top-level paths", () => {
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
  assert.match(workflow, /npm run check:publication/);
  assert.match(workflow, /npm run release:check/);
});
