import { copyOracleModules, withOracleFixture } from "./oracle-fixture.mjs";
import assert from "node:assert/strict";
import { execFileSync as nativeExecFileSync, spawnSync as nativeSpawnSync } from "node:child_process";
const fixtureArgs = (file,args) => file === "python3" && args[0] === "-c" ? ["-c", withOracleFixture(args[1]), ...args.slice(2)] : args;
const execFileSync = (file,args,options) => nativeExecFileSync(file,fixtureArgs(file,args),options);
const spawnSync = (file,args,options) => nativeSpawnSync(file,fixtureArgs(file,args),options);
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const privateVaultAvailable = existsSync(new URL("Vault/docs/architecture.md", root));

test("both independent Oracle prompts require review of the recurring lead graph regression", () => {
  const prompts = JSON.parse(execFileSync("python3", ["-c", [
    "import json",
    "from pathlib import Path",
    "import tools.oracle_approval as o",
    "o.selected_model=lambda:'synthetic-model'",
    "o.selected_reasoning_effort=lambda:None",
    "prompts=[]",
    "import tempfile",
    "native_run=tempfile.TemporaryDirectory()",
    "o._RUN.set(Path(native_run.name))",
    "o._atomic_write=lambda path,raw:path.write_bytes(raw)",
    "o._review_process=lambda root,prompt,prefix,**kwargs: prompts.append(prompt)",
    "o._proposal_oracle(Path.cwd(),'restore record display',{},None)",
    "o._oracle(Path.cwd(),'synthetic-tree',[],{},None)",
    "print(json.dumps(prompts))"
  ].join("; ")], {cwd: root, encoding: "utf8"}));
  assert.equal(prompts.length, 2);
  for (const prompt of prompts) {
    assert.match(prompt, /Issue #0008/);
    assert.match(prompt, /Issue #0026/);
    assert.match(prompt, /tests\/lead-graph-regression\.test\.mjs/);
    assert.match(prompt, /published-client acceptance/i);
    assert.match(prompt, /plain-text node and edge labels/);
    assert.match(prompt, /escaped HTML/);
    assert.match(prompt, /advertised native inline/);
    assert.match(prompt, /unrendered Mermaid/);
    assert.match(prompt, /internal identifiers/);
  }
});

test("both actual Oracle prompts permit normal-plan reviews and retain the additional-spending gate", () => {
  const prompts = JSON.parse(execFileSync("python3", ["-c", [
    "import json",
    "from pathlib import Path",
    "import tools.oracle_approval as o",
    "o.selected_model=lambda:'synthetic-model'",
    "o.selected_reasoning_effort=lambda:None",
    "prompts=[]",
    "import tempfile",
    "native_run=tempfile.TemporaryDirectory()",
    "o._RUN.set(Path(native_run.name))",
    "o._atomic_write=lambda path,raw:path.write_bytes(raw)",
    "o._review_process=lambda root,prompt,prefix,**kwargs: prompts.append(prompt)",
    "o._proposal_oracle(Path.cwd(),'covered normal-plan review',{},None)",
    "o._oracle(Path.cwd(),'synthetic-tree',[],{},None)",
    "print(json.dumps(prompts))"
  ].join("; ")], {cwd: root, encoding: "utf8"}));
  assert.equal(prompts.length, 2);
  for (const raw of prompts) {
    const prompt = raw.replace(/\s+/g, " ");
    assert.ok(prompt.includes("proceed automatically without spending-approval questions or a separate $0 approval"));
    assert.ok(prompt.includes("A missing per-review price does not create an approval gate for covered normal-plan usage"));
    assert.ok(prompt.includes("Explicit owner spending approval remains required for additional monetary spending"));
    assert.ok(prompt.includes("paid API calls or credits outside the normal plan"));
    assert.ok(prompt.includes("unavailable included allowance authorizes no automatic paid fallback"));
    assert.ok(prompt.includes("Independent proposal, completed-diff, authentication and public API-version review requirements remain in force"));
  }
});

test("ordinary agents call the Oracle utility and cannot act as approver", () => {
  const agents = read("AGENTS.md");
  const implementation = read(".agents/skills/operations-center-implementation/SKILL.md");
  const review = read(".agents/skills/operations-center-review/SKILL.md");
  const oracle = read(".agents/skills/oracle/SKILL.md");
  const preCommit = read(".githooks/pre-commit");
  const prepareCommitMessage = read(".githooks/prepare-commit-msg");
  const commitMessage = read(".githooks/commit-msg");
  const workflow = read(".github/workflows/publication-safety.yml");
  const commandCoverage = read("tools/command_coverage.py");
  const oracleUtility = read("tools/oracle_approval.py");
  const oracleSchema = JSON.parse(read(".agents/skills/oracle/review-output.schema.json"));
  const packageManifest = JSON.parse(read("package.json"));

  assert.match(agents, /Ordinary agents never load or act as either Oracle/i);
  assert.match(agents, /npm run\s+oracle:review/i);
  assert.match(implementation, /Never load the Oracle skill directly/i);
  assert.match(review, /READINESS_PASS.*READINESS_FAIL/is);
  assert.doesNotMatch(review, /End with exactly one verdict: `APPROVED`/i);
  assert.match(oracle, /`REJECTED` blocks completion/i);
  assert.match(preCommit, /"git", "diff", "--cached", "--check"/);
  assert.doesNotMatch(preCommit, /verify-staged/);
  assert.doesNotMatch(prepareCommitMessage, /apply-trailers/);
  assert.match(commitMessage, /remove manual approval trailers/);
  assert.match(workflow, /VALIDATION_SOURCE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /python3 tools\/command_coverage\.py ci --candidate "\$VALIDATION_SOURCE_SHA"/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /permissions:\s+contents: read\s+statuses: read/);
  assert.match(commandCoverage, /approved = public_status\.verify_publication\(root, candidate, execute=execute\)/);
  assert.match(commandCoverage, /if digest:[\s\S]*REUSED_NATIVE_APPLICABILITY[\s\S]*else:[\s\S]*execute\(command\["command"\], cwd=root, check=True\)/);
  assert.match(oracleUtility, /"--ignore-user-config"/i);
  assert.match(oracleUtility, /vault_index\.py", "evidence", VAULT_QUERY/i);
  assert.match(oracleUtility, /vault-query\.json/i);
  assert.match(oracleUtility, /Technical approval never requires human deployment permission/i);
  assert.match(oracleUtility, /proposal-review/);
  assert.match(oracleUtility, /prior proposal review/i);
  assert.deepEqual(oracleSchema.properties.owner_approval_status.enum, ["NOT_REQUIRED", "APPROVED", "MISSING", "INVALID"]);
  assert.equal(packageManifest.scripts["oracle:review"], "python3 tools/oracle_approval.py review");
  assert.equal(packageManifest.scripts["oracle:proposal"], "python3 tools/oracle_approval.py proposal");
  assert.equal(packageManifest.scripts.prepare, "node scripts/install-git-hooks.mjs");
});

test("proposal review records scope without issuing a commit-acceptance receipt", () => {
  const workspace = mkdtempSync(join(tmpdir(), "boc-oracle-proposal-"));
  mkdirSync(join(workspace, "tools"));
  const git = (...args) => execFileSync("git", args, {cwd: workspace, encoding: "utf8"}).trim();
  git("init", "-q");
  git("config", "user.email", "oracle-test@example.invalid");
  git("config", "user.name", "Oracle Test");
  writeFileSync(join(workspace, "AGENTS.md"), "governed\n");
  writeFileSync(join(workspace, ".gitignore"), "__pycache__/\n*.pyc\n");
  copyOracleModules(workspace);
  git("add", ".");
  git("commit", "-qm", "initial");
  execFileSync("python3", ["-c", [
    "import tools.oracle_approval as o",
    "root=o.repository_root()",
    "review=lambda *a:{'verdict':'APPROVED','summary':'bounded restoration','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED','api_version_assessment':{'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None}}",
    "o.review_proposal(root,'Problem: broken\\nCause: regression\\nRecommended change: restore',[],None,review)",
  ].join("; ")], {cwd: workspace});
  assert.equal(existsSync(join(workspace, ".git", "oracle", "proposal.json")), true);
  assert.equal(existsSync(join(workspace, ".git", "oracle", "approval.json")), false);
});

test("completed review refuses a rejected proposal record", () => {
  const workspace = mkdtempSync(join(tmpdir(), "boc-oracle-rejected-proposal-"));
  mkdirSync(join(workspace, "tools"));
  const git = (...args) => execFileSync("git", args, {cwd: workspace, encoding: "utf8"}).trim();
  git("init", "-q");
  git("config", "user.email", "oracle-test@example.invalid");
  git("config", "user.name", "Oracle Test");
  writeFileSync(join(workspace, "AGENTS.md"), "governed\n");
  writeFileSync(join(workspace, ".gitignore"), "__pycache__/\n*.pyc\n");
  copyOracleModules(workspace);
  writeFileSync(join(workspace, "candidate.txt"), "initial\n");
  git("add", ".");
  git("commit", "-qm", "initial");
  writeFileSync(join(workspace, "candidate.txt"), "changed\n");
  git("add", "candidate.txt");
  execFileSync("python3", ["-c", "import tools.oracle_approval as o; o.review_proposal(o.repository_root(),'Problem: broken\\nCause: regression\\nRecommended change: restore',[],None,lambda *a:{'verdict':'REJECTED','summary':'outside scope','findings':[],'authentication_impact':'AUTHENTICATION','owner_approval_status':'MISSING','api_version_assessment':{'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None}})"], {cwd: workspace});
  const result = spawnSync("python3", ["-c", "import tools.oracle_approval as o; o.issue(o.repository_root(),[],None,lambda *a:{'verdict':'APPROVED','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED','api_version_assessment':{'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None}})"], {cwd: workspace, encoding: "utf8"});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /approved proposal/i);
});

test("Oracle receipt rejects stale state, forged trailers, and unstamped commits", () => {
  const workspace = mkdtempSync(join(tmpdir(), "boc-oracle-"));
  mkdirSync(join(workspace, "tools"));
  const git = (...args) => execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "oracle-test@example.invalid");
  git("config", "user.name", "Oracle Test");
  mkdirSync(join(workspace, ".agents", "skills", "oracle"), { recursive: true });
  writeFileSync(join(workspace, "AGENTS.md"), "governed\n");
  writeFileSync(join(workspace, ".agents", "skills", "oracle", "SKILL.md"), "oracle\n");
  writeFileSync(join(workspace, ".gitignore"), "__pycache__/\n*.pyc\n");
  copyOracleModules(workspace);
  writeFileSync(join(workspace, "candidate.txt"), "initial\n");
  git("add", ".");
  git("commit", "-qm", "initial");
  writeFileSync(join(workspace, "candidate.txt"), "approved\n");
  git("add", "candidate.txt");
  execFileSync("python3", ["-c", "import tools.oracle_approval as o; o.review_proposal(o.repository_root(),'Problem: broken\\nCause: regression\\nRecommended change: restore',[],None,lambda *a:{'verdict':'APPROVED','summary':'bounded restoration','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED','api_version_assessment':{'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None}})"], {cwd: workspace});
  const rejectedAuth = spawnSync("python3", ["-c", "import tools.oracle_approval as o; o.issue(o.repository_root(),[],None,lambda *a:{'verdict':'REJECTED','findings':[{'message':'owner approval missing'}],'authentication_impact':'AUTHENTICATION','owner_approval_status':'MISSING','api_version_assessment':{'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None}})"], { cwd: workspace, encoding: "utf8" });
  assert.notEqual(rejectedAuth.status, 0); assert.match(rejectedAuth.stderr, /rejected the candidate/i);
  execFileSync("python3", ["-c", "import tools.oracle_approval as o; o.issue(o.repository_root(),[],None,lambda *a:{'verdict':'APPROVED','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED','api_version_assessment':{'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None}})"], { cwd: workspace });
  writeFileSync(join(workspace, "candidate.txt"), "stale\n"); git("add", "candidate.txt");
  const stale = spawnSync("python3", ["tools/oracle_approval.py", "verify-staged"], { cwd: workspace, encoding: "utf8" });
  assert.notEqual(stale.status, 0); assert.match(stale.stderr, /stale/i);
  writeFileSync(join(workspace, "candidate.txt"), "approved\n"); git("add", "candidate.txt");
  const messagePath = join(workspace, ".git", "COMMIT_EDITMSG");
  writeFileSync(messagePath, "test: governed change\n\nOracle-Verdict: FORGED\n");
  execFileSync("python3", ["tools/oracle_approval.py", "apply-trailers", messagePath], { cwd: workspace });
  execFileSync("python3", ["tools/oracle_approval.py", "verify-message", messagePath], { cwd: workspace });
  const approvedMessage = readFileSync(messagePath, "utf8");
  writeFileSync(messagePath, approvedMessage.replace(/Oracle-Receipt-SHA256: [0-9a-f]+/, `Oracle-Receipt-SHA256: ${"0".repeat(64)}`));
  const forged = spawnSync("python3", ["tools/oracle_approval.py", "verify-message", messagePath], { cwd: workspace, encoding: "utf8" });
  assert.notEqual(forged.status, 0); assert.match(forged.stderr, /do not match/i);
  writeFileSync(messagePath, approvedMessage);
  git("commit", "-qF", messagePath);
  execFileSync("python3", ["tools/oracle_approval.py", "verify-commit", "HEAD"], { cwd: workspace });
  const approvedCommit = git("rev-parse", "HEAD");
  const initialCommit = git("rev-parse", "HEAD^");

  git("checkout", "-qb", "merge-base", initialCommit);
  git("commit", "--allow-empty", "-qm", "test: target advanced without tree change");
  git("merge", "--no-ff", "-qm", "test: accepted merge", approvedCommit);
  execFileSync("python3", ["tools/oracle_approval.py", "verify-commit", "HEAD"], { cwd: workspace });

  git("checkout", "-qb", "merge-conflict", initialCommit);
  writeFileSync(join(workspace, "base-only.txt"), "base changed\n"); git("add", "base-only.txt"); git("commit", "-qm", "test: target tree changed");
  git("merge", "--no-ff", "-qm", "test: changed merge", approvedCommit);
  const changedMerge = spawnSync("python3", ["tools/oracle_approval.py", "verify-commit", "HEAD"], { cwd: workspace, encoding: "utf8" });
  assert.notEqual(changedMerge.status, 0); assert.match(changedMerge.stderr, /differs from the Oracle-approved/i);

  writeFileSync(join(workspace, "unstamped.txt"), "unstamped\n"); git("add", "unstamped.txt");
  git("commit", "-qm", "test: unstamped");
  const unstamped = spawnSync("python3", ["tools/oracle_approval.py", "verify-commit", "HEAD"], { cwd: workspace, encoding: "utf8" });
  assert.notEqual(unstamped.status, 0); assert.match(unstamped.stderr, /no verified native approval/i);
});

test("Oracle owns indexed active and resolved issue history", {
  skip: !privateVaultAvailable,
}, () => {
  const oracle = read(".agents/skills/oracle/SKILL.md");
  const tracker = read("Vault/docs/issues/ISSUE_HISTORY.md");
  const conclusion = read("Vault/docs/issues/conclusions/ISSUE_0001_CONCLUSION.md");
  const schema = read("Vault/schemas/ISSUE_HISTORY_TEMPLATE.md");

  assert.match(oracle, /Issue-history ownership/i);
  assert.match(oracle, /tools\/vault_index\.py query/i);
  assert.match(tracker, /Issue #0001/i);
  assert.match(conclusion, /Root cause/i);
  assert.match(conclusion, /Prevention/i);
  assert.match(schema, /Preserve failed attempts/i);
});

test("repository-maintainer Oracle workflows are absent from generated clients", () => {
  const generatedSkillRoots = [
    "clients/codex/plugins/bos/skills",
    "clients/claude/plugins/bos/skills",
    "clients/copilot/products/bos/skills",
    "clients/gemini/extensions/bos/skills",
  ];
  const localSkills = [
    "oracle",
    "operations-center-implementation",
    "operations-center-planning",
    "operations-center-review",
  ];

  for (const rootPath of generatedSkillRoots) {
    for (const skill of localSkills) {
      assert.equal(existsSync(new URL(`${rootPath}/${skill}`, root)), false);
    }
  }
});
