import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceSkills = resolve(root, "source", "skills");
const targets = [
  resolve(root, "clients", "codex", "plugins", "icode-operations-center", "skills"),
  resolve(root, "clients", "claude", "skills"),
  resolve(root, "clients", "copilot", "skills")
];

for (const target of targets) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(sourceSkills, target, { recursive: true, force: true });
}

console.log(`Generated ${targets.length} client skill packages.`);
