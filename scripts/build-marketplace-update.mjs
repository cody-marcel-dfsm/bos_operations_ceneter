import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDeterministicZip, readZipEntries } from "./lib/deterministic-zip.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prefix = "clients/codex/plugins/bos/";
const manifestPath = ".codex-plugin/plugin.json";
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function createMarketplaceUpdate(releasedEntries, legacyName) {
  if (typeof legacyName !== "string" || legacyName.length !== 36 || !/^app-[a-f0-9]{32}$/.test(legacyName)) {
    throw new Error("Supply the existing legacy listing package name");
  }
  const entries = releasedEntries.map(entry => ({ ...entry, content: Buffer.from(entry.content) }));
  const get = path => {
    const matches = entries.filter(entry => entry.path === path);
    if (matches.length !== 1) throw new Error(`Expected one released BOS file: ${path}`);
    return matches[0];
  };
  for (const entry of entries) {
    if (![0o644, 0o755].includes(entry.mode)) throw new Error("Unsupported released file mode");
  }
  const manifestEntry = get(manifestPath);
  const manifest = JSON.parse(manifestEntry.content);
  const metadata = JSON.parse(get(".bos-product.json").content);
  if (manifest.name !== "bos" || !stableVersion.test(manifest.version ?? "") ||
      manifest.version.trim() !== manifest.version || metadata.version !== manifest.version || metadata.name !== "bos") {
    throw new Error("Update requires a stable canonical BOS release with matching metadata");
  }
  get(".mcp.json");
  // Replace only the canonical name token, preserving every other manifest byte.
  const original = manifestEntry.content.toString("utf8");
  const nameToken = /"name"\s*:\s*"bos"/g;
  if ([...original.matchAll(nameToken)].length !== 1) throw new Error("Ambiguous canonical BOS name");
  manifestEntry.content = Buffer.from(original.replace(nameToken, token => token.replace(/"bos"$/, JSON.stringify(legacyName))));
  const expectedManifest = { ...manifest, name: legacyName };
  if (JSON.stringify(JSON.parse(manifestEntry.content)) !== JSON.stringify(expectedManifest)) {
    throw new Error("Unexpected marketplace manifest transformation");
  }
  const archive = createDeterministicZip(entries);
  const actual = readZipEntries(archive);
  if (actual.size !== releasedEntries.length) throw new Error("Marketplace entry count changed");
  for (const entry of entries) {
    const result = actual.get(entry.path);
    if (!result || result.mode !== entry.mode || !result.content.equals(entry.content)) {
      throw new Error(`Marketplace ZIP parity failure: ${entry.path}`);
    }
  }
  return { archive, version: manifest.version, entryCount: actual.size,
    sha256: createHash("sha256").update(archive).digest("hex") };
}

export function readPublishedBosEntries(revision) {
  if (typeof revision !== "string" || revision.length !== 40 || !/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error("Supply an exact 40-character published commit");
  }
  execFileSync("git", ["merge-base", "--is-ancestor", revision, "origin/main"], { cwd: root, stdio: "pipe" });
  execFileSync("python3", ["tools/oracle_approval.py", "verify-commit", revision], { cwd: root, stdio: "pipe" });
  const listing = execFileSync("git", ["ls-tree", "-r", "-z", revision, "--", prefix], { cwd: root }).toString();
  return listing.split("\0").filter(Boolean).map(line => {
    const [header, path] = line.split("\t");
    const [mode, kind, hash] = header.split(" ");
    if (kind !== "blob" || !["100644", "100755"].includes(mode)) throw new Error("Unsupported published entry");
    return { path: path.slice(prefix.length), mode: parseInt(mode, 8) & 0o777,
      content: execFileSync("git", ["cat-file", "blob", hash], { cwd: root }) };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw new Error("Usage: node scripts/build-marketplace-update.mjs <published-commit> <legacy-listing-name>");
  const result = createMarketplaceUpdate(readPublishedBosEntries(process.argv[2]), process.argv[3]);
  const directory = resolve(root, "Vault/tmp/marketplace-update");
  await mkdir(directory, { recursive: true });
  const output = resolve(directory, `bos-${result.version}-marketplace-update.zip`);
  await writeFile(output, result.archive);
  console.log(JSON.stringify({ output, sourceCommit: process.argv[2], version: result.version,
    entryCount: result.entryCount, sha256: result.sha256 }));
}
