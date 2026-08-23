import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  installAntigravity,
  repositoryRoot
} from "../scripts/install-antigravity.mjs";

const execFileAsync = promisify(execFile);

test("Antigravity installer resolves repository source independently of cwd", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "bos-antigravity-cli-"));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const home = join(sandbox, "home");
  const cwd = join(sandbox, "unrelated-working-directory");
  await mkdir(home, { recursive: true });
  await mkdir(cwd, { recursive: true });

  const script = join(repositoryRoot, "scripts", "install-antigravity.mjs");
  const { stdout } = await execFileAsync(process.execPath, [script], {
    cwd,
    env: { ...process.env, HOME: home }
  });

  for (const name of ["bos", "education-center"]) {
    const target = join(home, ".gemini", "config", "plugins", name);
    assert.equal((await lstat(target)).isSymbolicLink(), true);
    assert.equal(
      await realpath(resolve(dirname(target), await readlink(target))),
      await realpath(join(repositoryRoot, "clients", "gemini", "extensions", name))
    );
  }
  assert.match(stdout, /Restart Antigravity/);
  assert.match(stdout, /Clean Antigravity install completed/);
});

test("Antigravity installer removes prior and disabled product entries without backups", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "bos-antigravity-link-"));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const pluginsRoot = join(sandbox, "plugins");
  const priorBos = join(pluginsRoot, "bos");
  const disabledProduct = join(pluginsRoot, "video-ads");
  const unrelatedPlugin = join(pluginsRoot, "unrelated-plugin");
  await mkdir(priorBos, { recursive: true });
  await mkdir(disabledProduct, { recursive: true });
  await mkdir(unrelatedPlugin, { recursive: true });
  await writeFile(join(priorBos, "local-copy.txt"), "previous copy\n");
  await writeFile(join(disabledProduct, "old-plugin.txt"), "disabled\n");
  await writeFile(join(unrelatedPlugin, "keep.txt"), "unrelated\n");

  const first = await installAntigravity({ pluginsRoot });
  assert(first.results.every((item) => item.state === "linked"));
  assert(first.results.every((item) => item.verified === true));
  await assert.rejects(readFile(join(priorBos, "local-copy.txt"), "utf8"));
  await assert.rejects(lstat(disabledProduct));
  assert.deepEqual(first.removed, [{ name: "video-ads", target: disabledProduct }]);
  assert.equal(await readFile(join(unrelatedPlugin, "keep.txt"), "utf8"), "unrelated\n");

  const second = await installAntigravity({ pluginsRoot });
  assert(second.results.every((item) => item.state === "current"));
  assert(second.results.every((item) => item.verified === true));
  assert.deepEqual(second.removed, []);
});

test("Antigravity clean install validates all source plugins before deleting prior entries", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "bos-antigravity-preflight-"));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const pluginsRoot = join(sandbox, "installed", "plugins");
  const priorBos = join(pluginsRoot, "bos");
  const sourceBos = join(sandbox, "repo", "clients", "gemini", "extensions", "bos");
  await mkdir(priorBos, { recursive: true });
  await mkdir(sourceBos, { recursive: true });
  await writeFile(join(priorBos, "prior.txt"), "keep on preflight failure\n");
  await writeFile(
    join(sourceBos, ".bos-product.json"),
    JSON.stringify({ client: "gemini", name: "bos" })
  );
  await writeFile(join(sourceBos, "plugin.json"), JSON.stringify({ name: "wrong-name" }));
  await mkdir(join(sandbox, "repo", "clients"), { recursive: true });
  await writeFile(
    join(sandbox, "repo", "clients", "disabled-products.json"),
    JSON.stringify({ products: [] })
  );

  await assert.rejects(
    installAntigravity({ base: join(sandbox, "repo"), pluginsRoot }),
    /identity does not match/
  );
  assert.equal(
    await readFile(join(priorBos, "prior.txt"), "utf8"),
    "keep on preflight failure\n"
  );
});

test("Antigravity clean install stops before deleting customer-owned extensions", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "bos-antigravity-customer-extension-"));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const pluginsRoot = join(sandbox, "plugins");
  const extensionRoot = join(pluginsRoot, "bos", "skills", "customer-extension");
  await mkdir(extensionRoot, { recursive: true });
  await writeFile(join(extensionRoot, ".bos-extension.json"), "{}\n");

  await assert.rejects(
    installAntigravity({ pluginsRoot }),
    /customer extension metadata exists/
  );
  assert.equal(
    await readFile(join(extensionRoot, ".bos-extension.json"), "utf8"),
    "{}\n"
  );
});
