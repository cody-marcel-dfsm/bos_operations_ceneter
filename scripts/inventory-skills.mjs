import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathExists, root, stableJson, walkFiles } from "./lib/package-model.mjs";

function parseSkill(content) {
  return {
    name: content.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim(),
    description: content
      .match(/^description:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]
      ?.trim()
  };
}

async function inventoryRoot(scope, directory) {
  if (!(await pathExists(directory))) return [];
  const files = (await walkFiles(directory)).filter((path) =>
    path.endsWith(`${join("", "SKILL.md")}`)
  );
  return Promise.all(
    files.map(async (path) => ({
      scope,
      path,
      relative_path: relative(directory, path),
      ...parseSkill(await readFile(path, "utf8"))
    }))
  );
}

const requestedOutput = process.argv[2];
const records = (
  await Promise.all([
    inventoryRoot("user-global", join(homedir(), ".agents", "skills")),
    inventoryRoot("legacy-user", join(homedir(), ".codex", "skills")),
    inventoryRoot("local-bos-plugin", join(homedir(), "plugins", "bos", "skills")),
    inventoryRoot(
      "lead-director-repository",
      resolve(root, "..", "lead_director", ".agents", "skills")
    ),
    inventoryRoot("bos-package-source", join(root, "source"))
  ])
).flat();

const byName = {};
for (const record of records) {
  const key = record.name ?? "<missing>";
  (byName[key] ??= []).push(record.path);
}

const report = {
  schema_version: "1",
  generated_at: new Date().toISOString(),
  records,
  duplicate_names: Object.fromEntries(
    Object.entries(byName).filter(([, paths]) => paths.length > 1)
  )
};

if (requestedOutput) {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const output = resolve(requestedOutput);
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, stableJson(report));
  console.log(`Wrote ${records.length} skill records to ${output}`);
} else {
  process.stdout.write(stableJson(report));
}
