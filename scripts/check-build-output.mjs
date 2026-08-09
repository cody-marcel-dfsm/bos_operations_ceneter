import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathExists, root } from "./lib/package-model.mjs";

const dist = join(root, "dist");
const packageManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const releaseManifest = JSON.parse(await readFile(join(dist, "release-manifest.json"), "utf8"));

assert.equal(releaseManifest.schema_version, "1");
assert.equal(releaseManifest.archives.length, 9);
for (const archive of releaseManifest.archives) {
  assert(await pathExists(join(dist, archive.file)), `missing ${archive.file}`);
  assert.match(archive.sha256, /^[a-f0-9]{64}$/);
}

const versionedZip = join(
  dist,
  `bos-operations-center-macos-${packageManifest.version}.zip`
);
const stableZip = join(dist, "bos-operations-center-macos.zip");
assert(await pathExists(versionedZip), `missing ${versionedZip}`);
assert(await pathExists(stableZip), `missing ${stableZip}`);

const listing = spawnSync("python3", [
  "-c",
  [
    "import sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1]) as archive:",
    " print('\\n'.join(sorted(archive.namelist())))"
  ].join("\n"),
  stableZip
], { encoding: "utf8" });
assert.equal(listing.status, 0, listing.stderr || listing.stdout);
assert.match(listing.stdout, /bos-operations-center\/install\.sh/);
assert.match(
  listing.stdout,
  /icode-operations-center\/config\/customer-settings\.template\.json/
);
assert.match(listing.stdout, /bos\/bin\/bos-mcp-broker/);

console.log("Build output contains all product archives and the deployable customer ZIP.");
