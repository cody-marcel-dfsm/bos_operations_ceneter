import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  importLeadDirectorPublicContract,
  OWNER_APPROVED_AUTH_IMPACT,
  PRESERVED_AUTH_CONTRACT,
  PUBLIC_CONTRACT_FILES
} from "../scripts/import-lead-director-public-contract.mjs";
import { root } from "../scripts/lib/package-model.mjs";

const run = promisify(execFile);
const fixture = join(root, "tests", "fixtures", "public-contracts", "lead-director", "v1");
const sourceRevision = "0123456789abcdef0123456789abcdef01234567";

async function prepareOwnerApprovedSource(source) {
  await cp(fixture, source, { recursive: true });
  const manifestPath = join(source, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.auth_impact = OWNER_APPROVED_AUTH_IMPACT;
  manifest.preserved_auth_contract = PRESERVED_AUTH_CONTRACT;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function archiveDirectory(directory, archive, bundleRoot = "lead-director-v1") {
  const parent = join(directory, "..");
  const name = directory.split("/").at(-1);
  const staged = join(parent, bundleRoot);
  await cp(directory, staged, { recursive: true });
  await run("tar", ["-czf", archive, "-C", parent, bundleRoot]);
  await rm(staged, { recursive: true, force: true });
  return createHash("sha256").update(await readFile(archive)).digest("hex");
}

test("immutable Lead Director contract import validates and atomically records provenance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-contract-import-"));
  const source = join(directory, "source");
  const target = join(directory, "target");
  const provenanceFile = join(directory, "import-provenance.json");
  const archive = join(directory, "bundle.tgz");
  try {
    await prepareOwnerApprovedSource(source);
    await cp(fixture, target, { recursive: true });
    const archiveSha256 = await archiveDirectory(source, archive);
    const imported = await importLeadDirectorPublicContract({
      archive,
      archiveSha256,
      sourceRevision,
      targetDirectory: target,
      provenanceFile
    });
    assert.equal(imported.schema, "bos-operations-center.public-contract-import/v1");
    assert.equal(imported.source_revision, sourceRevision);
    assert.equal(imported.archive_sha256, archiveSha256);
    assert.equal(imported.auth_impact, OWNER_APPROVED_AUTH_IMPACT);
    assert.equal(imported.preserved_auth_contract, PRESERVED_AUTH_CONTRACT);
    assert.equal(
      imported.bundle_sha256,
      JSON.parse(await readFile(join(target, "manifest.json"), "utf8")).bundle_sha256
    );
    assert.deepEqual(
      JSON.parse(await readFile(provenanceFile, "utf8")),
      imported
    );
    assert.deepEqual(
      (await Promise.all(PUBLIC_CONTRACT_FILES.map(async (name) => [
        name,
        await readFile(join(target, name), "utf8")
      ]))).map(([name]) => name).sort(),
      [...PUBLIC_CONTRACT_FILES].sort()
    );

    assert.deepEqual(
      await importLeadDirectorPublicContract({
        archive,
        archiveSha256,
        sourceRevision,
        check: true,
        targetDirectory: target,
        provenanceFile
      }),
      imported
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("contract import rejects changed archives and unexpected files before replacement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-contract-import-invalid-"));
  const source = join(directory, "source");
  const target = join(directory, "target");
  const provenanceFile = join(directory, "import-provenance.json");
  const archive = join(directory, "bundle.tgz");
  try {
    await prepareOwnerApprovedSource(source);
    await cp(fixture, target, { recursive: true });
    const originalManifest = await readFile(join(target, "manifest.json"), "utf8");
    await writeFile(join(source, "unexpected.json"), "{}\n");
    const archiveSha256 = await archiveDirectory(source, archive);
    await assert.rejects(
      () => importLeadDirectorPublicContract({
        archive,
        archiveSha256,
        sourceRevision,
        targetDirectory: target,
        provenanceFile
      }),
      /exact eleven-file/
    );
    assert.equal(await readFile(join(target, "manifest.json"), "utf8"), originalManifest);

    await assert.rejects(
      () => importLeadDirectorPublicContract({
        archive,
        archiveSha256: "0".repeat(64),
        sourceRevision,
        targetDirectory: target,
        provenanceFile
      }),
      /does not match/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("contract import fails closed on every other authentication classification", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-contract-import-auth-classification-"));
  const target = join(directory, "target");
  const provenanceFile = join(directory, "import-provenance.json");
  try {
    await cp(fixture, target, { recursive: true });
    const originalManifest = await readFile(join(target, "manifest.json"), "utf8");
    for (const [authImpact, preservedAuthContract] of [
      ["none", PRESERVED_AUTH_CONTRACT],
      [OWNER_APPROVED_AUTH_IMPACT, "oauth-unchanged"],
      [OWNER_APPROVED_AUTH_IMPACT, undefined]
    ]) {
      const source = join(directory, `source-${authImpact}-${preservedAuthContract ?? "missing"}`);
      const archive = join(directory, `bundle-${authImpact}-${preservedAuthContract ?? "missing"}.tgz`);
      await prepareOwnerApprovedSource(source);
      const manifestPath = join(source, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.auth_impact = authImpact;
      if (preservedAuthContract === undefined) delete manifest.preserved_auth_contract;
      else manifest.preserved_auth_contract = preservedAuthContract;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const archiveSha256 = await archiveDirectory(source, archive, `bundle-${authImpact}-${preservedAuthContract ?? "missing"}`);
      await assert.rejects(
        () => importLeadDirectorPublicContract({
          archive,
          archiveSha256,
          sourceRevision,
          targetDirectory: target,
          provenanceFile
        }),
        /wrong public identity or authentication classification/
      );
      assert.equal(await readFile(join(target, "manifest.json"), "utf8"), originalManifest);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("contract import rejects links and expansion bombs before extraction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-contract-import-safety-"));
  const target = join(directory, "target");
  const provenanceFile = join(directory, "import-provenance.json");
  try {
    await cp(fixture, target, { recursive: true });
    const originalManifest = await readFile(join(target, "manifest.json"), "utf8");

    const linkedSource = join(directory, "linked-source");
    const linkedArchive = join(directory, "linked.tgz");
    await prepareOwnerApprovedSource(linkedSource);
    await rm(join(linkedSource, PUBLIC_CONTRACT_FILES[0]));
    await symlink("manifest.json", join(linkedSource, PUBLIC_CONTRACT_FILES[0]));
    const linkedDigest = await archiveDirectory(linkedSource, linkedArchive, "linked-bundle");
    await assert.rejects(
      () => importLeadDirectorPublicContract({
        archive: linkedArchive,
        archiveSha256: linkedDigest,
        sourceRevision,
        targetDirectory: target,
        provenanceFile
      }),
      /regular files and directories/
    );

    const largeSource = join(directory, "large-source");
    const largeArchive = join(directory, "large.tgz");
    await prepareOwnerApprovedSource(largeSource);
    await writeFile(join(largeSource, "oversized.bin"), Buffer.alloc(10 * 1024 * 1024 + 1));
    const largeDigest = await archiveDirectory(largeSource, largeArchive, "large-bundle");
    await assert.rejects(
      () => importLeadDirectorPublicContract({
        archive: largeArchive,
        archiveSha256: largeDigest,
        sourceRevision,
        targetDirectory: target,
        provenanceFile
      }),
      /expands beyond the 10 MiB/
    );

    assert.equal(await readFile(join(target, "manifest.json"), "utf8"), originalManifest);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
