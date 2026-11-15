import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";
import {sha256} from "../scripts/lib/skill-release.mjs";
import {resolveSkillClosure} from "../scripts/lib/skill-import.mjs";
import {stableJson} from "../scripts/lib/package-model.mjs";
import {createRuntimeSkillExporter, runtimeRepository, validateRuntimeProfile} from "../scripts/lib/runtime-skill-export.mjs";
import {parseRuntimeExportArguments} from "../scripts/export-runtime-skill.mjs";

const root = new URL("../", import.meta.url).pathname;
const manifest = JSON.parse(await readFile(join(root, "skill-release-manifest.json"), "utf8"));
const pin = {repository: runtimeRepository, commit: "a".repeat(40), release: manifest.release, skill: "ada", version: manifest.skills.ada.version};
async function fixture() {
  const closure = resolveSkillClosure(manifest, "ada", pin.version); const files = {}, skills = {};
  for (const [name, row] of Object.entries(closure)) {
    skills[name] = {version: row.version, requires: {...row.requires}, files: structuredClone(row.files)};
    for (const [path, inventory] of Object.entries(row.files)) files[`${name}/${path}`] = {
      bytes: await readFile(join(root, row.path, path)), mode: inventory.mode};
  }
  return {pin: {...pin}, package: manifest.package, skills, files};
}
const admitted = p => ({method: "published_main_native_provenance", source: p.commit});
function exporter(release, admitPublication = admitted) {
  return createRuntimeSkillExporter({readRelease: async () => release, admitPublication});
}

test("admitted artifact selects shared instructions and refs; scripts/UI/wrappers remain metadata", async () => {
  const release = await fixture(); const result = await exporter(release)({pin});
  assert.equal(result.status, "published_admitted"); assert.equal(result.profile, "ada-conversation");
  assert.equal(result.entries.filter(row => row.role === "instruction").length, 1);
  assert.equal(result.entries.find(row => row.role === "instruction").path, "references/behavior-core.md");
  assert(result.entries.every(row => row.mediaType === "text/markdown" && sha256(Buffer.from(row.text)) === row.sha256));
  assert.equal(result.resources.find(row => row.path === "SKILL.md").role, "host_wrapper");
  assert.equal(result.resources.find(row => row.path === "agents/openai.yaml").role, "ui");
  assert(result.resources.filter(row => row.path.startsWith("scripts/")).every(row => row.role === "resource" && !Object.hasOwn(row, "text")));
  assert.deepEqual(Object.keys(result).sort(), ["artifact", "profile", "pin", "status", "contentRevision", "dependencies", "entries", "resources", "provenance"].sort());
  assert.deepEqual(result.dependencies, Object.fromEntries(Object.entries(release.skills).filter(([name]) => name !== "ada").map(([name, row]) => [name, row.version])));
  assert.equal((await exporter(release)({pin})).contentRevision, result.contentRevision);
});

test("publication admission precedes reading; preview never acquires production status", async () => {
  const release = await fixture(); let reads = 0, admits = 0;
  const run = createRuntimeSkillExporter({readRelease: async () => {reads++; return release;}, admitPublication: () => {admits++; throw new Error("not published");}});
  await assert.rejects(run({pin}), /not published/); assert.equal(reads, 0);
  const preview = await run({pin, preview: true});
  assert.equal(preview.status, "unpublished_preview"); assert.equal(preview.provenance.method, "unpublished_preview");
  assert.equal(reads, 1); assert.equal(admits, 1);
  for (const proof of [null, {}, {method: "source_integrity_verified", source: pin.commit}, admitted({...pin, commit: "b".repeat(40)})]) {
    await assert.rejects(exporter(release, () => proof)({pin}));
  }
});

test("missing, changed, extra or wrong-mode files and conflicting exact closure fail", async () => {
  const mutations = [
    release => {delete release.files["ada/references/behavior-core.md"];},
    release => {release.files["ada/references/behavior-core.md"].bytes = Buffer.from("changed core");},
    release => {release.files["ada/references/behavior-core.md"].mode = 0o755;},
    release => {release.files["ada/extra.md"] = {bytes: Buffer.from("extra"), mode: 0o644};},
    release => {release.skills.ada.requires["bos-mcp-client"] = "99.0.0";},
    release => {delete release.skills["bos-mcp-client"];},
    release => {release.pin.commit = "b".repeat(40);},
    release => {release.package = "other-owner";}
  ];
  for (const mutate of mutations) {const release = await fixture(); mutate(release); await assert.rejects(exporter(release)({pin}));}
});

test("closed role profile refuses script/UI/wrapper instruction injection and unsafe path inventory", async () => {
  const release = await fixture(); const original = JSON.parse(release.files["ada/runtime-export.json"].bytes.toString());
  for (const [path, role] of [["scripts/journey-view.mjs", "instruction"], ["agents/openai.yaml", "instruction"],
    ["SKILL.md", "instruction"], ["runtime-export.json", "instruction"], ["references/behavior-core.md", "resource"]]) {
    const profile = structuredClone(original); profile.entries[path] = role;
    assert.throws(() => validateRuntimeProfile(profile, release.skills.ada));
  }
  for (const mutate of [profile => {profile.network = true;}, profile => {profile.entries["../outside.md"] = "instruction";},
    profile => {delete profile.entries["agents/openai.yaml"];}, profile => {profile.dependencyPolicy = "inject_all";}]) {
    const profile = structuredClone(original); mutate(profile); assert.throws(() => validateRuntimeProfile(profile, release.skills.ada));
  }
});

test("content revision binds every dependency, profile role, supporting ref and source byte", async () => {
  const original = await fixture(); const before = await exporter(original)({pin});
  const changed = await fixture(); const path = "bos-mcp-client/SKILL.md";
  changed.files[path].bytes = Buffer.concat([changed.files[path].bytes, Buffer.from("\n")]);
  changed.skills["bos-mcp-client"].files["SKILL.md"].sha256 = sha256(changed.files[path].bytes);
  assert.notEqual((await exporter(changed)({pin})).contentRevision, before.contentRevision);
  const profile = JSON.parse(original.files["ada/runtime-export.json"].bytes.toString());
  const sorted = Object.fromEntries(Object.entries(original.skills).sort(([a], [b]) => a < b ? -1 : 1));
  assert.equal(before.contentRevision, sha256(stableJson({profile, closure: sorted})));
});

test("export pin/CLI parsing rejects foreign owner, mutable ref, changed skill and implicit preview", async () => {
  const release = await fixture();
  for (const badPin of [{...pin, repository: "https://example.invalid/repo.git"}, {...pin, commit: "main"},
    {...pin, version: "latest"}, {...pin, skill: "other"}, {...pin, organization: "model-invented"}]) await assert.rejects(exporter(release)({pin: badPin}));
  assert.equal(parseRuntimeExportArguments(["--commit", pin.commit, "--release", pin.release, "--skill", `ada@${pin.version}`]).preview, false);
  assert.equal(parseRuntimeExportArguments(["--commit", pin.commit, "--release", pin.release, "--skill", `ada@${pin.version}`, "--preview"]).preview, true);
  for (const args of [["--preview", "--preview"], ["--repository", runtimeRepository], ["--skill", "ada@1.0.0", "--skill", "ada@2.0.0"]]) assert.throws(() => parseRuntimeExportArguments(args));
});

test("production CLI rejects syntactically exact but unresolvable unpublished source", () => {
  const result = spawnSync(process.execPath, [join(root, "scripts/export-runtime-skill.mjs"), "--commit", "0".repeat(40),
    "--release", pin.release, "--skill", `ada@${pin.version}`], {cwd: root, encoding: "utf8", timeout: 15000});
  assert.equal(result.status, 1); assert.equal(result.stdout, "");
  assert(result.stderr.includes("published native provenance"));
});

test("all five production wrappers package the identical shared core and closed runtime profile", async () => {
  for (const host of ["codex/plugins", "claude/plugins", "copilot/products", "gemini/extensions", "muse/plugins"]) {
    const base = join(root, "clients", host, "bos/skills/ada");
    const wrapper = await readFile(join(base, "SKILL.md"), "utf8");
    assert(wrapper.includes("references/behavior-core.md"));
    for (const file of ["references/behavior-core.md", "references/runtime-export.md", "runtime-export.json"]) {
      assert.equal(await readFile(join(base, file), "utf8"), await readFile(join(root, "source/platform/ada", file), "utf8"));
    }
  }
});
