import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {assertValidationContinuity} from "./helpers/native-validation-state.mjs";
import { isolatedTestCohort } from "./helpers/isolated-test-cohort.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const discovery = String.raw`
import hashlib,importlib,json,pathlib,platform,stat,subprocess,sys,unittest
sys.path.insert(0,'tests')
module=importlib.import_module('oracle_parallel_test')
from tools import oracle_approval as oracle
classes=('ParallelReview','CriterionDependencyRoles','RawObservationCriterion','JournalIntegrationConflict')
assert not any(hasattr(module,name) for name in ('setUpModule','tearDownModule'))
actual=sorted(name for name,value in vars(module).items() if isinstance(value,type) and issubclass(value,unittest.TestCase) and value.__module__==module.__name__)
assert actual==sorted(classes)
loader=unittest.TestLoader()
def ids(suite):
 result=[]
 for item in suite:
  result.extend(ids(item) if isinstance(item,unittest.TestSuite) else [item.id()])
 return result
units={}
for name in classes:
 cls=getattr(module,name)
 assert cls.setUpClass.__func__ is unittest.TestCase.setUpClass.__func__
 assert cls.tearDownClass.__func__ is unittest.TestCase.tearDownClass.__func__
 members=ids(loader.loadTestsFromTestCase(cls))
 if name=='ParallelReview': units[module.__name__+'.'+name]=members
 else:
  for member in members: units[member]=[member]
full=ids(loader.loadTestsFromModule(module))
assert len(full)==46 and len(set(full))==46 and sorted(full)==sorted(member for members in units.values() for member in members)
assert [len(ids(loader.loadTestsFromTestCase(getattr(module,name)))) for name in classes]==[34,3,7,2]
paths=sorted(set(oracle.REVIEW_POLICY_MODULES)|{'tests/oracle_parallel_test.py','tests/oracle_review_series.py','tests/oracle-parallel.test.mjs','tests/helpers/isolated-test-cohort.mjs','tests/helpers/native-validation-state.mjs','.agents/skills/oracle/review-output.schema.json'})
hashes={}
modes={}
for name in paths:
 path=pathlib.Path(name);fact=path.lstat()
 assert stat.S_ISREG(fact.st_mode) and not path.is_symlink(),'Discovery requires regular source: '+name
 raw=path.read_bytes()
 mode=subprocess.check_output(['git','ls-tree','-z','HEAD','--',name]).split(b' ',1)[0].decode()
 assert mode==('100755' if fact.st_mode&0o111 else '100644'),'Discovery mode differs from committed source: '+name
 modes[name]=mode
 assert raw==subprocess.check_output(['git','show','HEAD:'+name]),'Discovery source differs from committed content: '+name
 hashes[name]=hashlib.sha256(raw).hexdigest()
print(json.dumps({'ids':full,'units':units,'source_sha256':hashes,'source_modes':modes,'runtime':{'executable':sys.executable,'version':sys.version,'platform':platform.platform()},'commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()}))
`;

const execute = String.raw`
import json,os,pathlib,sys,time,unittest
sys.path.insert(0,'tests')
name,report_path=sys.argv[1:]
class Result(unittest.TextTestResult):
 def __init__(self,*args,**kwargs):
  super().__init__(*args,**kwargs);self.executed=[];self.passed=[];self.spans=[]
 def startTest(self,case):
  self.executed.append(case.id());self.spans.append({'id':case.id(),'started_ms':time.monotonic()*1000});super().startTest(case)
 def stopTest(self,case):
  self.spans[-1]['finished_ms']=time.monotonic()*1000;super().stopTest(case)
 def addSuccess(self,case):
  self.passed.append(case.id());super().addSuccess(case)
result=unittest.TextTestRunner(verbosity=2,resultclass=Result).run(unittest.defaultTestLoader.loadTestsFromName(name))
report={'unit':name,'pid':os.getpid(),'executable':sys.executable,'version':sys.version,
 'executed':result.executed,'passed':result.passed,'tests_run':result.testsRun,'spans':result.spans,
 'failures':[case.id() for case,_ in result.failures],'errors':[case.id() for case,_ in result.errors],
 'skips':[{'id':case.id(),'reason':reason} for case,reason in result.skipped],
 'expected_failures':[case.id() for case,_ in result.expectedFailures],
 'unexpected_successes':[case.id() for case in result.unexpectedSuccesses]}
pathlib.Path(report_path).write_text(json.dumps(report))
sys.exit(0 if result.wasSuccessful() else 1)
`;

test("native independent review cohorts preserve bindings and overlap", async () => {
  const discover = () => JSON.parse(execFileSync("python3", ["-B", "-c", discovery], {
    cwd: root, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024,
  }));
  const inventory = discover();
  const scratch = join(root, "Vault/tmp");
  await mkdir(scratch, { recursive: true });
  const temporary = await mkdtemp(join(scratch, "oracle-parallel-wrapper-"));
  await chmod(temporary, 0o700);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGTERM", cancel);
  process.once("SIGINT", cancel);
  try {
    const jobs = await Promise.all(Object.keys(inventory.units).map(async (name, index) => {
      const directory = join(temporary, String(index));
      await mkdir(directory, { mode: 0o700 });
      return { name, command: inventory.runtime.executable,
        args: ["-B", "-c", execute, name, join(directory, "result.json")],
        cwd: root, env: { ...process.env, TMPDIR: directory } };
    }));
    const results = await isolatedTestCohort(jobs, { concurrency: 3, captureBytes: true,
      outputLimit: 8 * 1024 * 1024, timeoutMs: 300000, signal: controller.signal }).completion;
    const reports = [];
    const problems = [];
    for (const [index, result] of results.entries()) {
      let report = null;
      try { report = JSON.parse(await readFile(join(temporary, String(index), "result.json"), "utf8")); }
      catch (error) { problems.push(`${result.name}: missing or malformed actual result (${error.code ?? error.name})`); }
      console.log(`BOC_ORACLE_UNIT ${JSON.stringify({ unit: result.name, code: result.code, signal: result.signal,
        error: result.error, cancelled: result.cancelled, report,
        stdout: { sha256: digest(result.stdoutBytes), bytes: result.stdoutBytes.length, base64: result.stdoutBytes.toString("base64") },
        stderr: { sha256: digest(result.stderrBytes), bytes: result.stderrBytes.length, base64: result.stderrBytes.toString("base64") } })}`);
      if (result.code !== 0 || result.signal || result.error || result.cancelled)
        problems.push(`${result.name}: process failed`);
      if (report) {
        reports.push(report);
        const expected = inventory.units[result.name];
        try {
          assert.equal(report.unit, result.name);
          assert.deepEqual(report.executed, expected);
          assert.deepEqual(report.passed, expected);
          assert.equal(report.tests_run, expected.length);
          for (const key of ["failures", "errors", "skips", "expected_failures", "unexpected_successes"])
            assert.deepEqual(report[key], []);
          assert.match(result.stderrBytes.toString("utf8"), new RegExp(`\\nRan ${expected.length} tests? in [0-9.]+s\\n\\nOK\\s*$`, "u"));
          assert.equal(report.executable, inventory.runtime.executable);
          assert.equal(report.version, inventory.runtime.version);
          assert.deepEqual(report.spans.map(span => span.id), expected);
          assert.ok(report.spans.every(span => Number.isFinite(span.started_ms) && Number.isFinite(span.finished_ms) && span.finished_ms > span.started_ms));
        } catch (error) { problems.push(`${result.name}: ${error.message}`); }
      }
    }
    const executed = reports.flatMap(report => report.executed);
    if (executed.length !== 46 || new Set(executed).size !== 46 ||
      JSON.stringify([...executed].sort()) !== JSON.stringify([...inventory.ids].sort()))
      problems.push("Complete discovered 46-case membership was not executed exactly once");
    for (const [name, hash] of Object.entries(inventory.source_sha256)) {
      if (digest(await readFile(join(root, name))) !== hash) problems.push(`Source moved: ${name}`);
    }
    const current=discover();
    const currentCommit=current.commit;
    try {assertValidationContinuity(inventory,current);}
    catch(error){problems.push("Discovery/source/runtime identity changed: "+error.message);}
    const events = reports.flatMap(report => report.spans.flatMap(span => [[span.started_ms, 1], [span.finished_ms, -1]]))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let active = 0;
    let peak = 0;
    for (const [, change] of events) { active += change; peak = Math.max(peak, active); }
    if (active !== 0 || peak < 2 || peak > 3) problems.push("Actual independent case overlap exceeded or missed the bounded pool");
    if (new Set(reports.map(report => report.pid)).size !== jobs.length) problems.push("Each unit requires an independent process");
    console.log(`BOC_ORACLE_MEMBERSHIP ${JSON.stringify({ ...inventory, concurrency: 3,
      executed, peak, current_commit: currentCommit, temporary_directory_sha256: digest(Buffer.from(temporary)),
      node: { executable: process.execPath, version: process.version }, problems })}`);
    assert.deepEqual(problems, []);
  } finally {
    process.removeListener("SIGTERM", cancel);
    process.removeListener("SIGINT", cancel);
    await rm(temporary, { recursive: true, force: true });
  }
});
