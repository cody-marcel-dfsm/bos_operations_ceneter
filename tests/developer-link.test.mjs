import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkCodexDevelopment } from "../scripts/link-codex-development.mjs";

test("retired development linker rejects before altering installed files", async () => {
  const root = await mkdtemp(join(tmpdir(), "bos-link-rejection-"));
  try {
    const skill = join(root, "bos", "0.4.86", "skills", "bos-mcp-client");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "published bytes");
    await assert.rejects(linkCodexDevelopment({ cacheRoot: root }), /prohibited.*Git release/);
    assert.equal(await readFile(join(skill, "SKILL.md"), "utf8"), "published bytes");
    assert.equal((await lstat(skill)).isSymbolicLink(), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
