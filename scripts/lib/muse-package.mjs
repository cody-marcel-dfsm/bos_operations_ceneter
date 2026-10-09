import {readFile} from "node:fs/promises";
import {join, relative} from "node:path";
import {
  hashFile, mcpServerName, materializeMcpUrl, ownsHostConnection,
  pathExists, productLongDescription, publicPackagePath, readJson,
  root, stableJson, transformProductSkillGuidance, walkFiles
} from "./package-model.mjs";

// Muse plugin MCP entries cannot use OAuth. The BOS-owned settings template
// supplies the native host connection; every plugin contributes skills only.
export function musePluginManifest(product, skills) {
  return {
    schemaVersion: 1, name: product.name, displayName: product.display_name,
    version: product.version, description: productLongDescription(product),
    compat: {source: "native", manifestDir: ".muse-plugin"},
    capabilities: {
      skills: skills.map(({name}) => ({id: name, path: `skills/${name}/SKILL.md`, enabledDefault: true}))
    },
    meta: {
      brandColor: product.brand_color, logo: product.logo,
      composerIcon: product.composer_icon,
      dependencies: [...product.dependencies, ...(product.independent_product_dependencies ?? []).map(({name}) => name)]
    }
  };
}

export function museSettingsTemplate(product) {
  if (!ownsHostConnection(product)) throw new Error("Only the connection owner can generate Muse MCP settings");
  return {
    schema_version: 1,
    mcpServers: {[mcpServerName(product)]: {type: "streamable-http", url: materializeMcpUrl(product)}}
  };
}

export async function validateMusePackage(product, skills, directory = join(root, "clients/muse/plugins", product.name)) {
  const findings = [];
  const expected = musePluginManifest(product, skills);
  const manifest = await readJson(join(directory, ".muse-plugin/plugin.json"));
  if (stableJson(manifest) !== stableJson(expected)) findings.push("Muse native manifest drift");
  const allowed = new Set([".muse-plugin/plugin.json", ".bos-product.json", "README.md"]);
  for (const skill of skills) {
    for (const file of await walkFiles(skill.sourcePath)) {
      if (!publicPackagePath(file)) continue;
      const rel = relative(skill.sourcePath, file).replaceAll("\\", "/");
      const destination = `skills/${skill.name}/${rel}`;
      allowed.add(destination);
      const source = await readFile(file);
      const actual = await readFile(join(directory, destination));
      const expectedContent = rel === "SKILL.md" ? Buffer.from(transformProductSkillGuidance(product, skill.name, source.toString("utf8"))) : source;
      if (!actual.equals(expectedContent)) findings.push(`Muse skill source drift: ${destination}`);
      if (rel === "SKILL.md" && actual.length > 256 * 1024) findings.push(`Muse skill exceeds host size limit: ${destination}`);
    }
  }
  for (const asset of new Set([product.logo, product.composer_icon].filter(Boolean))) {
    allowed.add(asset);
    if (await hashFile(join(directory, asset)) !== await hashFile(join(root, "products", product.name, asset))) findings.push(`Muse asset drift: ${asset}`);
  }
  if (product.settings_template) {
    allowed.add("config/customer-settings.template.json");
    if (await hashFile(join(directory, "config/customer-settings.template.json")) !== await hashFile(join(root, "source", product.settings_template))) findings.push("Muse product settings drift");
  }
  if (ownsHostConnection(product)) {
    allowed.add("muse-settings.template.json");
    if (stableJson(await readJson(join(directory, "muse-settings.template.json"))) !== stableJson(museSettingsTemplate(product))) findings.push("Muse BOS settings binding drift");
  } else if (await pathExists(join(directory, "muse-settings.template.json"))) findings.push("Dependent Muse product declares a second connection");
  for (const file of await walkFiles(directory)) {
    const rel = relative(directory, file).replaceAll("\\", "/");
    if (!allowed.has(rel)) findings.push(`Unexpected Muse package entry: ${rel}`);
  }
  return findings;
}
