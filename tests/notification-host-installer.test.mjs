import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, realpath, cp, writeFile, readFile, chmod, mkdir, rm, lstat} from "node:fs/promises";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";
import {planNotificationHost, installNotificationHost, verifyNotificationHost, recordNotificationHook,
  retireNotificationHost} from "../scripts/install-notification-host.mjs";
import {NotificationHostError} from "../source/host-runtime/bos-journey-notifications/protected-files.mjs";
import {acquireCompanionLease, callCompanion} from "../source/host-runtime/bos-journey-notifications/muse-companion-host.mjs";
import {notificationFixture} from "./helpers/synthetic-notifications.mjs";

const project = fileURLToPath(new URL("..", import.meta.url));
const git = (root, ...args) => execFileSync("git", ["-C", root, "-c", "user.name=Synthetic installer", "-c", "user.email=installer@example.invalid", ...args], {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
function ownedChild(children,args){
  const child=spawn(process.execPath,args,{stdio:["pipe","pipe","pipe"]});
  const state={child,stdout:"",stderr:"",closed:false,error:null,code:null,signal:null};children.push(state);
  child.stdout.on("data",data=>{state.stdout+=data;});child.stderr.on("data",data=>{state.stderr+=data;});
  child.on("error",error=>{state.error=error.code??error.name;});
  child.stdin.on("error",error=>{state.error??=error.code??error.name;});
  state.done=new Promise(resolve=>child.once("close",(code,signal)=>{state.closed=true;state.code=code;state.signal=signal;resolve(code);}));
  const diagnostic=()=>JSON.stringify({code:state.code,signal:state.signal,error:state.error,stderr:state.stderr.slice(0,2000)});
  state.ready=async()=>{
    for(let count=0;count<200;count++){
      const lines=state.stdout.split("\n").slice(0,-1);
      if(lines.some(line=>{try{return JSON.parse(line).started===true;}catch{return false;}}))return;
      if(state.closed||state.error)throw new Error("Installed host exited before readiness: "+diagnostic());
      await delay(10);
    }
    throw new Error("Installed host did not publish readiness within the original200x10ms wait: "+diagnostic());
  };
  const waitClose=async()=>{let timer;try{await Promise.race([state.done,new Promise(resolve=>{timer=setTimeout(resolve,5000);timer.unref?.();})]);}finally{clearTimeout(timer);}};
  state.stop=async()=>{if(state.closed)return;child.kill("SIGTERM");await waitClose();if(!state.closed){child.kill("SIGKILL");await waitClose();}assert.ok(state.closed,"Owned installed host did not close after termination");};
  return state;
}
test("immutable published host closure installs atomically, verifies modes and preserves native lifecycle custody", async t => {
  const temporary = await realpath(await mkdtemp(join(await realpath("Vault/tmp"), "n"))),children=[];
  t.after(async()=>{const outcomes=await Promise.allSettled(children.map(child=>child.stop()));const failure=outcomes.find(row=>row.status==="rejected");if(failure)throw failure.reason;await rm(temporary,{recursive:true,force:true});});
  const source = join(temporary, "source"), root = temporary; await mkdir(source, {mode: 0o700});
  for (const name of ["source/host-runtime/bos-journey-notifications", "source/host-runtime/bos-shared-cache",
    "source/platform/bos-workflow-orchestrator/scripts", "source/platform/bos-app-discovery/scripts",
    "source/platform/bos-external-dependency-adapter/scripts", "source/platform/submit-feedback/scripts", "source/platform/ada/scripts"]) {
    await mkdir(join(source, name, ".."), {recursive: true});
    await cp(join(project, name), join(source, name), {recursive: true});
  }
  await mkdir(join(source, "scripts"), {mode: 0o700});
  await cp(join(project, "scripts/install-notification-host.mjs"), join(source, "scripts/install-notification-host.mjs"));
  await writeFile(join(source, "package.json"), JSON.stringify({name: "synthetic-host-fixture", version: "0.4.203", type: "module"}));
  git(source, "init", "--initial-branch=main"); git(source, "add", "."); git(source, "commit", "-m", "Synthetic source fixture");
  const revision = git(source, "rev-parse", "HEAD");
  await assert.rejects(planNotificationHost({sourceRoot: source, revision}), NotificationHostError);
  git(source, "update-ref", "refs/remotes/origin/main", revision);
  const plan = await planNotificationHost({sourceRoot: source, revision});
  assert.ok(plan.files.length >= 12); assert.ok(plan.files.every(file => !file.path.includes("Vault") && !file.path.includes("clients/")));
  assert.ok(plan.files.some(file => file.path.endsWith("muse-hook.sh") && file.mode === 0o755));
  const install = await installNotificationHost({sourceRoot: source, root, revision});
  assert.equal(install.native_hook_installed, false); assert.equal(install.version, "0.4.203");
  const destination = join(root, "releases", revision);
  assert.deepEqual(await verifyNotificationHost(destination), plan);
  assert.equal((await lstat(root)).mode & 0o777, 0o700);
  assert.equal((await lstat(join(root, "active.json"))).mode & 0o777, 0o600);
  const observation = enabled => ({id: "synthetic-hook", enabled, version: 1, script_path: install.hook_path, observed_at: new Date().toISOString(),
    poll_interval_secs: 5, script_timeout_secs: 60, prompt: install.hook_definition_plan.prompt, delivery: {surface: "main"}});
  assert.equal((await recordNotificationHook({root, observation: observation(true)})).enabled, true);
  await assert.rejects(installNotificationHost({sourceRoot: source, root, revision}), NotificationHostError);
  // This exercises the actual installed entrypoint/lease/IPC/stdin boundary. The
  // selected loopback port has no service; it proves no authenticated SSE/wake.
  const credential = join(root, "existing-credential"), context = "bos_ctx_v2_" + "2".repeat(64);
  await writeFile(credential, "synthetic-existing-key", {mode: 0o600});
  const monitor=ownedChild(children,[join(destination, "source/host-runtime/bos-journey-notifications/muse-companion-cli.mjs"),
    "monitor", "--root", root, "--credential-file", credential]);
  monitor.child.stdin.end(JSON.stringify({origin: "https://127.0.0.1:9", contextHandle: context, sourceContract: notificationFixture().contract,
    identities: ["synthetic-journey"], taskIntent: "Continue the synthetic task through fresh state.", lifetimeMs: 30000, intentConfirmed: true}));
  await monitor.ready();
  try {
    assert.equal((await callCompanion(join(root, "run", "control.json"), "poll")).pending, false);
    assert.equal((await callCompanion(join(root, "run", "control.json"), "retire")).retired, true);
  } catch (error) {
    await delay(50); throw new Error("Synthetic installed monitor readback failed: " + error.reason + "; " + monitor.stderr);
  }
  assert.equal(await monitor.done, 0, monitor.stderr); assert.ok(!monitor.stdout.includes(context)); assert.ok(!monitor.stdout.includes("synthetic-existing-key"));
  const release = await acquireCompanionLease(join(root, "run"));
  await assert.rejects(installNotificationHost({sourceRoot: source, root, revision, observedHook: observation(false)}), NotificationHostError);
  await release();
  const name = plan.files.find(file => file.path.endsWith("notification-host.mjs")).path;
  const original = await readFile(join(destination, name));
  await writeFile(join(destination, name), "changed");
  await assert.rejects(verifyNotificationHost(destination), NotificationHostError);
  await writeFile(join(destination, name), original);
  await writeFile(join(destination, "unknown-file"), "preserve");
  await assert.rejects(verifyNotificationHost(destination), NotificationHostError);
  assert.equal(await readFile(join(destination, "unknown-file"), "utf8"), "preserve"); await rm(join(destination, "unknown-file"));
  await chmod(join(destination, name), 0o600); await assert.rejects(verifyNotificationHost(destination), NotificationHostError);
  await chmod(join(destination, name), 0o644);
  const changedSource = join(source, name); await writeFile(changedSource, Buffer.concat([original, Buffer.from("\n// Synthetic revision change\n")]));
  git(source, "add", name); git(source, "commit", "-m", "Synthetic upgrade");
  const next = git(source, "rev-parse", "HEAD"); git(source, "update-ref", "refs/remotes/origin/main", next);
  const upgraded = await installNotificationHost({sourceRoot: source, root, revision: next, observedHook: observation(false)});
  assert.equal(upgraded.revision, next); assert.ok(await verifyNotificationHost(destination));
  assert.ok(await verifyNotificationHost(join(root, "releases", next)));
  // Rollback consumes the same published bytes and an inactive lease; no files are patched.
  // The source checkout must match its selected immutable revision.
  git(source, "checkout", "--detach", revision);
  await installNotificationHost({sourceRoot: source, root, revision});
  await recordNotificationHook({root, observation: observation(false)});
  await retireNotificationHost({root, observedHook: observation(false)});
  assert.equal(JSON.parse(await readFile(join(root, "active.json"))).status, "retired");
  assert.ok(await verifyNotificationHost(destination));
  const discussion=await installNotificationHost({sourceRoot:source,root,revision,observedHook:observation(false),mode:"feedback"});
  assert.equal(discussion.native_hook_installed,false);
  assert.equal(discussion.hook_definition_plan.initial_state,"disabled");
  const selected=JSON.parse(await readFile(join(root,"active.json")));
  assert.equal(selected.mode,"feedback");assert.equal(selected.hook,null);
  assert(discussion.hook_definition_plan.prompt.includes("worker-comment"));
  const immutable=await verifyNotificationHost(destination);
  for(const suffix of ["vendor/ws.bundle.mjs","vendor/WS-LICENSE.txt","vendor/ws.provenance.json","feedback-discussion-host.mjs"]){
    assert(immutable.files.some(row=>row.path.endsWith(suffix)));
  }
  // The previous journey prompt is insufficient for the new fixed item mode.
  await assert.rejects(recordNotificationHook({root,observation:observation(true)}),NotificationHostError);
  const disabled=ownedChild(children,[join(destination,"source/host-runtime/bos-journey-notifications/muse-companion-cli.mjs"),
    "discussion-monitor","--root",root,"--credential-file",credential]);
  disabled.child.stdin.end("{}");assert.equal(await disabled.done,1);
  const own=await installNotificationHost({sourceRoot:source,root,revision,mode:"onboarding"});
  assert.equal(own.hook_definition_plan.initial_state,"disabled");
  assert.match(own.hook_definition_plan.prompt,/metadata-only/u);
  assert.equal(JSON.parse(await readFile(join(root,"active.json"))).hook,null);
  assert(immutable.files.some(row=>row.path.endsWith("customer-onboarding-host.mjs")));
  assert(immutable.files.some(row=>row.path.endsWith("ada/scripts/customer-onboarding.mjs")));
  await assert.rejects(recordNotificationHook({root,observation:observation(true)}),NotificationHostError);
  await recordNotificationHook({root,observation:{...observation(true),prompt:own.hook_definition_plan.prompt}});
  const onboarding=ownedChild(children,[join(destination,"source/host-runtime/bos-journey-notifications/muse-companion-cli.mjs"),
    "onboarding-monitor","--root",root,"--credential-file",credential]);
  onboarding.child.stdin.end(JSON.stringify({protectedResource:"https://127.0.0.1:9/mcp/apps/bos/platform",taskIntent:"Inspect synthetic own onboarding",lifetimeMs:30000,intentConfirmed:true}));
  await onboarding.ready();
  assert.equal((await callCompanion(join(root,"run","control.json"),"onboarding-read",{payload:{}})).available,false);
  assert.equal((await callCompanion(join(root,"run","control.json"),"poll")).pending,false);
  await callCompanion(join(root,"run","control.json"),"retire");assert.equal(await onboarding.done,0,onboarding.stderr);
  assert(!onboarding.stdout.includes("synthetic-existing-key"));
  const vendor=join(destination,"source/host-runtime/bos-journey-notifications/vendor/ws.bundle.mjs");
  const vendorBytes=await readFile(vendor);await writeFile(vendor,"changed vendor");
  await assert.rejects(verifyNotificationHost(destination),NotificationHostError);await writeFile(vendor,vendorBytes);
});
