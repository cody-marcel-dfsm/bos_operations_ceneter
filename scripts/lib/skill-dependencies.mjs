import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { root, walkFiles } from "./package-model.mjs";
import { readSkillMetadata, skillReferences } from "./skill-metadata.mjs";
export { skillReferences } from "./skill-metadata.mjs";

// Inspect canonical prose, including supporting references. Fenced examples do
// not declare dependencies. Resolve only names owned by this repository.
export function validateSkillDependencies(products, skills) {
  const failures = new Set();
  const byProduct = new Map(products.map(p => [p.name, p]));
  const byInclude = new Map(skills.map(s => [s.include, s]));
  const knownNames = new Set(skills.map(s => s.name));
  for (const product of products.filter(p => p.release_status !== "disabled")) {
    const available = new Set();
    function visit(current, path = []) {
      if (path.includes(current.name)) {
        failures.add(`${product.name}: product dependency cycle ${[...path, current.name].join(" -> ")}`);
        return;
      }
      for (const include of current.includes) {
        const skill = byInclude.get(include);
        if (skill) available.add(skill.name);
        else failures.add(`${current.name}: unknown skill include ${include}`);
      }
      for (const name of current.dependencies ?? []) {
        const dependency = byProduct.get(name);
        if (!dependency) failures.add(`${current.name}: unknown dependency ${name}`);
        else if (dependency.release_status === "disabled") failures.add(`${current.name}: disabled dependency ${name}`);
        else {
          for (const client of product.clients ?? []) {
            if (!dependency.clients?.includes(client)) failures.add(`${product.name}: dependency ${name} does not ship ${client}`);
          }
          visit(dependency, [...path, current.name]);
        }
      }
    }
    visit(product);
    for (const include of product.includes) {
      const skill = byInclude.get(include);
      for (const [name, version] of Object.entries(skill?.requires ?? {})) {
        if (!available.has(name)) failures.add(`${product.name}: ${skill.name} requires unavailable skill ${name}@${version}`);
        else if (skills.find(row => row.name === name)?.version !== version) failures.add(`${product.name}: ${skill.name} requires exact skill ${name}@${version}`);
      }
      for (const file of skill?.files ?? []) {
        for (const name of skillReferences(file.text, knownNames)) {
          if (!available.has(name)) failures.add(`${product.name}: ${file.path} requires unavailable skill ${name}`);
          if (name !== skill.name && skill.requires && !Object.hasOwn(skill.requires, name)) failures.add(`${product.name}: ${file.path} omits declared requirement ${name}`);
        }
      }
    }
  }
  return [...failures].sort();
}

export async function checkSkillDependencies(products, base = root) {
  const files = await walkFiles(join(base, "source"));
  const skills = [];
  for (const entry of files.filter(p => p.endsWith("/SKILL.md"))) {
    const folder = entry.slice(0, -"SKILL.md".length);
    const text = await readFile(entry, "utf8");
    const metadata = readSkillMetadata(text, entry);
    const documents = files.filter(p => p.startsWith(folder) && p.endsWith(".md"));
    skills.push({ ...metadata, include: relative(join(base, "source"), folder), files: await Promise.all(documents.map(async path => ({ path: relative(base, path), text: await readFile(path, "utf8") }))) });
  }
  return validateSkillDependencies(products, skills);
}
