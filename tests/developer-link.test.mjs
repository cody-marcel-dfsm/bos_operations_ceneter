import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { linkCodexDevelopment } from "../scripts/link-codex-development.mjs";
import {
  listProducts,
  resolveProductSkills
} from "../scripts/lib/package-model.mjs";

test("developer linking backs up active skills and becomes idempotent", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "bos-dev-link-test-"));
  const cacheRoot = join(temporary, "cache");
  const backupRoot = join(temporary, "backups");
  const [{ manifest }] = (await listProducts()).filter(
    ({ manifest: candidate }) => candidate.name === "bos"
  );
  const skills = await resolveProductSkills(manifest);
  for (const skill of skills) {
    const active = join(
      cacheRoot,
      "bos",
      "0.2.0",
      "skills",
      skill.name
    );
    await mkdir(active, { recursive: true });
    await writeFile(join(active, "SKILL.md"), `active ${skill.name}\n`);
  }

  const first = await linkCodexDevelopment({
    cacheRoot,
    backupRoot,
    products: ["bos"]
  });
  assert.equal(first.results.length, skills.length);
  assert(first.results.every((result) => result.state === "linked"));
  for (const result of first.results) {
    assert.equal((await lstat(result.target)).isSymbolicLink(), true);
    assert.equal(
      resolve(dirname(result.target), await readlink(result.target)),
      result.source
    );
    assert.equal(
      await readFile(join(result.backup, "SKILL.md"), "utf8"),
      `active ${result.skill}\n`
    );
  }

  const repeated = await linkCodexDevelopment({
    cacheRoot,
    backupRoot,
    products: ["bos"]
  });
  assert(repeated.results.every((result) => result.state === "current"));
  assert(repeated.results.every((result) => result.backup === null));
});
