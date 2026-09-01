import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;

test("Vault sync builds the Chroma collection and excludes generated state", () => {
  const manifestRoot = mkdtempSync(join(tmpdir(), "bos-vault-manifest-"));
  const chromaRoot = mkdtempSync(join(tmpdir(), "bos-vault-chroma-"));
  try {
    execFileSync("python3", ["tools/vault_index.py", "sync", "--quiet"], {
      cwd: root,
      env: {
        ...process.env,
        BOS_VAULT_MANIFEST_ROOT: manifestRoot,
        BOS_VAULT_CHROMA_ROOT: chromaRoot,
      },
    });
    const manifest = JSON.parse(readFileSync(join(manifestRoot, "latest.json"), "utf8"));
    assert.equal(manifest.index_version, 1);
    assert.equal(manifest.collection, "vault_knowledge");
    assert.ok(manifest.source_count > 0);
    assert.ok(manifest.collection_count >= manifest.source_count);
    assert.ok(manifest.changed_sources.includes("Vault/docs/architecture.md"));
    assert.ok(manifest.changed_sources.includes("Vault/docs/CONSTITUTION.md"));
    assert.ok(manifest.changed_sources.includes("Vault/docs/issues/ISSUE_HISTORY.md"));
    assert.equal(manifest.changed_sources.some((path) => path.includes("/index/") || path.includes("/tmp/")), false);
    const firstManifestFiles = readdirSync(manifestRoot).sort();
    execFileSync("python3", ["tools/vault_index.py", "sync", "--quiet"], {
      cwd: root,
      env: {
        ...process.env,
        BOS_VAULT_MANIFEST_ROOT: manifestRoot,
        BOS_VAULT_CHROMA_ROOT: chromaRoot,
      },
    });
    assert.deepEqual(readdirSync(manifestRoot).sort(), firstManifestFiles);
  } finally {
    rmSync(manifestRoot, { recursive: true, force: true });
    rmSync(chromaRoot, { recursive: true, force: true });
  }
});

test("Vault tooling keeps Chroma local and provides staged manifest enforcement", () => {
  const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../.githooks/pre-commit", import.meta.url), "utf8");

  assert.match(gitignore, /^Vault\/index\/chroma\/$/m);
  assert.match(hook, /--force-manifest/);
  assert.match(hook, /stage or revert all Vault source changes/i);
  assert.match(hook, /latest\.json/);
});

test("Vault query returns semantic source, chunk, timestamp, and distance evidence", () => {
  const manifestRoot = mkdtempSync(join(tmpdir(), "bos-vault-manifest-"));
  const chromaRoot = mkdtempSync(join(tmpdir(), "bos-vault-chroma-"));
  try {
    const env = {
      ...process.env,
      BOS_VAULT_MANIFEST_ROOT: manifestRoot,
      BOS_VAULT_CHROMA_ROOT: chromaRoot,
    };
    execFileSync("python3", ["tools/vault_index.py", "sync", "--quiet"], { cwd: root, env });
    const result = JSON.parse(execFileSync(
      "python3",
      ["tools/vault_index.py", "query", "fresh-account portability account-scoped Platform submission draft", "--limit", "10"],
      { cwd: root, env, encoding: "utf8" },
    ));
    assert.ok(result.some((match) => match.source.startsWith("Vault/docs/issues/")));
    for (const match of result) {
      assert.equal(typeof match.chunk, "number");
      assert.equal(typeof match.indexed_at, "string");
      assert.equal(typeof match.distance, "number");
      assert.equal(typeof match.text, "string");
    }
  } finally {
    rmSync(manifestRoot, { recursive: true, force: true });
    rmSync(chromaRoot, { recursive: true, force: true });
  }
});
