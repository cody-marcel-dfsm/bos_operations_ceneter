#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, join, normalize, posix, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { root, stableJson } from "./lib/package-model.mjs";

const run = promisify(execFile);

export const PUBLIC_CONTRACT_FILES = Object.freeze([
  "api.contract.request.example.json",
  "api.contract.request.schema.json",
  "api.contract.response.example.json",
  "api.contract.response.schema.json",
  "app.describe.example.json",
  "app.describe.schema.json",
  "describe.request.example.json",
  "describe.response.example.json",
  "describe.response.schema.json",
  "operation.examples.json"
]);
export const OWNER_APPROVED_AUTH_IMPACT = "owner-approved-auth-adjacent-context-selection";
export const PRESERVED_AUTH_CONTRACT = "oauth-login-token-grant-callback-session-unchanged";

const DEFAULT_TARGET = join(
  root,
  "tests",
  "fixtures",
  "public-contracts",
  "lead-director",
  "v1"
);
const DEFAULT_PROVENANCE = join(
  root,
  "tests",
  "fixtures",
  "public-contracts",
  "lead-director",
  "import-provenance.json"
);
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 10 * 1024 * 1024;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(path) {
  return sha256(await readFile(path));
}

function safeRelativePath(value, label = "path") {
  if (typeof value !== "string" || !value || value.includes("\\") || posix.isAbsolute(value)) {
    throw new Error(`${label} must be a safe relative POSIX path`);
  }
  const clean = posix.normalize(value.replace(/^\.\//, ""));
  if (clean === "." || clean === ".." || clean.startsWith("../") || clean.includes("/../")) {
    throw new Error(`${label} must stay inside the bundle root`);
  }
  return clean;
}

async function listRegularFiles(directory, base = directory, result = []) {
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new Error("Contract bundle must not contain symbolic links");
    if (entry.isDirectory()) await listRegularFiles(path, base, result);
    else if (entry.isFile()) result.push(path.slice(base.length + 1).split(sep).join("/"));
    else throw new Error("Contract bundle may contain only regular files and directories");
  }
  return result;
}

function expectedArchiveFiles() {
  return [...PUBLIC_CONTRACT_FILES, "manifest.json"].sort();
}

async function inspectArchive(archive) {
  const [{ stdout: namesOutput }, { stdout: detailsOutput }] = await Promise.all([
    run("tar", ["-tzf", archive], { maxBuffer: 1024 * 1024 }),
    run("tar", ["-tvzf", archive], { maxBuffer: 1024 * 1024 })
  ]);
  const names = namesOutput.split("\n").filter(Boolean);
  const details = detailsOutput.split("\n").filter(Boolean);
  if (names.length !== details.length) throw new Error("Contract archive listing is inconsistent");

  let extractedBytes = 0;
  const entries = names.map((rawName, index) => {
    const kind = details[index][0];
    if (!new Set(["-", "d"]).has(kind)) {
      throw new Error("Contract archive may contain only regular files and directories");
    }
    const size = details[index].match(/^\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s/)?.[1];
    if (size === undefined) throw new Error("Contract archive size metadata is invalid");
    extractedBytes += Number(size);
    const trimmed = rawName.replace(/\/$/, "");
    if ((trimmed === "" || trimmed === ".") && kind === "d") return null;
    return { kind, path: safeRelativePath(trimmed, "archive entry") };
  }).filter(Boolean);
  if (extractedBytes > MAX_EXTRACTED_BYTES) {
    throw new Error("Contract archive expands beyond the 10 MiB safety limit");
  }

  const files = entries.filter(({ kind }) => kind === "-").map(({ path }) => path);
  const roots = new Set(files.map((path) => path.includes("/") ? path.split("/")[0] : ""));
  if (roots.size !== 1) throw new Error("Contract archive must use one bundle root");
  const bundleRoot = [...roots][0];
  const nestedDirectories = entries
    .filter(({ kind }) => kind === "d")
    .map(({ path }) => path)
    .filter((path) => path !== bundleRoot);
  if (nestedDirectories.length) throw new Error("Contract archive contains an unexpected directory");
  const relativeFiles = files.map((path) => bundleRoot ? path.slice(bundleRoot.length + 1) : path);
  if (JSON.stringify(relativeFiles.sort()) !== JSON.stringify(expectedArchiveFiles())) {
    throw new Error("Contract archive must contain the exact eleven-file Lead Director public bundle");
  }
  return bundleRoot;
}

async function validateBundle(directory) {
  const files = await listRegularFiles(directory);
  if (JSON.stringify(files.sort()) !== JSON.stringify(expectedArchiveFiles())) {
    throw new Error("Extracted contract directory does not contain the exact public bundle");
  }
  const manifestPath = join(directory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.contract !== "bos-public-contract-release/v1" ||
    manifest.contract_id !== "lead-director-describe" ||
    manifest.contract_version !== "lead-director-describe/v1" ||
    manifest.owner !== "bos" ||
    manifest.auth_impact !== OWNER_APPROVED_AUTH_IMPACT ||
    manifest.preserved_auth_contract !== PRESERVED_AUTH_CONTRACT
  ) {
    throw new Error("Contract bundle has the wrong public identity or authentication classification");
  }
  const manifestFiles = manifest.files?.map(({ path }) => safeRelativePath(path, "manifest path"));
  if (JSON.stringify([...manifestFiles].sort()) !== JSON.stringify([...PUBLIC_CONTRACT_FILES].sort())) {
    throw new Error("Contract manifest file inventory is invalid");
  }

  const bundleParts = [];
  for (const entry of manifest.files) {
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) {
      throw new Error(`Contract manifest digest is invalid: ${entry.path}`);
    }
    const path = join(directory, entry.path);
    const digest = await sha256File(path);
    if (digest !== entry.sha256) throw new Error(`Contract file digest mismatch: ${entry.path}`);
    JSON.parse(await readFile(path, "utf8"));
    bundleParts.push(Buffer.from(`${entry.path}\0`, "utf8"), Buffer.from(digest, "hex"));
  }
  const bundleDigest = sha256(Buffer.concat(bundleParts));
  if (manifest.bundle_sha256 !== bundleDigest) throw new Error("Contract bundle digest mismatch");
  return { manifest, manifestSha256: await sha256File(manifestPath) };
}

async function directoryMatches(left, right) {
  for (const name of expectedArchiveFiles()) {
    if (await sha256File(join(left, name)) !== await sha256File(join(right, name))) return false;
  }
  return true;
}

export async function importLeadDirectorPublicContract({
  archive,
  archiveSha256,
  sourceRevision,
  check = false,
  targetDirectory = DEFAULT_TARGET,
  provenanceFile = DEFAULT_PROVENANCE
}) {
  if (!/^[a-f0-9]{64}$/.test(archiveSha256 ?? "")) {
    throw new Error("Archive SHA-256 must be a lowercase 64-character digest");
  }
  if (!/^[a-f0-9]{40}$/.test(sourceRevision ?? "")) {
    throw new Error("Source revision must be a full lowercase 40-character commit SHA");
  }
  const resolvedArchive = resolve(archive);
  if ((await stat(resolvedArchive)).size > MAX_ARCHIVE_BYTES) {
    throw new Error("Contract archive exceeds the 2 MiB safety limit");
  }
  if (await sha256File(resolvedArchive) !== archiveSha256) {
    throw new Error("Contract archive SHA-256 does not match the supplied digest");
  }
  const bundleRoot = await inspectArchive(resolvedArchive);
  const targetParent = dirname(targetDirectory);
  await mkdir(targetParent, { recursive: true });
  const temporary = await mkdtemp(join(targetParent, ".lead-director-import-"));
  const candidate = join(temporary, "candidate");
  try {
    await run("tar", ["-xzf", resolvedArchive, "-C", temporary, "--no-same-owner", "--no-same-permissions"], {
      maxBuffer: 1024 * 1024
    });
    if (bundleRoot) await rename(join(temporary, bundleRoot), candidate);
    else {
      await mkdir(candidate);
      for (const name of expectedArchiveFiles()) {
        await rename(join(temporary, name), join(candidate, name));
      }
    }
    const { manifest, manifestSha256 } = await validateBundle(candidate);
    const provenance = {
      schema: "bos-operations-center.public-contract-import/v1",
      source_revision: sourceRevision,
      archive_sha256: archiveSha256,
      manifest_sha256: manifestSha256,
      bundle_sha256: manifest.bundle_sha256,
      auth_impact: manifest.auth_impact,
      preserved_auth_contract: manifest.preserved_auth_contract
    };
    if (check) {
      if (!await directoryMatches(candidate, targetDirectory)) {
        throw new Error("Committed Lead Director bundle differs from the supplied immutable archive");
      }
      const current = JSON.parse(await readFile(provenanceFile, "utf8"));
      if (stableJson(current) !== stableJson(provenance)) {
        throw new Error("Committed import provenance differs from the supplied immutable archive");
      }
      return provenance;
    }

    const backup = join(temporary, "backup");
    const provenanceTemporary = `${provenanceFile}.import-${process.pid}`;
    const priorProvenance = await readFile(provenanceFile).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    await writeFile(provenanceTemporary, stableJson(provenance), { flag: "wx" });
    await rename(targetDirectory, backup);
    try {
      await rename(candidate, targetDirectory);
      await rename(provenanceTemporary, provenanceFile);
      await rm(backup, { recursive: true, force: true });
    } catch (error) {
      await rm(provenanceTemporary, { force: true });
      await rm(targetDirectory, { recursive: true, force: true });
      await rename(backup, targetDirectory);
      if (priorProvenance === null) await rm(provenanceFile, { force: true });
      else await writeFile(provenanceFile, priorProvenance);
      throw error;
    }
    return provenance;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const options = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--archive") options.archive = argv[++index];
    else if (argument === "--sha256") options.archiveSha256 = argv[++index];
    else if (argument === "--source-revision") options.sourceRevision = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.archive || !options.archiveSha256 || !options.sourceRevision) {
    throw new Error(
      "Usage: node scripts/import-lead-director-public-contract.mjs --archive <bundle.tgz> --sha256 <archive-sha256> --source-revision <40-hex-commit> [--check]"
    );
  }
  return options;
}

if (process.argv[1] && normalize(resolve(process.argv[1])) === normalize(fileURLToPath(import.meta.url))) {
  importLeadDirectorPublicContract(parseArguments(process.argv.slice(2)))
    .then((provenance) => {
      console.log(
        `LEAD_DIRECTOR_PUBLIC_CONTRACT=APPROVED bundle=${provenance.bundle_sha256} source=${provenance.source_revision}`
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
