import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  pathExists,
  productNamePattern,
  safeInside,
  stableJson
} from "./lib/package-model.mjs";

function parseArgs(argv) {
  const options = { home: homedir() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--home") options.home = resolve(argv[++index]);
    else if (argument === "--product") options.product = argv[++index];
    else if (argument === "--base-skill") options.baseSkill = argv[++index];
    else if (argument === "--site") options.site = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function requireSafeName(value, label) {
  if (!productNamePattern.test(value ?? "")) {
    throw new Error(`${label} must use lowercase kebab-case`);
  }
}

export async function createCustomerExtension(rawOptions) {
  const options = { home: homedir(), ...rawOptions };
  requireSafeName(options.product, "product");
  requireSafeName(options.baseSkill, "base skill");
  requireSafeName(options.site, "site");

  const pluginRoot = join(options.home, "plugins", options.product);
  const skillsRoot = join(pluginRoot, "skills");
  const baseRoot = join(skillsRoot, options.baseSkill);
  const manifestPath = join(pluginRoot, ".codex-plugin", "plugin.json");
  if (!(await pathExists(join(baseRoot, "SKILL.md")))) {
    throw new Error(
      `Installed base skill is missing: ${options.product}:${options.baseSkill}`
    );
  }
  const pluginManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const extensionName = `${options.baseSkill}-${options.site}`;
  const extensionRoot = join(skillsRoot, extensionName);
  if (
    !safeInside(skillsRoot, extensionRoot) ||
    (await pathExists(extensionRoot))
  ) {
    throw new Error(`Extension already exists or has an unsafe path: ${extensionName}`);
  }

  await mkdir(extensionRoot, { recursive: false });
  await writeFile(
    join(extensionRoot, ".bos-extension.json"),
    stableJson({
      schema_version: "1",
      ownership: "customer",
      extends: {
        product: options.product,
        skill: options.baseSkill,
        tested_version: pluginManifest.version
      }
    })
  );
  await writeFile(
    join(extensionRoot, "SKILL.md"),
    [
      "---",
      `name: ${extensionName}`,
      `description: Apply ${options.site} operating context to ${options.product}:${options.baseSkill}.`,
      "---",
      "",
      `# ${options.site} extension for ${options.baseSkill}`,
      "",
      `Use \`$${options.product}:${options.baseSkill}\` as the base operating procedure.`,
      `Apply the ${options.site} additions below. Defer every unspecified behavior`,
      "to the base skill.",
      "",
      "## Customer additions",
      "",
      "- Add customer terminology, defaults, policies, and exceptions here.",
      "- Preserve BOS tenant, organization, application, role, and provider scope.",
      ""
    ].join("\n")
  );
  return {
    product: options.product,
    base_skill: options.baseSkill,
    extension: extensionName,
    path: extensionRoot,
    tested_version: pluginManifest.version
  };
}

async function main() {
  const result = await createCustomerExtension(parseArgs(process.argv.slice(2)));
  process.stdout.write(stableJson(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
