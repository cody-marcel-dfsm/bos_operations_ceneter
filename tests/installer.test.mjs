import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyInstallation,
  inspectInstallation,
  verifyInstallation
} from "../scripts/install-package.mjs";
import { hashFile, root } from "../scripts/lib/package-model.mjs";

async function temporaryHome() {
  return mkdtemp(join(tmpdir(), "bos-install-test-"));
}

test("missing installation is created and second apply is a no-op", async () => {
  const home = await temporaryHome();
  const initial = await inspectInstallation({ home, product: "bos" });
  assert.equal(initial.state, "missing");
  const applied = await applyInstallation({ home, product: "bos" });
  assert.equal(applied.state, "managed-current");
  assert.equal(applied.marketplace, "current");
  const stateBefore = await readFile(
    join(home, "plugins", "bos", ".bos-package-state.json"),
    "utf8"
  );
  const repeated = await applyInstallation({ home, product: "bos" });
  const stateAfter = await readFile(
    join(home, "plugins", "bos", ".bos-package-state.json"),
    "utf8"
  );
  assert.equal(repeated.state, "managed-current");
  assert.equal(stateAfter, stateBefore);
});

test("apply preserves unrelated marketplace entries and plugin files", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const userFile = join(home, "plugins", "bos", "USER-NOTES.txt");
  await writeFile(userFile, "preserve me\n");
  const marketplacePath = join(home, ".agents", "plugins", "marketplace.json");
  const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));
  marketplace.plugins.unshift({
    name: "other",
    source: { source: "local", path: "./plugins/other" },
    policy: { installation: "AVAILABLE", authentication: "ON_USE" },
    category: "Productivity"
  });
  await writeFile(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`);
  const report = await applyInstallation({ home, product: "bos" });
  assert.equal(report.state, "managed-current");
  assert.equal(await readFile(userFile, "utf8"), "preserve me\n");
  const updated = JSON.parse(await readFile(marketplacePath, "utf8"));
  assert.equal(updated.plugins[0].name, "other");
});

test("modified managed file produces conflict without overwrite", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const skill = join(home, "plugins", "bos", "skills", "planning", "SKILL.md");
  await writeFile(skill, "local modification\n");
  const report = await inspectInstallation({ home, product: "bos" });
  assert.equal(report.state, "conflict");
  await assert.rejects(
    applyInstallation({ home, product: "bos" }),
    /Installation state is conflict/
  );
  assert.equal(await readFile(skill, "utf8"), "local modification\n");
});

test("verify reports current installation", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const report = await verifyInstallation({ home, product: "bos" });
  assert.equal(report.ok, true);
});

test("compatible unmanaged plugin is adopted", async () => {
  const home = await temporaryHome();
  const desired = join(root, "clients", "codex", "plugins", "bos");
  const target = join(home, "plugins", "bos");
  await mkdir(join(home, "plugins"), { recursive: true });
  await cp(desired, target, { recursive: true });
  const before = await inspectInstallation({ home, product: "bos" });
  assert.equal(before.state, "compatible-unmanaged");
  const after = await applyInstallation({ home, product: "bos" });
  assert.equal(after.state, "managed-current");
});

test("stale managed file updates when prior hash proves ownership", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const skill = join(home, "plugins", "bos", "skills", "planning", "SKILL.md");
  await writeFile(skill, "managed old version\n");
  const statePath = join(
    home,
    "plugins",
    "bos",
    ".bos-package-state.json"
  );
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.managed_hashes["skills/planning/SKILL.md"] = await hashFile(skill);
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const before = await inspectInstallation({ home, product: "bos" });
  assert.equal(before.state, "managed-stale");
  const after = await applyInstallation({ home, product: "bos" });
  assert.equal(after.state, "managed-current");
  assert.notEqual(await readFile(skill, "utf8"), "managed old version\n");
});

test("conflicting marketplace entry stops installation", async () => {
  const home = await temporaryHome();
  const marketplacePath = join(home, ".agents", "plugins", "marketplace.json");
  await mkdir(join(home, ".agents", "plugins"), { recursive: true });
  await writeFile(
    marketplacePath,
    `${JSON.stringify(
      {
        name: "personal",
        plugins: [
          {
            name: "bos",
            source: { source: "local", path: "./plugins/not-bos" },
            policy: {
              installation: "AVAILABLE",
              authentication: "ON_USE"
            },
            category: "Productivity"
          }
        ]
      },
      null,
      2
    )}\n`
  );
  const report = await inspectInstallation({ home, product: "bos" });
  assert.equal(report.state, "conflict");
  await assert.rejects(
    applyInstallation({ home, product: "bos" }),
    /Installation state is conflict/
  );
});

test("unsafe target outside selected home is rejected", async () => {
  const home = await temporaryHome();
  await assert.rejects(
    inspectInstallation({
      home,
      product: "bos",
      target: join(tmpdir(), "outside-bos")
    }),
    /Target must remain inside/
  );
});

test("stale package-owned files are removed while user files remain", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const target = join(home, "plugins", "bos");
  const removedPath = join(target, "obsolete-managed.txt");
  const userPath = join(target, "user-owned.txt");
  await writeFile(removedPath, "old managed content\n");
  await writeFile(userPath, "user content\n");
  const statePath = join(target, ".bos-package-state.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.managed_paths.push("obsolete-managed.txt");
  state.managed_hashes["obsolete-managed.txt"] = await hashFile(removedPath);
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

  const before = await inspectInstallation({ home, product: "bos" });
  assert.equal(before.state, "managed-stale");
  assert.deepEqual(before.actions.remove, ["obsolete-managed.txt"]);
  await applyInstallation({ home, product: "bos" });
  await assert.rejects(readFile(removedPath, "utf8"), /ENOENT/);
  assert.equal(await readFile(userPath, "utf8"), "user content\n");
});
