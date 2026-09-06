import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  root, listProducts, resolveProductSkills, transformProductSkillGuidance,
  injectMutationSafety
} from "../scripts/lib/package-model.mjs";

test("mutation safety survives every product routing branch and client composition", async () => {
  const policy = (await readFile(`${root}/source/platform/bos-mcp-client/references/mutation-safety.md`, "utf8")).trim();
  const clientRoots = {
    codex: "clients/codex/plugins",
    claude: "clients/claude/plugins",
    copilot: "clients/copilot/products",
    gemini: "clients/gemini/extensions"
  };
  for (const { manifest } of await listProducts()) {
    for (const skill of await resolveProductSkills(manifest)) {
      const source = await readFile(skill.skillFile, "utf8");
      const transformed = transformProductSkillGuidance(manifest, skill.name, source);
      assert.equal(transformed.split(policy).length, 2, `${manifest.name}/${skill.name}`);
      assert(transformed.endsWith(source.slice(source.indexOf("\n---", 3) + 4).trimStart()),
        "composition preserves the complete authored workflow");
      if (manifest.release_status !== "active") continue;
      for (const client of manifest.clients) {
        const path = `${root}/${clientRoots[client]}/${manifest.name}/skills/${skill.name}/SKILL.md`;
        assert.equal(await readFile(path, "utf8"), transformed, path);
      }
    }
  }
});

test("mutation safety fails closed on malformed skill frontmatter", () => {
  assert.throws(() => injectMutationSafety("# Missing metadata"), /without frontmatter/);
});
