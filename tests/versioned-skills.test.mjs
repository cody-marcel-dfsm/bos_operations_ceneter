import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bumpSkillVersion } from "../scripts/bump-skill-version.mjs";
import { readSkillMetadata, writeSkillMetadata } from "../scripts/lib/skill-metadata.mjs";
import { assertSkillVersionTransition, buildSkillManifest, validateSkillManifest } from "../scripts/lib/skill-release.mjs";
import { validateSkillDependencies } from "../scripts/lib/skill-dependencies.mjs";
import { resolveSkillClosure } from "../scripts/lib/skill-import.mjs";
import { listProducts, root, transformProductSkillGuidance } from "../scripts/lib/package-model.mjs";

export function guidance(name, version = "1.0.0", requires = {}) {
  return writeSkillMetadata(`---\nname: ${name}\ndescription: A synthetic fixture for exact versioned skill imports.\n---\n\nUse the synthetic fixture.\n`, { version, requires });
}

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), "versioned-skills-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  await mkdir(join(base, "source/platform/alpha/scripts"), { recursive: true });
  await mkdir(join(base, "source/platform/beta"), { recursive: true });
  await mkdir(join(base, "products/fixture"), { recursive: true });
  await writeFile(join(base, "package.json"), JSON.stringify({ name: "fixture", version: "1.2.0" }));
  await writeFile(join(base, "products/fixture/product.json"), JSON.stringify({ name: "fixture", release_status: "active", includes: ["platform/alpha", "platform/beta"] }));
  await writeFile(join(base, "source/platform/alpha/SKILL.md"), guidance("alpha", "1.0.0", { beta: "1.0.0" }));
  await writeFile(join(base, "source/platform/beta/SKILL.md"), guidance("beta", "1.0.0", { alpha: "1.0.0" }));
  await writeFile(join(base, "source/platform/alpha/scripts/run.sh"), "#!/bin/sh\nexit 0\n");
  await chmod(join(base, "source/platform/alpha/scripts/run.sh"), 0o755);
  return base;
}

test("skill frontmatter uses portable string metadata with exact, canonical dependency pins", () => {
  const text = guidance("alpha", "1.2.3", { beta: "2.0.0" });
  assert.deepEqual(readSkillMetadata(text), { name: "alpha", version: "1.2.3", requires: { beta: "2.0.0" } });
  for (const invalid of [text.replace('version: "1.2.3"', 'version: 1.2'), text.replace('version: "1.2.3"', 'version: "^1.2.3"'), text.replace('requires:', 'other:'), guidance("alpha", "1.0.0", { alpha: "1.0.0" })]) assert.throws(() => readSkillMetadata(invalid));
  const extras = text.replace('metadata:\n', 'metadata:\n  category: "fixture"\n');
  assert.match(writeSkillMetadata(extras, { version: "1.2.4", requires: {} }), /category: "fixture"/);
  assert.throws(() => writeSkillMetadata(text, { version: "1.2.4", requires: { beta: "latest" } }), /exact skill version/);
});

test("manifest binds supporting file modes and hashes; changed source and effective guidance need version bumps", async t => {
  const base = await fixture(t), original = await buildSkillManifest(base);
  assert.deepEqual(original, await buildSkillManifest(base));
  assert.equal(original.release, "1.2.0");
  assert.equal(original.skills.alpha.files["scripts/run.sh"].mode, 0o755);
  await writeFile(join(base, "source/platform/alpha/scripts/run.sh"), "#!/bin/sh\nexit 1\n");
  const changed = await buildSkillManifest(base);
  assert.throws(() => assertSkillVersionTransition(changed, original), /strictly newer/);
  const effective = structuredClone(original); effective.skills.alpha.effective.fixture = "a".repeat(64);
  assert.throws(() => assertSkillVersionTransition(effective, original), /guidance/);
  const versions = await bumpSkillVersion("alpha", "patch", base);
  assert.deepEqual(versions, { alpha: "1.0.1", beta: "1.0.1" });
  const bumped = await buildSkillManifest(base);
  assert.equal(bumped.skills.beta.requires.alpha, "1.0.1");
  assert.doesNotThrow(() => assertSkillVersionTransition(bumped, original));
});

test("exact transitive requirements terminate cycles deterministically and reject missing or conflicting versions", async t => {
  const manifest = await buildSkillManifest(await fixture(t));
  assert.deepEqual(Object.keys(resolveSkillClosure(manifest, "alpha", "1.0.0")), ["alpha", "beta"]);
  assert.throws(() => resolveSkillClosure(manifest, "alpha", "1.0.1"), /Unavailable exact/);
  const missing = structuredClone(manifest); delete missing.skills.beta;
  assert.throws(() => resolveSkillClosure(missing, "alpha", "1.0.0"), /unavailable exact/);
  const conflict = structuredClone(manifest); conflict.skills.alpha.requires.beta = "2.0.0";
  assert.throws(() => resolveSkillClosure(conflict, "alpha", "1.0.0"), /unavailable exact/);
});

test("product dependency checks enforce explicit exact requirements in addition to prose availability", () => {
  const alpha = { name: "alpha", version: "1.0.0", include: "platform/alpha", requires: { beta: "1.0.0" }, files: [] };
  const beta = { name: "beta", version: "2.0.0", include: "platform/beta", requires: {}, files: [] };
  const products = [{ name: "fixture", includes: [alpha.include, beta.include], clients: [] }];
  assert.match(validateSkillDependencies(products, [alpha, beta]).join("\n"), /requires exact skill beta@1.0.0/);
});

test("manifest detects nonadjacent canonical directory ancestors", async t => {
  const manifest = await buildSkillManifest(await fixture(t));
  manifest.skills.alpha.path = "source/a"; manifest.skills.alpha.requires = {};
  manifest.skills.beta.path = "source/a-b"; manifest.skills.beta.requires = {};
  manifest.skills.gamma = { ...structuredClone(manifest.skills.beta), path: "source/a/child" };
  assert.throws(() => validateSkillManifest(manifest), /Overlapping canonical skill paths/);
});

test("current products retain canonical skill pins and specialize only their own generated preflight requirements", async () => {
  const manifest = await buildSkillManifest(root);
  assert(Object.keys(manifest.skills).length > 0);
  const products = (await listProducts()).map(row => row.manifest);
  const text = await readFile(join(root, "source/platform/submit-feedback/SKILL.md"), "utf8");
  assert.equal(readSkillMetadata(text).requires["education-center-customer-initialization"], undefined);
  const education = readSkillMetadata(transformProductSkillGuidance(products.find(row => row.name === "education-center"), "submit-feedback", text));
  assert.equal(education.requires["education-center-customer-initialization"], manifest.skills["education-center-customer-initialization"].version);
  const bos = readSkillMetadata(transformProductSkillGuidance(products.find(row => row.name === "bos"), "submit-feedback", text));
  assert.equal(bos.requires["education-center-customer-initialization"], undefined);
});
