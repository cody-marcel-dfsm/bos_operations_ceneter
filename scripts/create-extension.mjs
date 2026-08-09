import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCustomerExtension } from "../source/platform/manage-customer-extension/scripts/manage-extension.mjs";
import { stableJson } from "./lib/package-model.mjs";

function parseArgs(argv) {
  const options = { home: homedir() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--home") options.home = resolve(argv[++index]);
    else if (argument === "--product") options.product = argv[++index];
    else if (argument === "--base-skill") options.baseSkill = argv[++index];
    else if (argument === "--site") options.site = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export async function createCustomerExtension(rawOptions) {
  const options = { home: homedir(), ...rawOptions };
  const productRoot = join(options.home, "plugins", options.product);
  return applyCustomerExtension({
    productRoot,
    extensionRoot: join(productRoot, "skills"),
    product: options.product,
    baseSkill: options.baseSkill,
    tenant: options.site
  });
}

async function main() {
  const result = await createCustomerExtension(parseArgs(process.argv.slice(2)));
  process.stdout.write(stableJson(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
