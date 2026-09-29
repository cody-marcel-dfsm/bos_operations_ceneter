import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CLAUDE_CLEAN_CONFIRMATION, cleanInstallClaude } from "../scripts/clean-install-claude.mjs";
import { GEMINI_CLEAN_CONFIRMATION, cleanInstallGemini } from "../scripts/clean-install-gemini.mjs";
import { pathExists, root } from "../scripts/lib/package-model.mjs";

async function temporaryHome(context, prefix) {
  const home = await mkdtemp(join(tmpdir(), prefix));
  context.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

async function seedGeminiMyCrm(home) {
  const installed = join(home, ".gemini", "extensions", "my-crm");
  for (const skill of ["my-crm-record-operations", "my-crm-customer-journey"]) {
    await mkdir(join(installed, "skills", skill), { recursive: true });
    await writeFile(join(installed, "skills", skill, "SKILL.md"), `---\nname: ${skill}\n---\n`);
  }
  await writeFile(join(installed, ".bos-product.json"), JSON.stringify({
    name: "my-crm",
    version: "0.2.26",
    runtime_verification_tools: [
      "lead_director_create_lead",
      "lead_director_search_leads",
      "lead_director_update_lead",
      "lead_director_get_customer_journey"
    ]
  }));
}

test("Claude clean installer removes only validated BOS cache and reinstalls both products", async (context) => {
  const home = await temporaryHome(context, "bos-claude-clean-");
  const cache = join(home, ".claude", "plugins", "cache", "bos-education-center");
  for (const product of ["bos", "education-center"]) {
    const version = join(cache, product, "0.4.50");
    await mkdir(version, { recursive: true });
    await writeFile(join(version, ".bos-product.json"), JSON.stringify({ name: product, client: "claude" }));
  }
  const calls = [];
  const runCommand = async (_command, args) => {
    calls.push(args);
    if (args.join(" ") === "plugin list --json") return { stdout: "[]" };
    if (args.join(" ") === "plugin marketplace list --json") {
      return { stdout: JSON.stringify([{ name: "bos-education-center" }]) };
    }
    return { stdout: "" };
  };
  const installed = [];
  const report = await cleanInstallClaude({
    confirmation: CLAUDE_CLEAN_CONFIRMATION,
    home,
    runCommand,
    install: async ({ product }) => installed.push(product)
  });
  assert.equal(report.ok, true);
  assert.equal(await pathExists(cache), false);
  assert.deepEqual(installed, ["bos", "education-center"]);
  assert(calls.some((args) => args.join(" ") === "plugin marketplace remove bos-education-center --scope user"));
});

test("Gemini clean installer removes residual copies and verifies native reinstall", async (context) => {
  const home = await temporaryHome(context, "bos-gemini-clean-");
  await seedGeminiMyCrm(home);
  for (const product of ["bos", "education-center"]) {
    const installed = join(home, ".gemini", "extensions", product);
    await mkdir(installed, { recursive: true });
    await writeFile(join(installed, ".bos-product.json"), JSON.stringify({ name: product, client: "gemini" }));
  }
  const calls = [];
  const runCommand = async (_command, args) => {
    calls.push(args);
    if (args[0] === "extensions" && args[1] === "list") {
      return { stdout: JSON.stringify({
        extensions: [{
          name: "my-crm",
          isActive: true,
          path: join(home, ".gemini", "extensions", "my-crm")
        }]
      }) };
    }
    if (args[1] === "install") {
      const source = args[2];
      const product = source.split("/").at(-1);
      const installed = join(home, ".gemini", "extensions", product);
      await cp(source, installed, { recursive: true });
      await writeFile(join(installed, ".gemini-extension-install.json"), JSON.stringify({ type: "link" }));
    }
    return { stdout: "" };
  };
  const report = await cleanInstallGemini({
    confirmation: GEMINI_CLEAN_CONFIRMATION,
    home,
    runCommand
  });
  assert.equal(report.ok, true);
  assert.equal(calls.filter((args) => args[1] === "uninstall").length, 2);
  assert.equal(calls.filter((args) => args[1] === "install").length, 2);
  assert(calls.some((args) => args.join(" ") === "extensions list --output-format json"));
});

test("Gemini clean installer verifies the CLI before deleting installed state", async (context) => {
  const home = await temporaryHome(context, "bos-gemini-preflight-");
  const installed = join(home, ".gemini", "extensions", "bos");
  await mkdir(installed, { recursive: true });
  await writeFile(join(installed, ".bos-product.json"), JSON.stringify({ name: "bos", client: "gemini" }));
  await assert.rejects(
    cleanInstallGemini({
      confirmation: GEMINI_CLEAN_CONFIRMATION,
      home,
      runCommand: async () => { throw new Error("gemini missing"); }
    }),
    /gemini missing/
  );
  assert.equal(await pathExists(installed), true);
});
