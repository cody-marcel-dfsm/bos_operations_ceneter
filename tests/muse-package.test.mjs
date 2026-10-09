import assert from "node:assert/strict";
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";
import {listProducts, readJson, resolveProductSkills, root, supportedClients} from "../scripts/lib/package-model.mjs";
import {musePluginManifest, museSettingsTemplate, validateMusePackage} from "../scripts/lib/muse-package.mjs";
import {verifyExternalProductPackage} from "../scripts/lib/product-mcp-contract.mjs";

test("Muse packages preserve every composed skill, reference, asset and dependency", async () => {
  assert.ok(supportedClients.has("muse"));
  const packageManifest = await readJson(join(root, "package-manifest.json"));
  assert.equal(packageManifest.clients.muse, "./clients/muse");
  for (const {manifest: product} of await listProducts()) {
    if (product.release_status !== "active") continue;
    assert.ok(product.clients.includes("muse"));
    const skills = await resolveProductSkills(product);
    const directory = join(root, "clients/muse/plugins", product.name);
    assert.deepEqual(await validateMusePackage(product, skills, directory), []);
    const manifest = await readJson(join(directory, ".muse-plugin/plugin.json"));
    assert.deepEqual(manifest, musePluginManifest(product, skills));
    assert.equal(manifest.capabilities.mcpServers, undefined);
    assert.equal(manifest.meta.brandColor, "#061638");
    assert.ok(manifest.capabilities.skills.some(({id}) => id === "bos-mcp-client"));
    assert.ok(manifest.capabilities.skills.some(({id}) => id === "submit-feedback"));
    for (const {id, path} of manifest.capabilities.skills) {
      assert.match(id, /^[a-z0-9][a-z0-9._-]{0,79}$/);
      assert.equal(path, `skills/${id}/SKILL.md`);
    }
    if (product.name === "education-center") {
      assert.ok(manifest.capabilities.skills.some(({id}) => id === "education-center-student-operations"));
      assert.ok(manifest.meta.dependencies.includes("my-crm"));
    }
  }
});

test("Muse BOS settings declare exactly one unchanged host-managed connection", async () => {
  const product = await readJson(join(root, "products/bos/product.json"));
  const actual = await readJson(join(root, "clients/muse/plugins/bos/muse-settings.template.json"));
  assert.deepEqual(actual, {
    schema_version: 1,
    mcpServers: {"BOS-Platform": {type: "streamable-http", url: "https://dfsm.ai/mcp/apps/bos/platform"}}
  });
  assert.deepEqual(actual, museSettingsTemplate(product));
  const education = await readJson(join(root, "products/education-center/product.json"));
  assert.throws(() => museSettingsTemplate(education), /Only the connection owner/);
  const readme = await readFile(join(root, "clients/muse/plugins/bos/README.md"), "utf8");
  assert.match(readme, /muse mcp login BOS-Platform/);
  assert.match(readme, /preserve other settings and servers/);
});

test("Muse checks reject skill drift, duplicate connections and dependent transports", async (t) => {
  const base = join(root, "Vault/tmp/muse-client/tests");
  await mkdir(base, {recursive: true});
  const directory = await mkdtemp(join(base, "package-"));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const product = await readJson(join(root, "products/bos/product.json"));
  const skills = await resolveProductSkills(product);
  await cp(join(root, "clients/muse/plugins/bos"), directory, {recursive: true});
  const settings = museSettingsTemplate(product);
  settings.mcpServers.duplicate = {...settings.mcpServers["BOS-Platform"]};
  await writeFile(join(directory, "muse-settings.template.json"), JSON.stringify(settings));
  assert.ok((await validateMusePackage(product, skills, directory)).includes("Muse BOS settings binding drift"));
  await writeFile(join(directory, "muse-settings.template.json"), JSON.stringify(museSettingsTemplate(product)));
  await writeFile(join(directory, "skills/bos-mcp-client/SKILL.md"), "changed guidance");
  assert.ok((await validateMusePackage(product, skills, directory)).some((finding) => finding.startsWith("Muse skill source drift")));
  await rm(directory, {recursive: true});
  await cp(join(root, "clients/muse/plugins/education-center"), directory, {recursive: true});
  // Synthetic external plugin metadata removes the education dependency so the
  // test isolates the native transport rejection rather than another product.
  const metadata = await readJson(join(directory, ".bos-product.json"));
  metadata.dependency_products = ["bos"];
  delete metadata.independent_product_dependencies;
  await writeFile(join(directory, ".bos-product.json"), JSON.stringify(metadata));
  assert.equal((await verifyExternalProductPackage({root, packageRoot: directory})).status, "passed");
  const manifest = await readJson(join(directory, ".muse-plugin/plugin.json"));
  manifest.capabilities.mcpServers = [{id: "second", transport: "http", url: "https://example.test/mcp"}];
  await writeFile(join(directory, ".muse-plugin/plugin.json"), JSON.stringify(manifest));
  const result = await verifyExternalProductPackage({root, packageRoot: directory});
  assert.ok(result.violations.some(({code}) => code === "dependent_transport"));
});
