import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function independentDependencyNames(metadata) {
  return new Set(
    (metadata.independent_product_dependencies ?? []).map(({ name }) => name)
  );
}

export function localDependencyNames(metadata) {
  const independent = independentDependencyNames(metadata);
  return (metadata.dependency_products ?? []).filter((name) => !independent.has(name));
}

export function independentDependencyContracts(products) {
  const byName = new Map();
  for (const product of products) {
    for (const dependency of product.independent_product_dependencies ?? []) {
      const prior = byName.get(dependency.name);
      if (prior && JSON.stringify(prior) !== JSON.stringify(dependency)) {
        throw new Error(`Independent product dependency contract differs for ${dependency.name}`);
      }
      byName.set(dependency.name, dependency);
    }
  }
  return [...byName.values()];
}

export async function inspectIndependentProductPackage(packageRoot, dependency) {
  let metadata;
  try {
    metadata = JSON.parse(await readFile(join(packageRoot, ".bos-product.json"), "utf8"));
  } catch {
    return {
      name: dependency.name,
      state: "invalid",
      reason: "missing_or_invalid_product_metadata"
    };
  }
  if (metadata.name !== dependency.name) {
    return { name: dependency.name, state: "invalid", reason: "product_name_mismatch" };
  }
  const missingSkills = [];
  for (const skill of dependency.required_skills) {
    if (!await exists(join(packageRoot, "skills", skill, "SKILL.md"))) {
      missingSkills.push(skill);
    }
  }
  const advertisedTools = new Set(metadata.runtime_verification_tools ?? []);
  const missingTools = dependency.required_runtime_verification_tools.filter(
    (tool) => !advertisedTools.has(tool)
  );
  if (missingSkills.length > 0 || missingTools.length > 0) {
    return {
      name: dependency.name,
      state: "outdated",
      reason: "required_capability_missing",
      missing_skills: missingSkills,
      missing_runtime_verification_tools: missingTools
    };
  }
  return {
    name: dependency.name,
    version: metadata.version,
    state: "ready"
  };
}

export async function inspectInstalledIndependentProducts(
  metadata,
  installedProducts
) {
  const results = [];
  for (const dependency of metadata.independent_product_dependencies ?? []) {
    const candidates = installedProducts.filter(({ name }) => name === dependency.name);
    const enabled = candidates.filter(({ enabled }) => enabled !== false);
    if (enabled.length === 0) {
      results.push({
        name: dependency.name,
        state: "missing",
        reason: candidates.length > 0 ? "product_disabled" : "product_not_installed"
      });
      continue;
    }
    let best;
    for (const candidate of enabled) {
      if (!candidate.installPath) continue;
      const result = await inspectIndependentProductPackage(candidate.installPath, dependency);
      if (result.state === "ready") {
        best = result;
        break;
      }
      best ??= result;
    }
    results.push(best ?? {
      name: dependency.name,
      state: "invalid",
      reason: "installed_product_path_missing"
    });
  }
  return results;
}

export async function inspectIndependentDependencies(products, installedProducts) {
  return inspectInstalledIndependentProducts({
    independent_product_dependencies: independentDependencyContracts(products)
  }, installedProducts);
}

export function independentDependencyFailures(results) {
  return results.filter(({ state }) => state !== "ready").map((result) => {
    const missing = [
      ...(result.missing_skills ?? []),
      ...(result.missing_runtime_verification_tools ?? [])
    ];
    return `independent product ${result.name} is ${result.state}: ${result.reason}${
      missing.length ? ` (${missing.join(", ")})` : ""
    }; install or update it from its own distribution`;
  });
}

export function assertIndependentProductsReady(results) {
  const failures = independentDependencyFailures(results);
  if (failures.length === 0) return;
  throw new Error(
    `Required independent product is missing or outdated. Install or update it from its own distribution, then retry. ${failures.join("; ")}`
  );
}
