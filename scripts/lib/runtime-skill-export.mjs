// Producer-owned artifact export. No consumer source materialization or execution.
import {execFileSync} from "node:child_process";
import {join} from "node:path";
import {readPublishedProductEntries} from "../build-marketplace-update.mjs";
import {root, stableJson} from "./package-model.mjs";
import {readPinnedGitSkills, validateImportPin} from "./skill-import.mjs";
import {assertFileInventory, safeSkillPath, sha256} from "./skill-release.mjs";

export const runtimeRepository = "https://github.com/cody-marcel-dfsm/bos_operations_ceneter.git";
const roles = ["instruction", "supporting_reference", "resource", "ui", "host_wrapper", "metadata"];
const sorted = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
function closed(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new Error("Invalid closed runtime export metadata");
}

export function validateRuntimeProfile(profile, rootSkill) {
  closed(profile, ["profile", "dependencyPolicy", "entries"]);
  if (profile.profile !== "ada-conversation" || profile.dependencyPolicy !== "verify_exact_closure_do_not_inject") throw new Error("Unsupported runtime profile");
  if (!profile.entries || typeof profile.entries !== "object" || Array.isArray(profile.entries) || Object.keys(profile.entries).length > 64) throw new Error("Invalid bounded runtime entries");
  assertFileInventory(rootSkill.files);
  if (Object.keys(profile.entries).sort().join("\0") !== Object.keys(rootSkill.files).sort().join("\0")) throw new Error("Runtime profile must classify every root skill file exactly");
  let instructions = 0;
  for (const [path, role] of Object.entries(profile.entries)) {
    safeSkillPath(path);
    if (!roles.includes(role)) throw new Error("Unknown runtime entry role");
    if (["instruction", "supporting_reference"].includes(role) && (!path.endsWith(".md") || path === "SKILL.md")) throw new Error("Only selected Markdown behavior can be instructions");
    if (path.startsWith("scripts/") && role !== "resource") throw new Error("Scripts are resources only");
    if (path.startsWith("agents/") && role !== "ui") throw new Error("Agent UI metadata must remain separate");
    if (path === "SKILL.md" && role !== "host_wrapper") throw new Error("Host wrapper cannot be runtime instructions");
    if (path === "runtime-export.json" && role !== "metadata") throw new Error("Descriptor is metadata only");
    if (rootSkill.files[path].mode !== 0o644 && ["instruction", "supporting_reference"].includes(role)) throw new Error("Executable instructions rejected");
    if (role === "instruction") instructions++;
  }
  if (instructions !== 1 || profile.entries["references/behavior-core.md"] !== "instruction") throw new Error("Exactly the shared behavior core must be primary instructions");
  return profile;
}

function validateRelease(release, pin) {
  if (!release || stableJson(release.pin) !== stableJson(pin) || release.package !== "bos-operations-center") throw new Error("Release pin mismatch");
  const rootSkill = release.skills?.[pin.skill];
  if (!rootSkill || rootSkill.version !== pin.version) throw new Error("Unavailable exact root skill");
  const visited = new Set(), pending = [pin.skill]; let bytes = 0, fileCount = 0;
  while (pending.length) {
    const name = pending.shift(); if (visited.has(name)) continue; visited.add(name);
    if (visited.size > 100) throw new Error("Runtime dependency bound exceeded");
    const skill = release.skills[name]; assertFileInventory(skill.files);
    for (const [dependency, version] of Object.entries(skill.requires)) {
      if (release.skills[dependency]?.version !== version) throw new Error("Dependency closure mismatch");
      pending.push(dependency);
    }
    for (const [path, inventory] of Object.entries(skill.files)) {
      const file = release.files[`${name}/${path}`];
      if (!file || sha256(file.bytes) !== inventory.sha256 || file.mode !== inventory.mode) throw new Error("Runtime file integrity mismatch");
      bytes += file.bytes.length; fileCount++;
      if (bytes > 100 * 1024 * 1024 || fileCount > 1000) throw new Error("Runtime file bound exceeded");
    }
  }
  if (Object.keys(release.skills).some(name => !visited.has(name)) || Object.keys(release.files).length !== fileCount) throw new Error("Unexpected runtime closure content");
  return rootSkill;
}

export function createRuntimeSkillExporter({readRelease, admitPublication}) {
  if (typeof readRelease !== "function" || typeof admitPublication !== "function") throw new Error("Trusted source and publication adapters required");
  return async function exportRuntimeSkill({pin, preview = false}) {
    closed(pin, ["repository", "commit", "release", "skill", "version"]);
    validateImportPin(pin);
    if (pin.repository !== runtimeRepository || pin.skill !== "ada" || typeof preview !== "boolean") throw new Error("Unsupported runtime artifact owner or skill");
    // Production admission precedes reading/emitting behavior. Source integrity
    // alone and caller-supplied metadata can never stand in for this adapter.
    const provenance = preview ? {method: "unpublished_preview", source: pin.commit} : await admitPublication(pin);
    closed(provenance, ["method", "source"]);
    if (!preview && (!provenance || provenance.method !== "published_main_native_provenance" || provenance.source !== pin.commit)) throw new Error("Published native provenance required");
    const release = await readRelease(pin); const rootSkill = validateRelease(release, pin);
    const descriptor = release.files[`${pin.skill}/runtime-export.json`];
    if (!descriptor || descriptor.bytes.length > 65536) throw new Error("Missing bounded runtime profile");
    const profile = JSON.parse(descriptor.bytes.toString("utf8"));
    if (stableJson(profile) !== descriptor.bytes.toString("utf8")) throw new Error("Runtime profile must use canonical JSON");
    validateRuntimeProfile(profile, rootSkill);
    const entries = [], resources = [];
    for (const [path, role] of Object.entries(sorted(profile.entries))) {
      const file = release.files[`${pin.skill}/${path}`];
      const row = {path, role, sha256: sha256(file.bytes), mode: file.mode};
      if (["instruction", "supporting_reference"].includes(role)) {
        const text = file.bytes.toString("utf8");
        if (!Buffer.from(text, "utf8").equals(file.bytes) || text.includes("\0")) throw new Error("Invalid UTF-8 behavior content");
        entries.push({...row, mediaType: "text/markdown", text});
      } else resources.push(row);
    }
    const closure = sorted(release.skills);
    return {artifact: "bos-runtime-skill", profile: profile.profile, pin: {...pin},
      status: preview ? "unpublished_preview" : "published_admitted",
      contentRevision: sha256(stableJson({profile, closure})),
      dependencies: sorted(Object.fromEntries(Object.entries(closure).filter(([name]) => name !== pin.skill).map(([name, row]) => [name, row.version]))),
      entries, resources, provenance: {...provenance}};
  };
}

export const exportRuntimeSkill = createRuntimeSkillExporter({
  readRelease: pin => readPinnedGitSkills(join(root, ".git"), pin),
  admitPublication: async pin => {
    // Existing exporter enforces exact origin/main ancestry and native Oracle
    // receipt or exact-source deterministic release-branch CI provenance.
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {cwd: root, encoding: "utf8"}).trim();
    if (![runtimeRepository, "git@github.com:cody-marcel-dfsm/bos_operations_ceneter.git"].includes(remote)) throw new Error("Untrusted publication remote");
    readPublishedProductEntries(pin.commit, "bos");
    return {method: "published_main_native_provenance", source: pin.commit};
  }
});
