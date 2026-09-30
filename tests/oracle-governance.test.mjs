import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const privateVaultAvailable = existsSync(new URL("Vault/docs/architecture.md", root));

test("ordinary agents call the Oracle utility and cannot act as approver", () => {
  const agents = read("AGENTS.md");
  const implementation = read(".agents/skills/operations-center-implementation/SKILL.md");
  const review = read(".agents/skills/operations-center-review/SKILL.md");
  const oracle = read(".agents/skills/oracle/SKILL.md");
  const preCommit = read(".githooks/pre-commit");
  const prepareCommitMessage = read(".githooks/prepare-commit-msg");
  const commitMessage = read(".githooks/commit-msg");
  const workflow = read(".github/workflows/publication-safety.yml");
  const oracleUtility = read("tools/oracle_approval.py");
  const oracleSchema = JSON.parse(read(".agents/skills/oracle/review-output.schema.json"));
  const packageManifest = JSON.parse(read("package.json"));

  assert.match(agents, /Ordinary agents never load or act as either Oracle/i);
  assert.match(agents, /npm run\s+oracle:review/i);
  assert.match(implementation, /Never load the Oracle skill directly/i);
  assert.match(review, /READINESS_PASS.*READINESS_FAIL/is);
  assert.doesNotMatch(review, /End with exactly one verdict: `APPROVED`/i);
  assert.match(oracle, /`REJECTED` blocks completion/i);
  assert.match(preCommit, /oracle_approval\.py.*verify-staged/s);
  assert.match(prepareCommitMessage, /oracle_approval\.py.*apply-trailers/s);
  assert.match(commitMessage, /oracle_approval\.py.*verify-message/s);
  assert.match(workflow, /pull_request[\s\S]*verify-commit\s+"\$\{\{ github\.sha \}\}"/i);
  assert.match(workflow, /else[\s\S]*verify-range/i);
  assert.match(oracleUtility, /"--ignore-user-config"/i);
  assert.match(oracleUtility, /vault_index\.py", "sync", "--quiet"/i);
  assert.match(oracleUtility, /vault-query\.json/i);
  assert.match(oracleUtility, /A REJECTED authentication review may report APPROVED, MISSING, or INVALID/i);
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
  writeFileSync(join(workspace, "tools", "oracle_approval.py"), read("tools/oracle_approval.py"));
  writeFileSync(join(workspace, "tools", "codex_child_model.py"), read("tools/codex_child_model.py"));
  git("add", ".");
  git("commit", "-qm", "initial");
  execFileSync("python3", ["-c", [
    "import tools.oracle_approval as o",
    "root=o.repository_root()",
    "review=lambda *a:{'verdict':'APPROVED','summary':'bounded restoration','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED'}",
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
  writeFileSync(join(workspace, "tools", "oracle_approval.py"), read("tools/oracle_approval.py"));
  writeFileSync(join(workspace, "tools", "codex_child_model.py"), read("tools/codex_child_model.py"));
  writeFileSync(join(workspace, "candidate.txt"), "initial\n");
  git("add", ".");
  git("commit", "-qm", "initial");
  writeFileSync(join(workspace, "candidate.txt"), "changed\n");
  git("add", "candidate.txt");
  execFileSync("python3", ["-c", "import tools.oracle_approval as o; o.review_proposal(o.repository_root(),'Problem: broken\\nCause: regression\\nRecommended change: restore',[],None,lambda *a:{'verdict':'REJECTED','summary':'outside scope','findings':[],'authentication_impact':'AUTHENTICATION','owner_approval_status':'MISSING'})"], {cwd: workspace});
  const result = spawnSync("python3", ["-c", "import tools.oracle_approval as o; o.issue(o.repository_root(),[],None,lambda *a:{'verdict':'APPROVED','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED'})"], {cwd: workspace, encoding: "utf8"});
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
  writeFileSync(join(workspace, "tools", "oracle_approval.py"), read("tools/oracle_approval.py"));
  writeFileSync(join(workspace, "tools", "codex_child_model.py"), read("tools/codex_child_model.py"));
  writeFileSync(join(workspace, "candidate.txt"), "initial\n");
  git("add", ".");
  git("commit", "-qm", "initial");
  writeFileSync(join(workspace, "candidate.txt"), "approved\n");
  git("add", "candidate.txt");
  execFileSync("python3", ["-c", "import tools.oracle_approval as o; o.review_proposal(o.repository_root(),'Problem: broken\\nCause: regression\\nRecommended change: restore',[],None,lambda *a:{'verdict':'APPROVED','summary':'bounded restoration','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED'})"], {cwd: workspace});
  const rejectedAuth = spawnSync("python3", ["-c", "import tools.oracle_approval as o; o.issue(o.repository_root(),[],None,lambda *a:{'verdict':'REJECTED','findings':[{'message':'owner approval missing'}],'authentication_impact':'AUTHENTICATION','owner_approval_status':'MISSING'})"], { cwd: workspace, encoding: "utf8" });
  assert.notEqual(rejectedAuth.status, 0); assert.match(rejectedAuth.stderr, /rejected the candidate/i);
  execFileSync("python3", ["-c", "import tools.oracle_approval as o; o.issue(o.repository_root(),[],None,lambda *a:{'verdict':'APPROVED','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED'})"], { cwd: workspace });
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
  assert.notEqual(unstamped.status, 0); assert.match(unstamped.stderr, /invalid Oracle-Verdict trailer/i);
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
