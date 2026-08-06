import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;

test("Vault sync inventories canonical sources and excludes generated state", () => {
  const manifestRoot = mkdtempSync(join(tmpdir(), "bos-vault-manifest-"));
  try {
    execFileSync("python3", ["tools/vault_index.py", "sync", "--quiet"], {
      cwd: root,
      env: { ...process.env, BOS_VAULT_MANIFEST_ROOT: manifestRoot },
    });
    const manifest = JSON.parse(readFileSync(join(manifestRoot, "latest.json"), "utf8"));
    assert.equal(manifest.schema_version, "bos-vault-manifest/v1");
    assert.ok(manifest.sources["Vault/docs/architecture.md"]);
    assert.ok(manifest.sources["Vault/docs/CONSTITUTION.md"]);
    assert.equal(
      Object.keys(manifest.sources).some((path) => path.includes("/index/") || path.includes("/tmp/")),
      false,
    );
  } finally {
    rmSync(manifestRoot, { recursive: true, force: true });
  }
});

test("Vault query returns grounded file and line evidence", () => {
  const result = execFileSync(
    "python3",
    ["tools/vault_index.py", "query", "credential handoff"],
    { cwd: root, encoding: "utf8" },
  );
  assert.match(result, /Vault\/docs\/architecture\.md/);
  assert.match(result, /\d+:/);
});
