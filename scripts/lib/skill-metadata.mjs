// Portable Agent Skills metadata is a string-to-string map. Keep exact pins
// inside that standard field instead of adding host-incompatible root fields.
export const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const skillVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const sortedObject = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => compareText(a, b)));

export function assertVersion(value) {
  if (typeof value !== "string" || !skillVersionPattern.test(value)) throw new Error(`Expected exact skill version x.y.z: ${value}`);
  return value;
}

export function compareVersions(left, right) {
  assertVersion(left); assertVersion(right);
  for (let index = 0; index < 3; index++) {
    const difference = BigInt(left.split(".")[index]) - BigInt(right.split(".")[index]);
    if (difference) return difference > 0n ? 1 : -1;
  }
  return 0;
}

export function skillReferences(text, knownNames) {
  const prose = text.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "");
  const names = new Set();
  for (const [, value] of prose.matchAll(/`([^`\n]+)`/g)) {
    const name = value.startsWith("../") ? value.slice(3).split("/")[0] : value;
    if (knownNames.has(name)) names.add(name);
  }
  return names;
}

export function validateRequirements(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Skill requires must encode an exact-version object");
  for (const [name, version] of Object.entries(value)) {
    if (!skillNamePattern.test(name)) throw new Error(`Invalid required skill name: ${name}`);
    assertVersion(version);
  }
  return sortedObject(value);
}

export function readSkillMetadata(text, label = "SKILL.md") {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
  if (!block) throw new Error(`${label}: missing skill frontmatter`);
  const names = [...block.matchAll(/^name:\s*["']?([^"'\r\n]+)["']?\s*$/gm)];
  if (names.length !== 1 || !skillNamePattern.test(names[0][1])) throw new Error(`${label}: invalid skill name`);
  const sections = [...block.matchAll(/^metadata:\s*\n((?:[ \t]+[^\n]*(?:\n|$))*)/gm)];
  if (sections.length !== 1) throw new Error(`${label}: missing or duplicate metadata`);
  function stringField(key) {
    const rows = [...sections[0][1].matchAll(new RegExp(`^  ${key}: (.+)$`, "gm"))];
    if (rows.length !== 1) throw new Error(`${label}: missing or duplicate metadata.${key}`);
    let value;
    try { value = JSON.parse(rows[0][1]); } catch { throw new Error(`${label}: metadata.${key} must use a JSON-quoted YAML string`); }
    if (typeof value !== "string") throw new Error(`${label}: metadata.${key} must be a string`);
    return value;
  }
  const version = assertVersion(stringField("version"));
  const encoded = stringField("requires");
  let requires;
  try { requires = validateRequirements(JSON.parse(encoded)); } catch (error) { throw new Error(`${label}: ${error.message}`); }
  if (JSON.stringify(requires) !== encoded) throw new Error(`${label}: requires must be canonical JSON with unique sorted keys`);
  if (Object.hasOwn(requires, names[0][1])) throw new Error(`${label}: a skill may not require itself`);
  return { name: names[0][1], version, requires };
}

export function writeSkillMetadata(text, { version, requires }) {
  assertVersion(version);
  requires = validateRequirements(requires);
  const metadata = `metadata:\n  version: ${JSON.stringify(version)}\n  requires: ${JSON.stringify(JSON.stringify(requires))}\n`;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error("Missing skill frontmatter");
  const section = /^metadata:\s*\n((?:[ \t]+[^\n]*(?:\n|$))*)/m.exec(match[1]);
  const extras = section?.[1].replace(/^  (?:version|requires):[^\n]*(?:\n|$)/gm, "").trimEnd();
  const block = match[1].replace(/^metadata:\s*\n(?:[ \t]+[^\n]*(?:\n|$))*/gm, "");
  return `---\n${block.trimEnd()}\n${metadata}${extras ? `${extras}\n` : ""}---\n${text.slice(match[0].length)}`;
}
