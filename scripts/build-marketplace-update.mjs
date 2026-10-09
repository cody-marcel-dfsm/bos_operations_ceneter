import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDeterministicZip, readZipEntries } from "./lib/deterministic-zip.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = ".codex-plugin/plugin.json";
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function assertProduct(product) {
  if (!["bos", "education-center"].includes(product)) throw new Error("Unsupported marketplace product");
  return product;
}

export function createMarketplaceUpdate(releasedEntries, legacyName, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some(key => !["preserveExistingMcp", "product"].includes(key)) ||
      (Object.hasOwn(options, "preserveExistingMcp") && typeof options.preserveExistingMcp !== "boolean")) {
    throw new Error("Invalid marketplace update options");
  }
  const preserveExistingMcp = Object.hasOwn(options, "preserveExistingMcp") && options.preserveExistingMcp;
  const product = assertProduct(Object.hasOwn(options, "product") ? options.product : "bos");
  if (product !== "bos" && preserveExistingMcp) throw new Error("Existing MCP preservation is BOS-only");
  if (typeof legacyName !== "string" || legacyName.length !== 36 || !/^app-[a-f0-9]{32}$/.test(legacyName)) {
    throw new Error("Supply the existing legacy listing package name");
  }
  const entries = releasedEntries.map(entry => ({ ...entry, content: Buffer.from(entry.content) }));
  const get = path => {
    const matches = entries.filter(entry => entry.path === path);
    if (matches.length !== 1) throw new Error(`Expected one released ${product} file: ${path}`);
    return matches[0];
  };
  for (const entry of entries) {
    if (![0o644, 0o755].includes(entry.mode)) throw new Error("Unsupported released file mode");
  }
  const manifestEntry = get(manifestPath);
  const manifest = JSON.parse(manifestEntry.content);
  const metadata = JSON.parse(get(".bos-product.json").content);
  if (manifest.name !== product || !stableVersion.test(manifest.version ?? "") ||
      manifest.version.trim() !== manifest.version || metadata.version !== manifest.version || metadata.name !== product) {
    throw new Error(`Update requires a stable canonical ${product} release with matching metadata`);
  }
  if (product === "bos") get(".mcp.json");
  else if (Object.hasOwn(manifest, "mcpServers") || Object.hasOwn(manifest, "apps") ||
      entries.some(entry => [".mcp.json", ".app.json"].includes(entry.path)) ||
      metadata.connection_owner !== "bos" || !metadata.dependency_products?.includes("bos")) {
    throw new Error("Education export requires the BOS-owned connection and no independent binding");
  }
  // Replace only the canonical name token, preserving every other manifest byte.
  const original = manifestEntry.content.toString("utf8");
  const nameToken = new RegExp(`"name"\\s*:\\s*"${product}"`, "g");
  if ([...original.matchAll(nameToken)].length !== 1) throw new Error(`Ambiguous canonical ${product} name`);
  manifestEntry.content = Buffer.from(original.replace(nameToken, token => token.slice(0, -JSON.stringify(product).length) + JSON.stringify(legacyName)));
  const expectedManifest = { ...manifest, name: legacyName };
  if (preserveExistingMcp) {
    // Marketplace metadata update only: test retention of the host's existing
    // legacy association. Never install this export as a standalone client.
    const declaration = /,\n  "mcpServers": "\.\/\.mcp\.json"\n(?=})/g;
    const text = manifestEntry.content.toString("utf8");
    if (manifest.mcpServers !== "./.mcp.json" || Object.hasOwn(manifest, "apps") ||
        [...text.matchAll(declaration)].length !== 1) {
      throw new Error("Expected the canonical final MCP declaration for a legacy metadata update");
    }
    manifestEntry.content = Buffer.from(text.replace(declaration, "\n"));
    delete expectedManifest.mcpServers;
  }
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
  return { archive, version: manifest.version, entryCount: actual.size, preserveExistingMcp,
    sha256: createHash("sha256").update(archive).digest("hex") };
}

export function readPublishedProductEntries(revision, product = "bos") {
  assertProduct(product);
  const prefix = `clients/codex/plugins/${product}/`;
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

export function readPublishedBosEntries(revision) {
  return readPublishedProductEntries(revision, "bos");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {};
  for (let index = 4; index < process.argv.length; index++) {
    const argument = process.argv[index];
    if (argument === "--product" && !Object.hasOwn(options, "product")) options.product = assertProduct(process.argv[++index]);
    else if (argument === "--preserve-existing-mcp" && !Object.hasOwn(options, "preserveExistingMcp")) options.preserveExistingMcp = true;
    else throw new Error("Invalid marketplace update argument");
  }
  const product = options.product ?? "bos";
  const result = createMarketplaceUpdate(readPublishedProductEntries(process.argv[2], product), process.argv[3], options);
  const directory = resolve(root, "Vault/tmp/marketplace-update");
  await mkdir(directory, { recursive: true });
  const output = resolve(directory, `${product}-${result.version}-marketplace-${result.preserveExistingMcp ? "existing-mcp-" : ""}update.zip`);
  await writeFile(output, result.archive);
  console.log(JSON.stringify({ output, sourceCommit: process.argv[2], version: result.version,
    entryCount: result.entryCount, sha256: result.sha256, preserveExistingMcp: result.preserveExistingMcp }));
}
