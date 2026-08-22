import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { bumpReleaseVersion, nextVersion } from "../scripts/bump-release-version.mjs";

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

test("release bump updates canonical active versions and current-release documentation", async () => {
  const root = await mkdtemp(join(tmpdir(), "bos-release-version-"));
  await mkdir(join(root, "products", "bos"), { recursive: true });
  await mkdir(join(root, "products", "education-center"), { recursive: true });
  await mkdir(join(root, "products", "video-ads"), { recursive: true });
  await mkdir(join(root, "Vault", "docs"), { recursive: true });
  await writeJson(join(root, "package.json"), { name: "bos", version: "0.4.27" });
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
    "Current desktop marketplace release: `0.4.27`. If `0.4.26` is installed,\nupgrade.\n"
  );
  await writeFile(
    join(root, "Vault", "docs", "bos-product-licensing-user-experience.md"),
    "| Education Center | Active package, version `0.4.27` | Active |\n"
  );
  await writeFile(
    join(root, "Vault", "docs", "marketplace-submission-assets.md"),
    "| Current version | 0.4.27 | 0.4.27 | 0.1.3 | Ready |\n"
  );

  const result = await bumpReleaseVersion({ root });

  assert.deepEqual(result, {
    previous: "0.4.27",
    version: "0.4.28",
    activeProducts: ["bos", "education-center"]
  });
  assert.equal(JSON.parse(await readFile(join(root, "package.json"))).version, "0.4.28");
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
    await readFile(join(root, "Vault", "docs", "marketplace-submission-assets.md"), "utf8"),
    /0\.4\.28 \| 0\.4\.28 \| 0\.1\.3/
  );
});
