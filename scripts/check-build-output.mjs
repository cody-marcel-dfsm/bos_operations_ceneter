import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { pathExists, root } from "./lib/package-model.mjs";

const dist = join(root, "dist");
const releaseManifest = JSON.parse(await readFile(join(dist, "release-manifest.json"), "utf8"));
const packageManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

assert.equal(releaseManifest.schema_version, "1");
assert.equal(releaseManifest.archives.length, 8);
for (const archive of releaseManifest.archives) {
  assert(await pathExists(join(dist, archive.file)), `missing ${archive.file}`);
  assert.match(archive.sha256, /^[a-f0-9]{64}$/);
}
const claudeArchives = releaseManifest.archives.filter(
  ({ client }) => client === "claude"
);
assert.equal(claudeArchives.length, 2);
assert(claudeArchives.every(({ file }) => /-claude\.zip$/.test(file)));
assert(
  releaseManifest.archives
    .filter(({ client }) => client !== "claude")
    .every(({ file }) => file.endsWith(".tar.gz"))
);

const stableZip = join(dist, "bos-operations-center.zip");
assert(await pathExists(stableZip), `missing ${stableZip}`);
const versionedName = `bos-operations-center-${packageManifest.version}.zip`;
const versionedZip = join(dist, versionedName);
assert(await pathExists(versionedZip), `missing ${versionedZip}`);
assert.deepEqual(await readFile(versionedZip), await readFile(stableZip));
assert.deepEqual(
  (await readdir(dist)).filter((file) => /^bos-operations-center-\d.*\.zip$/.test(file)),
  [versionedName]
);
assert.equal(
  await pathExists(join(dist, "bos-operations-center-macos.zip")),
  false,
  "obsolete platform-specific ZIP remains in build output"
);

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
assert.match(listing.stdout, /bos-operations-center\/README_INSTALL\.md/);
assert.doesNotMatch(
  listing.stdout,
  /bos-operations-center\/scripts\/launch-codex-with-bos\.swift/
);
assert.match(
  listing.stdout,
  /bos-operations-center\/scripts\/install-package\.mjs/
);
assert.match(
  listing.stdout,
  /bos-operations-center\/scripts\/lib\/codex-layout\.mjs/
);
assert.match(
  listing.stdout,
  /bos-operations-center\/scripts\/install-claude-local\.mjs/
);
assert.match(listing.stdout, /bos-operations-center\/package\.json/);
assert.match(
  listing.stdout,
  /clients\/codex\/plugins\/education-center\/config\/customer-settings\.template\.json/
);
assert.doesNotMatch(listing.stdout, /clients\/claude\/plugins\/bos\/\.mcp\.json/);
assert.match(
  listing.stdout,
  /clients\/claude\/\.claude-plugin\/marketplace\.json/
);
assert.match(listing.stdout, /clients\/copilot\/products\/bos\/skills/);
assert.doesNotMatch(listing.stdout, /clients\/copilot\/products\/bos\/\.github\/mcp\.json/);
assert.match(listing.stdout, /clients\/gemini\/extensions\/bos\/gemini-extension\.json/);
assert.match(listing.stdout, /clients\/gemini\/extensions\/bos\/plugin\.json/);
assert.match(
  listing.stdout,
  /clients\/gemini\/extensions\/education-center\/mcp_config\.json/
);
assert.doesNotMatch(listing.stdout, /bos-mcp-broker|\/bin\//);
assert.doesNotMatch(listing.stdout, /video-ads/);
assert.match(listing.stdout, /clients\/disabled-products\.json/);

const extractedRoot = await mkdtemp(join(tmpdir(), "bos-customer-installer-"));
try {
  const extraction = spawnSync("python3", [
    "-c",
    "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",
    stableZip,
    extractedRoot
  ], { encoding: "utf8" });
  assert.equal(extraction.status, 0, extraction.stderr || extraction.stdout);
  const packageRoot = join(extractedRoot, "bos-operations-center");
  const installer = await import(pathToFileURL(
    join(packageRoot, "scripts", "install-package.mjs")
  ).href);
  const testHome = join(extractedRoot, "home");
  const retiredRoot = join(testHome, "plugins", "video-ads");
  await mkdir(retiredRoot, { recursive: true });
  await writeFile(
    join(retiredRoot, ".bos-product.json"),
    JSON.stringify({ name: "video-ads" })
  );
  const marketplaceRoot = join(
    testHome,
    ".agents",
    "bos-education-center-marketplace",
    ".agents",
    "plugins"
  );
  await mkdir(marketplaceRoot, { recursive: true });
  await writeFile(join(marketplaceRoot, "marketplace.json"), JSON.stringify({
    name: "bos-education-center",
    interface: { displayName: "BOS + Education Center" },
    plugins: [{
      name: "video-ads",
      source: { source: "local", path: "./plugins/video-ads" },
      policy: { installation: "AVAILABLE", authentication: "ON_USE" },
      category: "Marketing"
    }]
  }));
  let mcpRegistered = true;
  let pluginInstalled = true;
  const runCommand = async (_command, args) => {
    if (args[0] === "mcp" && args[1] === "get") {
      if (mcpRegistered) return {
        stdout: "url: https://dfsm.ai/mcp/apps/leaddirector/video-ads"
      };
      throw Object.assign(new Error("missing"), {
        stderr: "Error: No MCP server named 'video-ads' found."
      });
    }
    if (args[0] === "mcp" && args[1] === "remove") {
      mcpRegistered = false;
      return { stdout: "Removed global MCP server 'video-ads'." };
    }
    if (args[0] === "plugin" && args[1] === "list") return {
      stdout: pluginInstalled
        ? "video-ads@bos-education-center installed, enabled 0.1.3 /tmp/video-ads"
        : "video-ads@bos-education-center not installed /tmp/video-ads"
    };
    if (args[0] === "plugin" && args[1] === "remove") {
      pluginInstalled = false;
      return { stdout: JSON.stringify({ pluginId: "video-ads@bos-education-center" }) };
    }
    return { stdout: "" };
  };
  const first = await installer.applyInstallation({
    home: testHome,
    product: "bos",
    runCommand
  });
  assert.equal(first.state, "managed-current");
  assert(first.disabled_product_actions.some((action) =>
    action.startsWith("retired_plugin:video-ads:")
  ));
  await assert.rejects(stat(retiredRoot));
  const second = await installer.applyInstallation({
    home: testHome,
    product: "bos",
    runCommand
  });
  assert.deepEqual(second.disabled_product_actions, []);
} finally {
  await rm(extractedRoot, { recursive: true, force: true });
}

console.log("Build output contains all product archives and both customer ZIP names.");
