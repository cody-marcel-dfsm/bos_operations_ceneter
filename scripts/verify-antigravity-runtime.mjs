import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyDependentConnection,
  activeClientProducts,
  verifyExactSymlink,
  verifyIndependentProductReadiness,
  verifyInstalledMetadata
} from "./lib/client-runtime-verification.mjs";
import { independentDependencyContracts } from "./lib/independent-product-dependencies.mjs";
import { root, stableJson } from "./lib/package-model.mjs";

export async function inspectAntigravityRuntime({ home = homedir(), base = root } = {}) {
  const products = await activeClientProducts("gemini");
  const failures = [];
  const states = {};
  for (const product of products) {
    const source = join(base, "clients", "gemini", "extensions", product.name);
    const installed = join(home, ".gemini", "config", "plugins", product.name);
    const productFailures = [
      ...await verifyDependentConnection(installed, product),
      ...await verifyExactSymlink(installed, source),
      ...await verifyInstalledMetadata(
        join(installed, ".bos-product.json"),
        { name: product.name, version: product.version, client: "gemini" }
      )
    ];
    states[product.name] = {
      state: productFailures.length === 0 ? "current" : "incomplete",
      version: product.version,
      install_path: installed
    };
    failures.push(...productFailures);
  }
  const independentReadiness = await verifyIndependentProductReadiness(
    products,
    await Promise.all(independentDependencyContracts(products).map(async ({ name }) => {
      const installPath = join(home, ".gemini", "config", "plugins", name);
      try {
        const details = await lstat(installPath);
        if (!details.isSymbolicLink()) {
          failures.push(`Antigravity independent product ${name} is not registered as a plugin symlink`);
          return { name, enabled: false, installPath };
        }
        await realpath(installPath);
        return { name, enabled: true, installPath };
      } catch (error) {
        failures.push(`Antigravity independent product ${name} registration is unavailable: ${error.message}`);
        return { name, enabled: false };
      }
    }))
  );
  failures.push(...independentReadiness.failures);
  return {
    schema_version: "1",
    ok: failures.length === 0,
    installed_products: states,
    independent_products: independentReadiness.results,
    failures
  };
}

async function main() {
  const args = process.argv.slice(2);
  const homeIndex = args.indexOf("--home");
  const report = await inspectAntigravityRuntime({
    home: homeIndex >= 0 ? resolve(args[homeIndex + 1]) : homedir()
  });
  if (args.includes("--json")) process.stdout.write(stableJson(report));
  else {
    console.log(`Antigravity BOS runtime: ${report.ok ? "ready" : "incomplete"}`);
    for (const failure of report.failures) console.log(`failure: ${failure}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
import { lstat, realpath } from "node:fs/promises";
