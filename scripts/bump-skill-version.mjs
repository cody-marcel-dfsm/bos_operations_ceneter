import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { nextVersion } from "./bump-release-version.mjs";
import { listProducts, root, transformProductSkillGuidance } from "./lib/package-model.mjs";
import { canonicalSkillRecords } from "./lib/skill-release.mjs";
import { readSkillMetadata, writeSkillMetadata } from "./lib/skill-metadata.mjs";

export async function bumpSkillVersion(name, requested = "patch", base = root) {
  const skills = await canonicalSkillRecords(base);
  const selected = skills.find(row => row.name === name);
  if (!selected) throw new Error(`Unknown canonical skill: ${name}`);
  const products = (await listProducts(base)).map(row => row.manifest).filter(row => row.release_status !== "disabled");
  const dependencies = new Map(skills.map(row => [row.name, new Set(Object.keys(row.requires))]));
  for (const row of skills) for (const product of products.filter(product => product.includes.includes(row.path.slice("source/".length)))) {
    for (const dependency of Object.keys(readSkillMetadata(transformProductSkillGuidance(product, row.name, row.text)).requires)) dependencies.get(row.name).add(dependency);
  }
  const affected = new Set([name]);
  let changed;
  do {
    changed = false;
    for (const row of skills) if (!affected.has(row.name) && [...dependencies.get(row.name)].some(dependency => affected.has(dependency))) { affected.add(row.name); changed = true; }
  } while (changed);
  const versions = Object.fromEntries(skills.filter(row => affected.has(row.name)).map(row => [row.name, nextVersion(row.version, row.name === name ? requested : "patch")]));
  const edits = [];
  for (const row of skills.filter(row => affected.has(row.name))) {
    const path = join(row.sourcePath, "SKILL.md");
    const requires = Object.fromEntries(Object.entries(row.requires).map(([dependency, version]) => [dependency, versions[dependency] ?? version]));
    edits.push([path, writeSkillMetadata(await readFile(path, "utf8"), { version: versions[row.name], requires })]);
  }
  for (const [path, bytes] of edits) await writeFile(path, bytes);
  return versions;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try { console.log(JSON.stringify(await bumpSkillVersion(process.argv[2], process.argv[3]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
