import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyInstalledMetadata } from "./lib/client-runtime-verification.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const defaultProduct = "bos";

function defaultRun(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(
      "Claude Code is required. Install or update Claude Code, then run this command again."
    );
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const diagnostic = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      diagnostic || `${command} exited with status ${result.status}`
    );
  }
  return result.stdout ?? "";
}

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Claude returned invalid ${label} JSON`);
  }
}

export async function installClaudeLocal({
  base = projectRoot,
  product = defaultProduct,
  run = defaultRun,
  verifyMetadata = verifyInstalledMetadata
} = {}) {
  const marketplaceRoot = join(base, "clients", "claude");
  const manifestPath = join(
    marketplaceRoot,
    ".claude-plugin",
    "marketplace.json"
  );
  const marketplace = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!marketplace.plugins?.some((entry) => entry.name === product)) {
    throw new Error(`Claude marketplace does not contain product ${product}`);
  }

  run("claude", ["--version"], { capture: true });
  run("claude", ["plugin", "validate", marketplaceRoot], { capture: true });

  const configuredMarketplaces = parseJsonOutput(
    run("claude", ["plugin", "marketplace", "list", "--json"], {
      capture: true
    }),
    "marketplace list"
  );
  const configuredMarketplace = configuredMarketplaces.find(
    (entry) => entry.name === marketplace.name
  );
  const selector = `${product}@${marketplace.name}`;
  const marketplaceIsLocal = configuredMarketplace &&
    configuredMarketplace.source === "directory" &&
    resolve(configuredMarketplace.path ?? configuredMarketplace.url ?? "") === marketplaceRoot;
  let marketplaceReplaced = false;
  if (marketplaceIsLocal) {
    run("claude", ["plugin", "marketplace", "update", marketplace.name]);
  } else {
    let displacedPlugins = [];
    if (configuredMarketplace) {
      displacedPlugins = parseJsonOutput(
        run("claude", ["plugin", "list", "--json"], { capture: true }),
        "plugin list"
      ).filter((entry) =>
        entry.scope === "user" &&
        entry.id.endsWith(`@${marketplace.name}`) &&
        entry.id !== selector
      );
      run("claude", [
        "plugin",
        "marketplace",
        "remove",
        marketplace.name,
        "--scope",
        "user"
      ]);
      marketplaceReplaced = true;
    }
    run("claude", [
      "plugin",
      "marketplace",
      "add",
      marketplaceRoot,
      "--scope",
      "user"
    ]);
    for (const displaced of displacedPlugins) {
      run("claude", ["plugin", "install", displaced.id, "--scope", "user"]);
      if (!displaced.enabled) {
        run("claude", ["plugin", "disable", displaced.id, "--scope", "user"]);
      }
    }
  }

  const productMetadata = JSON.parse(readFileSync(
    join(marketplaceRoot, "plugins", product, ".bos-product.json"),
    "utf8"
  ));
  const installedPlugins = parseJsonOutput(
    run("claude", ["plugin", "list", "--json"], { capture: true }),
    "plugin list"
  );
  const installed = marketplaceReplaced
    ? undefined
    : installedPlugins.find((entry) => entry.id === selector);

  if (installed) {
    run("claude", ["plugin", "update", selector, "--scope", "user"]);
    if (!installed.enabled) {
      run("claude", ["plugin", "enable", selector, "--scope", "user"]);
    }
  } else {
    run("claude", [
      "plugin",
      "install",
      selector,
      "--scope",
      "user"
    ]);
  }

  const verifiedPlugins = parseJsonOutput(
    run("claude", ["plugin", "list", "--json"], { capture: true }),
    "plugin list"
  );
  const verified = verifiedPlugins.find((entry) => entry.id === selector);
  if (!verified?.enabled) {
    throw new Error(`Claude did not enable ${selector}`);
  }
  if (verified.version !== productMetadata.version) {
    throw new Error(
      `Claude activated ${selector} version ${verified.version ?? "missing"}; expected ${productMetadata.version}`
    );
  }
  if (!verified.installPath) {
    throw new Error(`Claude did not report an active installPath for ${selector}`);
  }
  const metadataFailures = await verifyMetadata(
    join(verified.installPath, ".bos-product.json"),
    { name: product, version: productMetadata.version, client: "claude" }
  );
  if (metadataFailures.length > 0) {
    throw new Error(`Claude active package verification failed:\n${metadataFailures.join("\n")}`);
  }

  const completionMessage = productMetadata.connection_scope === "claude_account"
    ? "Connect the BOS account-level Web connector under Customize > Connectors, then complete BOS sign-in once."
    : "This subservice uses the existing BOS connector and requires no additional BOS sign-in.";
  process.stdout.write(`Installed ${selector}. ${completionMessage}\n`);
  return {
    marketplace: marketplace.name,
    marketplaceRoot,
    product,
    selector,
    connectionScope: productMetadata.connection_scope ?? "bos_managed",
    resourceUrl: productMetadata.resource_url,
    installed: true
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--product") options.product = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  installClaudeLocal(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
