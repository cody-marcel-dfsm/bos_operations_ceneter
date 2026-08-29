import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { rm } from "node:fs/promises";
import { inspectGeminiRuntime } from "./verify-gemini-runtime.mjs";
import { activeClientProducts } from "./lib/client-runtime-verification.mjs";
import { pathExists, readJson, root, stableJson } from "./lib/package-model.mjs";

const execFileAsync = promisify(execFile);
export const GEMINI_CLEAN_CONFIRMATION = "DELETE ALL BOS GEMINI EXTENSION STATE";

export async function cleanInstallGemini({
  confirmation,
  home = homedir(),
  base = root,
  runCommand = execFileAsync,
  inspect = inspectGeminiRuntime
} = {}) {
  if (confirmation !== GEMINI_CLEAN_CONFIRMATION) {
    throw new Error(`Confirmation must equal: ${GEMINI_CLEAN_CONFIRMATION}`);
  }
  await runCommand("gemini", ["--version"]);
  const products = await activeClientProducts("gemini");
  const actions = [];
  for (const product of products) {
    const installed = join(home, ".gemini", "extensions", product.name);
    const installedExists = await pathExists(installed);
    if (installedExists) {
      const metadata = await readJson(join(installed, ".bos-product.json"));
      if (metadata.name !== product.name || metadata.client !== "gemini") {
        throw new Error(`Refusing to remove mismatched Gemini extension: ${installed}`);
      }
    }
    if (installedExists) {
      await runCommand("gemini", ["extensions", "uninstall", product.name]);
      actions.push(`uninstalled_extension:${product.name}`);
    }
    if (await pathExists(installed)) {
      await rm(installed, { recursive: true, force: true });
      actions.push(`removed_residual:${installed}`);
    }
  }
  for (const product of products) {
    const source = join(base, "clients", "gemini", "extensions", product.name);
    await runCommand("gemini", ["extensions", "install", source]);
    actions.push(`installed_extension:${product.name}`);
  }
  const verification = await inspect({ home, base });
  if (!verification.ok) {
    throw new Error(`Gemini post-install verification failed:\n${verification.failures.join("\n")}`);
  }
  return {
    schema_version: "1",
    ok: true,
    actions,
    next_action: "Restart Gemini CLI, authenticate platform, and run npm run install:verify:gemini-runtime."
  };
}

async function main() {
  const args = process.argv.slice(2);
  const confirmationIndex = args.indexOf("--confirmation");
  const homeIndex = args.indexOf("--home");
  const report = await cleanInstallGemini({
    confirmation: confirmationIndex >= 0 ? args[confirmationIndex + 1] : undefined,
    home: homeIndex >= 0 ? resolve(args[homeIndex + 1]) : homedir()
  });
  if (args.includes("--json")) process.stdout.write(stableJson(report));
  else for (const action of report.actions) console.log(action);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
