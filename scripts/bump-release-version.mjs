import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function nextVersion(current, requested = "patch") {
  const match = current.match(semverPattern);
  if (!match) throw new Error(`Invalid current release version: ${current}`);

  const [, majorText, minorText, patchText] = match;
  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);
  if (requested === "patch") return `${major}.${minor}.${patch + 1}`;
  if (requested === "minor") return `${major}.${minor + 1}.0`;
  if (requested === "major") return `${major + 1}.0.0`;
  if (!semverPattern.test(requested)) {
    throw new Error(`Version must be patch, minor, major, or an exact x.y.z value: ${requested}`);
  }

  const requestedParts = requested.split(".").map(Number);
  const currentParts = [major, minor, patch];
  const isGreater = requestedParts.some(
    (part, index) => part > currentParts[index] &&
      requestedParts.slice(0, index).every((value, prior) => value === currentParts[prior])
  );
  if (!isGreater) throw new Error(`Requested version must be greater than ${current}: ${requested}`);
  return requested;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceExactly(content, currentText, replacement, path) {
  const matches = content.split(currentText).length - 1;
  if (matches !== 1) {
    throw new Error(`${path}: expected exactly one release marker, found ${matches}`);
  }
  return content.replace(currentText, replacement);
}

function replacePatternExactly(content, pattern, replacement, path) {
  const matches = [...content.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`${path}: expected exactly one release marker, found ${matches.length}`);
  }
  return content.replace(pattern, replacement);
}

export async function bumpReleaseVersion({ root = scriptRoot, requested = "patch" } = {}) {
  const packagePath = join(root, "package.json");
  const packageManifestPath = join(root, "package-manifest.json");
  const repositoryPackage = await readJson(packagePath);
  const packageManifest = await readJson(packageManifestPath);
  const current = repositoryPackage.version;
  const next = nextVersion(current, requested);

  if (packageManifest.version !== current) {
    throw new Error(`package-manifest.json version ${packageManifest.version} does not match ${current}`);
  }

  const productRoot = join(root, "products");
  const productNames = (await readdir(productRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const activeProducts = [];
  for (const name of productNames) {
    const path = join(productRoot, name, "product.json");
    const product = await readJson(path);
    if (product.release_status !== "active") continue;
    if (product.version !== current) {
      throw new Error(`${path} version ${product.version} does not match ${current}`);
    }
    activeProducts.push({ path, product });
  }
  if (!activeProducts.length) throw new Error("No active products found");

  const readmePath = join(root, "README.md");
  const licensingPath = join(root, "Vault", "docs", "bos-product-licensing-user-experience.md");
  const marketplacePath = join(root, "Vault", "docs", "marketplace-submission-assets.md");
  const [readme, licensing, marketplace] = await Promise.all([
    readFile(readmePath, "utf8"),
    readFile(licensingPath, "utf8"),
    readFile(marketplacePath, "utf8")
  ]);

  const nextReadme = replacePatternExactly(
    readme,
    new RegExp(
      "Current desktop marketplace release: `" +
        current.replaceAll(".", "\\.") +
        "`\\. If `[^`]+` is installed,",
      "g"
    ),
    `Current desktop marketplace release: \`${next}\`. If \`${current}\` is installed,`,
    readmePath
  );
  const nextLicensing = replaceExactly(
    licensing,
    `Current BOS Operations Center release: \`${current}\`.`,
    `Current BOS Operations Center release: \`${next}\`.`,
    licensingPath
  );
  const nextMarketplace = replaceExactly(
    marketplace,
    `Current BOS marketplace package release: \`${current}\`.`,
    `Current BOS marketplace package release: \`${next}\`.`,
    marketplacePath
  );

  repositoryPackage.version = next;
  packageManifest.version = next;
  await Promise.all([
    writeJson(packagePath, repositoryPackage),
    writeJson(packageManifestPath, packageManifest),
    ...activeProducts.map(({ path, product }) => {
      product.version = next;
      return writeJson(path, product);
    }),
    writeFile(readmePath, nextReadme),
    writeFile(licensingPath, nextLicensing),
    writeFile(marketplacePath, nextMarketplace)
  ]);

  return { previous: current, version: next, activeProducts: activeProducts.map(({ product }) => product.name) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await bumpReleaseVersion({ requested: process.argv[2] ?? "patch" });
  console.log(`Bumped release ${result.previous} -> ${result.version} for ${result.activeProducts.join(", ")}.`);
}
