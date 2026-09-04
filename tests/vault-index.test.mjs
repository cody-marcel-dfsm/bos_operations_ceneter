import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;
const privateVaultAvailable = existsSync(new URL("../Vault/docs/architecture.md", import.meta.url));

test("Vault sync builds the Chroma collection and excludes generated state", {
  skip: !privateVaultAvailable,
}, () => {
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

test("Vault tooling keeps all private knowledge outside Git", () => {
  const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../.githooks/pre-commit", import.meta.url), "utf8");

  assert.match(gitignore, /^\/Vault\/$/m);
  assert.match(hook, /Vault\/ is private maintainer material/i);
  assert.match(hook, /never enter Git history/i);
  assert.doesNotMatch(hook, /git["', ]+add|--force-manifest|latest\.json/i);

  const trackedVault = execFileSync("git", ["ls-files", "Vault"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(trackedVault, "");
});

test("Vault query returns semantic source, chunk, timestamp, and distance evidence", {
  skip: !privateVaultAvailable,
}, () => {
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
      [
        "tools/vault_index.py",
        "query",
        "GPT connector metadata visibility predicate Connect Reconnect Issue 0001",
        "--limit",
        "10",
      ],
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
