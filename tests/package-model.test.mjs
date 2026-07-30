import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  listProducts,
  resolveProductSkills,
  root,
  validateProduct
} from "../scripts/lib/package-model.mjs";

test("all product manifests validate and resolve unique skills", async () => {
  const products = await listProducts();
  assert.equal(products.length, 2);
  for (const { path, manifest } of products) {
    assert.deepEqual(validateProduct(manifest, path), []);
    const skills = await resolveProductSkills(manifest);
    assert.equal(skills.length, new Set(skills.map((skill) => skill.name)).size);
  }
});

test("iCode composition contains no BOS foundation copies", async () => {
  const products = await listProducts();
  const byName = Object.fromEntries(
    products.map(({ manifest }) => [manifest.name, manifest])
  );
  const iCode = await resolveProductSkills(byName["icode-operations-center"]);
  assert(iCode.some((skill) => skill.name === "icode-class-operations"));
  const bos = await resolveProductSkills(byName.bos);
  const bosNames = new Set(bos.map((skill) => skill.name));
  assert(iCode.every((skill) => !bosNames.has(skill.name)));
});

test("the packaged BOS broker compiles with the system Python runtime", () => {
  const result = spawnSync(
    "python3",
    ["-m", "py_compile", "source/runtime/bos/scripts/bos_mcp_broker.py"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PYTHONPYCACHEPREFIX: "/tmp/bos-package-pycache" }
    }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
