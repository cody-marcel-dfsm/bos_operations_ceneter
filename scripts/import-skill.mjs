import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fetchPinnedGitSkills, materializeSkillImport, validateImportPin } from "./lib/skill-import.mjs";

const exec = promisify(execFile);
export function parseImportArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!["--repository", "--commit", "--release", "--skill", "--target"].includes(key) || options[key] || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Invalid or duplicate import argument: ${key}`);
    options[key] = args[i + 1];
  }
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)@(.+)$/.exec(options["--skill"] ?? "");
  if (!match || !options["--target"]) throw new Error("Required: --repository HTTPS_URL --commit FULL_SHA --release x.y.z --skill name@x.y.z --target source/imports/name");
  const pin = { repository: options["--repository"], commit: options["--commit"], release: options["--release"], skill: match[1], version: match[2] };
  validateImportPin(pin);
  return { pin, target: resolve(options["--target"]) };
}

export async function importSkillCommand(args) {
  const { pin, target } = parseImportArguments(args);
  const repositoryRoot = (await exec("git", ["rev-parse", "--show-toplevel"])).stdout.trim();
  if ((await exec("git", ["branch", "--show-current"])).stdout.trim() !== "main" || !(await lstat(join(repositoryRoot, ".git"))).isDirectory()) throw new Error("Run imports from the destination's canonical main checkout; Git worktrees are unsupported");
  const release = await fetchPinnedGitSkills(pin, { temporaryRoot: join(repositoryRoot, "Vault/tmp/skill-import/objects") });
  return materializeSkillImport(release, { repositoryRoot, target });
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try { const result = await importSkillCommand(process.argv.slice(2)); console.log(JSON.stringify({ status: result.status, target: result.target, pin: result.receipt.pin }, null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
