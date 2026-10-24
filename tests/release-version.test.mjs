import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { bumpReleaseVersion, nextVersion } from "../scripts/bump-release-version.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("release versions default to a patch increment", () => {
  assert.equal(nextVersion("0.4.27"), "0.4.28");
  assert.equal(nextVersion("0.4.27", "minor"), "0.5.0");
  assert.equal(nextVersion("0.4.27", "major"), "1.0.0");
  assert.equal(nextVersion("0.4.27", "0.6.0"), "0.6.0");
  assert.throws(() => nextVersion("0.4.27", "0.4.27"), /must be greater/);
});

test("unchanged delivered checkout runs no release build and creates no version", async () => {
  const root = await mkdtemp(join(tmpdir(), "bos-release-no-changes-"));
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "tools"));
  await writeFile(join(root, ".gitignore"), "__pycache__/\n");
  const nativeModules = (await readdir(join(repositoryRoot, "tools")))
    .filter((name) => name.endsWith(".py")).map((name) => `tools/${name}`);
  for (const path of ["scripts/bump-release-version.mjs", "scripts/release.mjs", ...nativeModules]) {
    await writeFile(join(root, path), await readFile(join(repositoryRoot, path)));
  }
  await writeJson(join(root, "package.json"), { type: "module", version: "0.4.27", scripts: {
    release: "node scripts/release.mjs",
    "release:check": "node -e \"require('fs').writeFileSync('unexpected-build', 'ran')\""
  } });
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q");
  git("config", "user.name", "Synthetic Release");
  git("config", "user.email", "release@example.invalid");
  git("add", ".");
  git("commit", "-qm", "already published");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  const original = await readFile(join(root, "package.json"), "utf8");
  assert.match(execFileSync("node", ["scripts/bump-release-version.mjs"], { cwd: root, encoding: "utf8" }), /NO_CHANGES/);
  assert.match(execFileSync("npm", ["run", "release"], { cwd: root, encoding: "utf8" }), /NO_CHANGES/);
  assert.equal(await readFile(join(root, "package.json"), "utf8"), original);
  assert.equal(await pathExists(join(root, "unexpected-build")), false);
  assert.equal(git("status", "--porcelain=v1", "--untracked-files=all"), "");
  git("update-ref", "-d", "refs/remotes/origin/main");
  for (const command of [["node", ["scripts/bump-release-version.mjs"]], ["npm", ["run", "release"]]]) {
    assert.throws(() => execFileSync(command[0], command[1], { cwd: root, encoding: "utf8", stdio: "pipe" }),
      /baseline UNAVAILABLE/);
  }
  assert.equal(await readFile(join(root, "package.json"), "utf8"), original);
  assert.equal(await pathExists(join(root, "unexpected-build")), false);
});

test("real repository contains every release-required version and documentation marker", async () => {
  const repositoryPackage = JSON.parse(
    await readFile(join(repositoryRoot, "package.json"), "utf8")
  );
  const packageManifest = JSON.parse(
    await readFile(join(repositoryRoot, "package-manifest.json"), "utf8")
  );
  const current = repositoryPackage.version;

  assert.equal(packageManifest.version, current, "package manifest must match the repository release");

  const productRoot = join(repositoryRoot, "products");
  const productNames = await readdir(productRoot);
  for (const name of productNames) {
    const product = JSON.parse(
      await readFile(join(productRoot, name, "product.json"), "utf8")
    );
    if (product.release_status === "active") {
      assert.equal(product.version, current, `${name} must match the repository release`);
    }
  }

  const requiredMarkers = [
    {
      path: join(repositoryRoot, "README.md"),
      marker: `Current source package release: \`${current}\`. If \``
    }
  ];
  if (await pathExists(join(repositoryRoot, "Vault", "docs"))) {
    requiredMarkers.push(
      {
        path: join(repositoryRoot, "Vault", "docs", "bos-product-licensing-user-experience.md"),
        marker: `Current BOS Operations Center release: \`${current}\`.`
      },
      {
        path: join(repositoryRoot, "Vault", "docs", "marketplace-submission-assets.md"),
        marker: `Current BOS marketplace package release: \`${current}\`.`
      }
    );
  }

  for (const { path, marker } of requiredMarkers) {
    const content = await readFile(path, "utf8");
    const matches = content.split(marker).length - 1;
    assert.equal(matches, 1, `${path} must contain exactly one required release marker`);
  }
});

test("release bump updates canonical active versions and current-release documentation", async () => {
  const root = await mkdtemp(join(tmpdir(), "bos-release-version-"));
  await mkdir(join(root, "products", "bos"), { recursive: true });
  await mkdir(join(root, "products", "education-center"), { recursive: true });
  await mkdir(join(root, "products", "video-ads"), { recursive: true });
  await mkdir(join(root, "Vault", "docs"), { recursive: true });
  await writeJson(join(root, "package.json"), { name: "bos", version: "0.4.27" });
  await writeJson(join(root, "package-lock.json"), { version: "0.4.27", packages: { "": { version: "0.4.27" }, "node_modules/example": { version: "1.0.0" } } });
  await writeJson(join(root, "package-manifest.json"), { version: "0.4.27" });
  await writeJson(join(root, "products", "bos", "product.json"), {
    name: "bos", version: "0.4.27", release_status: "active"
  });
  await writeJson(join(root, "products", "education-center", "product.json"), {
    name: "education-center", version: "0.4.27", release_status: "active"
  });
  await writeJson(join(root, "products", "video-ads", "product.json"), {
    name: "video-ads", version: "0.1.3", release_status: "disabled"
  });
  await writeFile(
    join(root, "README.md"),
    "Current source package release: `0.4.27`. If `0.4.26` is installed,\nupgrade.\n"
  );
  await writeFile(
    join(root, "Vault", "docs", "bos-product-licensing-user-experience.md"),
    "Current BOS Operations Center release: `0.4.27`.\n"
  );
  await writeFile(
    join(root, "Vault", "docs", "marketplace-submission-assets.md"),
    "Current BOS marketplace package release: `0.4.27`.\n"
  );

  const result = await bumpReleaseVersion({ root });

  assert.deepEqual(result, {
    previous: "0.4.27",
    version: "0.4.28",
    activeProducts: ["bos", "education-center"]
  });
  assert.equal(JSON.parse(await readFile(join(root, "package.json"))).version, "0.4.28");
  const lock = JSON.parse(await readFile(join(root, "package-lock.json")));
  assert.equal(lock.version, "0.4.28");
  assert.equal(lock.packages[""].version, "0.4.28");
  assert.equal(lock.packages["node_modules/example"].version, "1.0.0");
  assert.equal(
    JSON.parse(await readFile(join(root, "products", "education-center", "product.json"))).version,
    "0.4.28"
  );
  assert.equal(
    JSON.parse(await readFile(join(root, "products", "video-ads", "product.json"))).version,
    "0.1.3"
  );
  assert.match(await readFile(join(root, "README.md"), "utf8"), /release: `0\.4\.28`\. If `0\.4\.27`/);
  assert.match(
    await readFile(join(root, "Vault", "docs", "bos-product-licensing-user-experience.md"), "utf8"),
    /Current BOS Operations Center release: `0\.4\.28`\./
  );
  assert.match(
    await readFile(join(root, "Vault", "docs", "marketplace-submission-assets.md"), "utf8"),
    /Current BOS marketplace package release: `0\.4\.28`\./
  );
});

test("explicit package-line transition uses the native gate and preserves historical component identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "bos-release-line-"));
  for (const name of ["scripts", "tools", "products/bos", "products/education-center", "Vault/docs", "source/component"]) {
    await mkdir(join(root, name), { recursive: true });
  }
  for (const name of (await readdir(join(repositoryRoot, "tools"))).filter(name => name.endsWith(".py"))) {
    await writeFile(join(root, "tools", name), await readFile(join(repositoryRoot, "tools", name)));
  }
  await writeFile(join(root, "scripts/bump-release-version.mjs"), await readFile(join(repositoryRoot, "scripts/bump-release-version.mjs")));
  await writeFile(join(root, ".gitignore"), "__pycache__/\n");
  await writeJson(join(root, "package.json"), { name: "bos-operations-center", version: "0.4.211" });
  await writeJson(join(root, "package-lock.json"), { version: "0.4.211", packages: { "": { version: "0.4.211" } } });
  await writeJson(join(root, "package-manifest.json"), { package: "bos-operations-center", version: "0.4.211" });
  for (const name of ["bos", "education-center"]) {
    await writeJson(join(root, "products", name, "product.json"), { name, version: "0.4.211", release_status: "active" });
  }
  await writeFile(join(root, "README.md"), "Current source package release: `0.4.211`. If `0.4.210` is installed,\nupgrade.\n");
  await writeFile(join(root, "Vault/docs/bos-product-licensing-user-experience.md"), "Current BOS Operations Center release: `0.4.211`.\n");
  await writeFile(join(root, "Vault/docs/marketplace-submission-assets.md"), "Current BOS marketplace package release: `0.4.211`.\n");
  const component = '---\nname: component\ndescription: Synthetic independently versioned component.\nmetadata:\n  version: "1.0.9"\n  requires: "{}"\n---\n';
  await writeFile(join(root, "source/component/SKILL.md"), component);
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q");
  git("config", "user.name", "Synthetic Release");
  git("config", "user.email", "release@example.invalid");
  git("add", ".");
  git("commit", "-qm", "published predecessor");
  const baseline = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", baseline);
  await bumpReleaseVersion({ root });
  const transition = { id: "client-zero-minor-line", from_commit: baseline, from_version: "0.4.211", to_version: "0.0.212" };
  await writeJson(join(root, "package-manifest.json"), { package: "bos-operations-center", version: "0.4.212", release_line_transitions: [transition] });
  await assert.rejects(bumpReleaseVersion({ root, requested: "0.0.212" }), /must be greater/);
  await assert.rejects(bumpReleaseVersion({ root, transitionId: "unknown" }), /Unknown declared/);
  const result = await bumpReleaseVersion({ root, transitionId: transition.id });
  assert.equal(result.version, "0.0.212");
  assert.deepEqual(result.releaseLineTransition, transition);
  assert.match(await readFile(join(root, "README.md"), "utf8"), /release: `0\.0\.212`\. If `0\.4\.211`/);
  assert.equal(await readFile(join(root, "source/component/SKILL.md"), "utf8"), component);
  assert.equal(JSON.parse(git("show", `${baseline}:package.json`)).version, "0.4.211");
  const before = await readFile(join(root, "README.md"), "utf8");
  await bumpReleaseVersion({ root, transitionId: transition.id });
  assert.equal(await readFile(join(root, "README.md"), "utf8"), before);
  assert.match(execFileSync(process.execPath, ["scripts/bump-release-version.mjs"], { cwd: root, encoding: "utf8" }), /Release 0\.0\.212 is already prepared/);
  git("add", ".");
  git("commit", "-qm", "published package-line transition");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  const next = await bumpReleaseVersion({ root });
  assert.equal(next.version, "0.0.213");
  assert.equal(await readFile(join(root, "source/component/SKILL.md"), "utf8"), component);
});
