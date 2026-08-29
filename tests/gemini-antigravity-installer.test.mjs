import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(repositoryRoot, "scripts", "clean-install-antigravity.sh");
const confirmationPhrase = "DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS";

function runScript(scriptPath, { cwd, home, confirmation = confirmationPhrase }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = execFile("/bin/sh", [scriptPath], {
      cwd,
      env: { ...process.env, HOME: home }
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${error.message}\n${stderr}`;
        error.stdout = stdout;
        error.stderr = stderr;
        rejectPromise(error);
        return;
      }
      resolvePromise({ stdout, stderr });
    });
    child.stdin.end(`${confirmation}\n`);
  });
}

async function runInstaller(options) {
  return runScript(script, options);
}

test("Antigravity shell installer resolves the repository independently of cwd", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "bos-antigravity-shell-"));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const cwd = join(sandbox, "unrelated-working-directory");
  const home = join(sandbox, "home");
  const pluginsRoot = join(home, ".gemini", "config", "plugins");
  await mkdir(cwd, { recursive: true });
  await mkdir(home, { recursive: true });

  const { stdout } = await runInstaller({ cwd, home });

  for (const name of ["bos", "education-center"]) {
    const target = join(pluginsRoot, name);
    assert.equal((await lstat(target)).isSymbolicLink(), true);
    assert.equal(
      await realpath(resolve(dirname(target), await readlink(target))),
      await realpath(join(repositoryRoot, "clients", "gemini", "extensions", name))
    );
  }
  assert.match(stdout, /WARNING: DESTRUCTIVE CLEAN INSTALL/);
  assert.match(stdout, /All local customizations.*will be lost/);
  assert.match(stdout, new RegExp(confirmationPhrase));
  assert.match(stdout, /Confirmation accepted.*without backups/);
  assert.match(stdout, /Restart Antigravity after each Git pull/);
});

test("Antigravity clean installer requires exact destructive confirmation", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "bos-antigravity-confirmation-"));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const home = join(sandbox, "home");
  const priorPlugin = join(home, ".gemini", "config", "plugins", "bos");
  await mkdir(priorPlugin, { recursive: true });
  await writeFile(join(priorPlugin, ".bos-product.json"), "{}\n");
  await writeFile(join(priorPlugin, "customization.txt"), "preserve\n");

  let refusal;
  try {
    await runInstaller({ cwd: sandbox, home, confirmation: "NO" });
  } catch (error) {
    refusal = error;
  }

  assert(refusal);
  assert.match(refusal.stdout, /WARNING: DESTRUCTIVE CLEAN INSTALL/);
  assert.match(refusal.stderr, /aborted.*No plugins or customizations were changed/i);
  assert.equal(
    await readFile(join(priorPlugin, "customization.txt"), "utf8"),
    "preserve\n"
  );
});

test("Antigravity shell installer removes prior BOS entries and preserves unrelated plugins", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "bos-antigravity-clean-"));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const home = join(sandbox, "home");
  const pluginsRoot = join(home, ".gemini", "config", "plugins");
  const priorBos = join(pluginsRoot, "old-bos-name");
  const disabledProduct = join(pluginsRoot, "video-ads");
  const unrelated = join(pluginsRoot, "unrelated-plugin");
  await mkdir(priorBos, { recursive: true });
  await mkdir(unrelated, { recursive: true });
  await symlink(join(sandbox, "missing-disabled-source"), disabledProduct);
  await writeFile(join(priorBos, ".bos-product.json"), "{}\n");
  await writeFile(join(priorBos, "old.txt"), "remove\n");
  await writeFile(join(unrelated, "keep.txt"), "keep\n");

  await runInstaller({ cwd: sandbox, home });

  await assert.rejects(lstat(priorBos));
  await assert.rejects(lstat(disabledProduct));
  assert.equal(await readFile(join(unrelated, "keep.txt"), "utf8"), "keep\n");
});

test("Antigravity shell installer replaces broken current-product symlinks", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "bos-antigravity-broken-"));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const home = join(sandbox, "home");
  const pluginsRoot = join(home, ".gemini", "config", "plugins");
  const target = join(pluginsRoot, "education-center");
  await mkdir(pluginsRoot, { recursive: true });
  await symlink(join(sandbox, "missing-source"), target);

  await runInstaller({ cwd: sandbox, home });

  assert.equal((await lstat(target)).isSymbolicLink(), true);
  assert.equal(
    await realpath(resolve(dirname(target), await readlink(target))),
    await realpath(join(repositoryRoot, "clients", "gemini", "extensions", "education-center"))
  );
});

test("Antigravity preflight preserves existing plugins when any active source is malformed", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "bos-antigravity-preflight-"));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const fakeRepository = join(sandbox, "repository");
  const scriptsRoot = join(fakeRepository, "scripts");
  const home = join(sandbox, "home");
  const priorPlugin = join(home, ".gemini", "config", "plugins", "bos");

  await mkdir(scriptsRoot, { recursive: true });
  await copyFile(script, join(scriptsRoot, "clean-install-antigravity.sh"));
  await copyFile(
    join(repositoryRoot, "scripts", "preflight-antigravity.mjs"),
    join(scriptsRoot, "preflight-antigravity.mjs")
  );
  const runtimeRoot = join(fakeRepository, "source", "runtime", "bos");
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(
    join(runtimeRoot, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        bos: {
          type: "http",
          url: "https://dfsm.ai/mcp/apps/{application_name}/{mcp_group_name}"
        }
      }
    })
  );
  for (const name of ["bos", "education-center"]) {
    const productRoot = join(fakeRepository, "products", name);
    const extensionRoot = join(fakeRepository, "clients", "gemini", "extensions", name);
    await mkdir(productRoot, { recursive: true });
    await mkdir(extensionRoot, { recursive: true });
    await writeFile(
      join(productRoot, "product.json"),
      JSON.stringify({
        schema_version: "1",
        name,
        version: "0.4.46",
        release_status: "active",
        display_name: name,
        description: "Test product.",
        publisher: "Test Publisher",
        category: "test",
        authentication: "ON_USE",
        clients: ["gemini"],
        includes: name === "bos"
          ? ["platform/bos-mcp-client"]
          : ["platform/test"],
        runtime: name === "bos" ? "bos" : undefined,
        application_name: name === "bos" ? "bos" : undefined,
        mcp_group_name: name === "bos" ? "platform" : undefined,
        default_prompts: []
      })
    );
    await writeFile(
      join(extensionRoot, ".bos-product.json"),
      JSON.stringify({
        schema_version: "1",
        name,
        version: "0.4.46",
        client: "gemini",
        connection_owner: "bos",
        application_name: name === "bos" ? "bos" : undefined,
        mcp_group_name: name === "bos" ? "platform" : undefined,
        authentication: name === "bos" ? "oauth_2_1" : "bos_managed"
      })
    );
    await writeFile(
      join(extensionRoot, "plugin.json"),
      JSON.stringify({
        $schema: "https://antigravity.google/schemas/v1/plugin.json",
        name,
        description: `Test product. Version 0.4.46.`
      })
    );
    if (name === "bos") {
      await writeFile(
        join(extensionRoot, "mcp_config.json"),
        JSON.stringify({
          mcpServers: {
            platform: {
              serverUrl: "https://dfsm.ai/mcp/apps/bos/platform"
            },
            unexpected: { command: "unsafe" }
          }
        })
      );
    }
  }
  await writeFile(
    join(fakeRepository, "clients", "disabled-products.json"),
    JSON.stringify({ schema_version: "1", products: [] })
  );
  await mkdir(priorPlugin, { recursive: true });
  await writeFile(join(priorPlugin, "preserve.txt"), "preserved\n");

  await assert.rejects(
    runScript(join(scriptsRoot, "clean-install-antigravity.sh"), { cwd: sandbox, home }),
    /source preflight failed/
  );
  assert.equal(await readFile(join(priorPlugin, "preserve.txt"), "utf8"), "preserved\n");
});

test("Antigravity preflight preserves existing plugins when disabled inventory is malformed", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "bos-antigravity-disabled-preflight-"));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const fakeRepository = join(sandbox, "repository");
  const scriptsRoot = join(fakeRepository, "scripts");
  const home = join(sandbox, "home");
  const priorPlugin = join(home, ".gemini", "config", "plugins", "bos");

  await mkdir(scriptsRoot, { recursive: true });
  await copyFile(script, join(scriptsRoot, "clean-install-antigravity.sh"));
  await copyFile(
    join(repositoryRoot, "scripts", "preflight-antigravity.mjs"),
    join(scriptsRoot, "preflight-antigravity.mjs")
  );
  const runtimeRoot = join(fakeRepository, "source", "runtime", "bos");
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(
    join(runtimeRoot, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        bos: {
          type: "http",
          url: "https://dfsm.ai/mcp/apps/{application_name}/{mcp_group_name}"
        }
      }
    })
  );
  for (const name of ["bos", "education-center"]) {
    const productRoot = join(fakeRepository, "products", name);
    const extensionRoot = join(fakeRepository, "clients", "gemini", "extensions", name);
    await mkdir(productRoot, { recursive: true });
    await mkdir(extensionRoot, { recursive: true });
    const runtime = name === "bos";
    await writeFile(
      join(productRoot, "product.json"),
      JSON.stringify({
        schema_version: "1",
        display_name: name,
        description: "Test product.",
        publisher: "Test Publisher",
        category: "test",
        authentication: "ON_USE",
        includes: runtime ? ["platform/bos-mcp-client"] : ["platform/test"],
        name,
        version: "0.4.46",
        release_status: "active",
        clients: ["gemini"],
        runtime: runtime ? "bos" : undefined,
        application_name: runtime ? "bos" : undefined,
        mcp_group_name: runtime ? "platform" : undefined,
        default_prompts: []
      })
    );
    await writeFile(
      join(extensionRoot, ".bos-product.json"),
      JSON.stringify({
        schema_version: "1",
        name,
        version: "0.4.46",
        client: "gemini",
        connection_owner: "bos",
        application_name: runtime ? "bos" : undefined,
        mcp_group_name: runtime ? "platform" : undefined,
        authentication: runtime ? "oauth_2_1" : "bos_managed"
      })
    );
    await writeFile(
      join(extensionRoot, "plugin.json"),
      JSON.stringify({
        $schema: "https://antigravity.google/schemas/v1/plugin.json",
        name,
        description: `Test product. Version 0.4.46.`
      })
    );
    if (runtime) {
      await writeFile(
        join(extensionRoot, "mcp_config.json"),
        JSON.stringify({
          mcpServers: {
            platform: {
              serverUrl: "https://dfsm.ai/mcp/apps/bos/platform"
            }
          }
        })
      );
    }
  }
  const disabledRoot = join(fakeRepository, "products", "video-ads");
  await mkdir(disabledRoot, { recursive: true });
  await writeFile(
    join(disabledRoot, "product.json"),
    JSON.stringify({
      schema_version: "1",
      name: "../../../target",
      version: "0.4.46",
      release_status: "disabled",
      display_name: "Video Ads",
      description: "Test disabled product.",
      publisher: "Test Publisher",
      category: "test",
      authentication: "ON_USE",
      clients: ["gemini"],
      includes: ["platform/test"],
      default_prompts: []
    })
  );
  await writeFile(
    join(fakeRepository, "clients", "disabled-products.json"),
    JSON.stringify({ schema_version: "1", products: [] })
  );
  await mkdir(priorPlugin, { recursive: true });
  await writeFile(join(priorPlugin, "preserve.txt"), "preserved\n");

  await assert.rejects(
    runScript(join(scriptsRoot, "clean-install-antigravity.sh"), { cwd: sandbox, home }),
    /source preflight failed/
  );
  assert.equal(await readFile(join(priorPlugin, "preserve.txt"), "utf8"), "preserved\n");
});
