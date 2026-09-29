import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  assertIndependentProductsReady,
  inspectIndependentProductPackage,
  inspectInstalledIndependentProducts,
  localDependencyNames
} from "../scripts/lib/independent-product-dependencies.mjs";

const dependency = {
  name: "my-crm",
  distribution: "independent",
  required_skills: ["my-crm-record-operations", "my-crm-customer-journey"],
  required_runtime_verification_tools: [
    "lead_director_create_lead",
    "lead_director_search_leads",
    "lead_director_update_lead",
    "lead_director_get_customer_journey"
  ]
};

async function packageRoot(context, { tools = dependency.required_runtime_verification_tools } = {}) {
  const root = await mkdtemp(join(tmpdir(), "independent-product-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const skill of dependency.required_skills) {
    await mkdir(join(root, "skills", skill), { recursive: true });
    await writeFile(join(root, "skills", skill, "SKILL.md"), `---\nname: ${skill}\n---\n`);
  }
  await writeFile(join(root, ".bos-product.json"), JSON.stringify({
    schema_version: "2",
    name: "my-crm",
    version: "0.2.26",
    runtime_verification_tools: tools
  }));
  return root;
}

test("independent dependencies stay separate from same-marketplace dependencies", () => {
  assert.deepEqual(localDependencyNames({
    dependency_products: ["bos", "my-crm"],
    independent_product_dependencies: [dependency]
  }), ["bos"]);
});

test("a complete independently installed My CRM package is ready", async (context) => {
  const installPath = await packageRoot(context);
  assert.deepEqual(await inspectIndependentProductPackage(installPath, dependency), {
    name: "my-crm",
    version: "0.2.26",
    state: "ready"
  });
  const results = await inspectInstalledIndependentProducts({
    independent_product_dependencies: [dependency]
  }, [{ name: "my-crm", enabled: true, installPath }]);
  assert.doesNotThrow(() => assertIndependentProductsReady(results));
});

test("missing, disabled, and downgraded independent products fail closed with rollback guidance", async (context) => {
  for (const installed of [[], [{ name: "my-crm", enabled: false }]]) {
    const results = await inspectInstalledIndependentProducts({
      independent_product_dependencies: [dependency]
    }, installed);
    assert.throws(
      () => assertIndependentProductsReady(results),
      /Install or update it from its own distribution/
    );
  }
  const installPath = await packageRoot(context, {
    tools: dependency.required_runtime_verification_tools.slice(0, -1)
  });
  const result = await inspectIndependentProductPackage(installPath, dependency);
  assert.equal(result.state, "outdated");
  assert.deepEqual(result.missing_runtime_verification_tools, [
    "lead_director_get_customer_journey"
  ]);
});
