import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { activeClientProducts, compareTrees, verifyInstalledMetadata } from "./lib/client-runtime-verification.mjs";
import { root, stableJson } from "./lib/package-model.mjs";

export async function inspectGeminiRuntime({ home = homedir(), base = root } = {}) {
  const products = await activeClientProducts("gemini");
  const failures = [];
  const states = {};
  for (const product of products) {
    const source = join(base, "clients", "gemini", "extensions", product.name);
    const installed = join(home, ".gemini", "extensions", product.name);
    const productFailures = [
      ...await verifyInstalledMetadata(
        join(installed, ".bos-product.json"),
        { name: product.name, version: product.version, client: "gemini" }
      ),
      ...await verifyInstalledMetadata(
        join(installed, "gemini-extension.json"),
        { name: product.name, version: product.version }
      ),
      ...await verifyInstalledMetadata(
        join(installed, ".gemini-extension-install.json"),
        { }
      ),
      ...await compareTrees(source, installed, {
        ignore: [".gemini-extension-install.json"]
      })
    ];
    states[product.name] = {
      state: productFailures.length === 0 ? "current" : "incomplete",
      version: product.version,
      install_path: installed
    };
    failures.push(...productFailures);
  }
  return { schema_version: "1", ok: failures.length === 0, installed_products: states, failures };
}

async function main() {
  const args = process.argv.slice(2);
  const homeIndex = args.indexOf("--home");
  const report = await inspectGeminiRuntime({
    home: homeIndex >= 0 ? resolve(args[homeIndex + 1]) : homedir()
  });
  if (args.includes("--json")) process.stdout.write(stableJson(report));
  else {
    console.log(`Gemini BOS runtime: ${report.ok ? "ready" : "incomplete"}`);
    for (const failure of report.failures) console.log(`failure: ${failure}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
