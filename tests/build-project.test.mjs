import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

import {validatePublicationPaths} from "../scripts/check-publication-safety.mjs";

const root = new URL("../", import.meta.url);
const definition = JSON.parse(await readFile(new URL("build-project.json", root), "utf8"));
const scripts = JSON.parse(await readFile(new URL("package.json", root), "utf8")).scripts;
const HOST_RUNNERS = new Set(["npm_script", "node_tests", "release_check"]);
const ALLOWED = {npm_script: ["check", "check:privacy", "check:publication", "contract:check"], release_check: ["spec:check"]};

const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
const matches = (patterns, name) => patterns.some((pattern) => glob(pattern).test(name));

test("the definition is Operations Center's own build-project/1 and names no command", () => {
  assert.equal(definition.kind, "build-project/1");
  assert.equal(definition.project, "bosops");
  for (const [key, category] of Object.entries(definition.categories)) {
    assert.ok(HOST_RUNNERS.has(category.runner), `${key} uses a host plugin runner`);
    for (const field of ["argv", "command", "script"]) assert.equal(category[field], undefined, `${key} names no ${field}`);
    assert.equal(category.process ?? "commit", "commit", `${key} releases from the commit build`);
  }
});

test("every selected npm script is allowlisted and defined by package.json", () => {
  for (const [key, category] of Object.entries(definition.categories)) {
    if (!(category.runner in ALLOWED)) continue;
    for (const name of category.selection) {
      assert.ok(ALLOWED[category.runner].includes(name), `${key} selects allowlisted ${name}`);
      assert.equal(typeof scripts[name], "string", `package.json defines ${name}`);
    }
  }
  assert.deepEqual(definition.categories.spec.selection, ["spec:check"]);
  assert.equal(definition.categories.spec.runner, "release_check");
});

test("the definition is a public path the publication check admits", () => {
  assert.deepEqual(validatePublicationPaths(["build-project.json"]), []);
  assert.notDeepEqual(validatePublicationPaths(["build-project.local.json"]), []);
});

test("rules and classification name only defined categories and every class", () => {
  const known = new Set(Object.keys(definition.categories));
  for (const rule of definition.rules) for (const check of rule.checks) assert.ok(known.has(check), check);
  const rules = definition.classification;
  for (const check of [...rules.always, ...rules.non_code, rules.docs_category]) assert.ok(known.has(check), check);
  assert.deepEqual(Object.keys(rules.selection).sort(), ["bug_fix", "deep_bug_fix", "docs_only", "feature"]);
  for (const tier of Object.values(rules.selection)) for (const check of tier.add) assert.ok(known.has(check), check);
});

test("every tracked path is routed by a rule or classified non-runtime", async () => {
  const {stdout} = await promisify(execFile)("git", ["ls-files"], {cwd: root, maxBuffer: 64 * 1024 * 1024});
  const routed = definition.rules.flatMap((rule) => rule.paths);
  const unrouted = stdout.split("\n").filter(Boolean)
    .filter((name) => !matches(routed, name) && !matches(definition.classification.non_runtime, name));
  assert.deepEqual(unrouted, []);
});

test("the sealed-spec gate and sanity run for every class; executable classes take changelist tests", () => {
  const rules = definition.classification;
  assert.deepEqual([...rules.always].sort(), ["sanity", "spec"]);
  // A documentation build keeps docs_category plus the non_code checks its path rules select,
  // so plain documentation selects spec too and keeps it.
  assert.deepEqual([...rules.non_code].sort(), ["sanity", "spec"]);
  for (const name of ["README.md", "LICENSE", ".gitignore"]) {
    const checks = definition.rules.filter((rule) => matches(rule.paths, name)).flatMap((rule) => rule.checks);
    assert.ok(checks.includes("spec") && checks.includes("sanity"), `${name} selects sanity and spec`);
  }
  for (const [name, tier] of Object.entries(rules.selection)) {
    assert.equal(tier.changelist, name !== "docs_only", `${name} changelist tests`);
    assert.deepEqual(tier.add, [], `${name} adds nothing beyond always and path rules`);
  }
  const changelist = Object.values(definition.categories).filter((category) => category.dynamic === "changelist");
  assert.equal(changelist.length, 1);
  assert.equal(changelist[0].runner, "node_tests");
});

test("only plain documentation is non-runtime; skills, agent instructions and the definition are executable", () => {
  const nonRuntime = definition.classification.non_runtime;
  for (const name of ["README.md", "SECURITY.md", "LICENSE", "Vault/docs/architecture.md"]) assert.ok(matches(nonRuntime, name), name);
  for (const name of ["source/platform/bos-mcp-client/SKILL.md", "AGENTS.md", "CLAUDE.md", "tools/validation-contract.md",
    ".agents/skills/oracle/SKILL.md", "build-project.json", "package.json", "tests/build-project.test.mjs"]) {
    assert.ok(!matches(nonRuntime, name), `${name} is executable`);
    const checks = definition.rules.filter((rule) => matches(rule.paths, name)).flatMap((rule) => rule.checks);
    assert.ok(checks.includes("contracts"), `${name} selects contracts`);
  }
});

// spec:check is the universal sealed-spec gate. These isolated repositories run the exact
// package.json script line against synthetic changelists; nothing reads this checkout's history.
const exec = promisify(execFile);
const SEAL = `
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, 'tools')
import validation_contract as v
root, kind, test, origin = Path('.').resolve(), *sys.argv[1:4]
proposal = 'synthetic proposal'
stamp = {'engine': 'codex', 'model': 'synthetic-model', 'oracle_sha256': 'a' * 64, 'host': 'synthetic-host',
         'time': '2026-11-23T00:00:00Z', 'origin_main': origin, 'request_sha256': None,
         'proposal_sha256': hashlib.sha256(proposal.encode()).hexdigest()}
selection = {'change_class': kind, 'scope_paths': ['source.mjs', 'tests/*'], 'reason': 'Synthetic exact coverage',
             'revision_of': None, 'acceptance': ['Synthetic criterion'],
             'acceptance_tests': [{'module': test, 'covers': [0], 'purpose': 'Synthetic proof'}],
             'categories': [{'name': name, 'tests': [] if name in ('sanity', 'regression') else [test], 'fixtures': []}
                            for name in v.CLASSES[kind]]}
v.write_selection(root, v.seal(root, selection, proposal, {'verdict': 'APPROVED'}, stamp=stamp))
`;

async function synthetic(t) {
  const line = fileURLToPath(root).replace(/\/$/, "");
  const repo = await mkdtemp(path.join(os.tmpdir(), "bosops-spec-check-"));
  t.after(() => rm(repo, {recursive: true, force: true}));
  const git = (...args) => exec("git", args, {cwd: repo});
  await git("init", "--quiet", "--initial-branch=main");
  await git("config", "user.name", "Synthetic");
  await git("config", "user.email", "synthetic@example.invalid");
  await mkdir(path.join(repo, "tools"));
  await mkdir(path.join(repo, "tests"));
  for (const name of await readdir(path.join(line, "tools"))) {
    if (name.endsWith(".py") || name === "validation-catalog.json") await cp(path.join(line, "tools", name), path.join(repo, "tools", name));
  }
  await writeFile(path.join(repo, "package.json"), JSON.stringify({scripts: {"spec:check": scripts["spec:check"],
    "check:privacy": "node -e \"process.exit(0)\"", "check:publication": "node -e \"process.exit(0)\""}}));
  await writeFile(path.join(repo, ".gitignore"), "__pycache__/\n");
  await writeFile(path.join(repo, "README.md"), "synthetic\n");
  await writeFile(path.join(repo, "source.mjs"), "export default false;\n");
  await git("add", "-A");
  await git("commit", "--quiet", "-m", "base");
  // The script compares against origin/main, as on the build host's line.
  await git("update-ref", "refs/remotes/origin/main", "HEAD");
  const commit = async () => { await git("add", "-A"); await git("commit", "--quiet", "-m", "change"); };
  const check = () => exec("npm", ["run", "--silent", "spec:check"], {cwd: repo, maxBuffer: 16 * 1024 * 1024})
    .then(({stdout, stderr}) => ({code: 0, output: stdout + stderr}), (error) => ({code: error.code, output: `${error.stdout}${error.stderr}`}));
  const origin = (await git("rev-parse", "HEAD")).stdout.trim();
  const seal = (kind, test) => exec("python3", ["-c", SEAL, kind, test, origin], {cwd: repo});
  return {repo, commit, check, seal};
}

const PASSING = "import test from 'node:test';import assert from 'node:assert/strict';import value from '../source.mjs';test('fixed',()=>assert.equal(value,true));\n";

test("spec:check runs the validation controller's CI action against origin/main and keeps release:check", () => {
  assert.equal(scripts["spec:check"], "python3 tools/validation_contract.py ci --base origin/main");
  assert.equal(scripts["release:check"], "python3 tools/deterministic_package.py validate");
});

test("spec:check admits a documentation-only range without a spec", {timeout: 60_000}, async (t) => {
  const {repo, commit, check} = await synthetic(t);
  await writeFile(path.join(repo, "README.md"), "synthetic documentation\n");
  await commit();
  const {code, output} = await check();
  assert.equal(code, 0, output);
  assert.match(output, /"status": "DOCS_ONLY"/);
});

test("spec:check refuses an absent spec, an invalid spec and a change outside the spec scope", {timeout: 60_000}, async (t) => {
  const {repo, commit, check, seal} = await synthetic(t);
  await writeFile(path.join(repo, "source.mjs"), "export default true;\n");
  await commit();
  let result = await check();
  assert.notEqual(result.code, 0);
  assert.match(result.output, /lacks its sealed Oracle spec/);

  await writeFile(path.join(repo, "tools/validation-selection.json"), "{\"schema\": \"forged\"}\n");
  await commit();
  result = await check();
  assert.notEqual(result.code, 0, result.output);
  assert.doesNotMatch(result.output, /SPEC_TESTS_PASSED/);

  await rm(path.join(repo, "tools/validation-selection.json"));
  await writeFile(path.join(repo, "tests/fixed.test.mjs"), PASSING);
  await seal("bug_fix", "tests/fixed.test.mjs");
  await writeFile(path.join(repo, "outside.mjs"), "export default 1;\n");
  await commit();
  result = await check();
  assert.notEqual(result.code, 0);
  assert.match(result.output, /outside (the sealed spec scope|fixed selection): outside\.mjs/, result.output);
});

test("spec:check executes a valid spec's selected tests and refuses failed, todo or skipped results", {timeout: 120_000}, async (t) => {
  const cases = [
    ["passing", PASSING, true],
    ["failing", "import test from 'node:test';import assert from 'node:assert/strict';test('fixed',()=>assert.equal(1,2));\n", false],
    ["todo", "import test from 'node:test';test('fixed',{todo:true},()=>{});\n", false],
    ["skipped", "import test from 'node:test';test('fixed',{skip:true},()=>{});\n", false],
  ];
  for (const [name, body, passes] of cases) {
    const {repo, commit, check, seal} = await synthetic(t);
    await writeFile(path.join(repo, "source.mjs"), "export default true;\n");
    await writeFile(path.join(repo, "tests/fixed.test.mjs"), body);
    await seal("bug_fix", "tests/fixed.test.mjs");
    await commit();
    const {code, output} = await check();
    if (passes) {
      assert.equal(code, 0, output);
      assert.match(output, /"status": "SPEC_TESTS_PASSED"/);
    } else {
      assert.notEqual(code, 0, `${name} result must be refused: ${output}`);
      assert.match(output, /Sealed spec category failed/, name);
    }
  }
});
