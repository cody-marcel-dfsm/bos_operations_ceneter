import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(import.meta.dirname, "..");
const defaultProduct = "icode-operations-center";

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
  run = defaultRun
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
  const marketplaceInstalled = configuredMarketplaces.some(
    (entry) => entry.name === marketplace.name
  );
  if (marketplaceInstalled) {
    run("claude", ["plugin", "marketplace", "update", marketplace.name]);
  } else {
    run("claude", [
      "plugin",
      "marketplace",
      "add",
      marketplaceRoot,
      "--scope",
      "user"
    ]);
  }

  const selector = `${product}@${marketplace.name}`;
  const installedPlugins = parseJsonOutput(
    run("claude", ["plugin", "list", "--json"], { capture: true }),
    "plugin list"
  );
  const installed = installedPlugins.some((entry) => entry.id === selector);

  if (installed) {
    run("claude", ["plugin", "update", selector, "--scope", "user"]);
    run("claude", ["plugin", "enable", selector, "--scope", "user"]);
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

  process.stdout.write(
    `Installed ${selector}. Claude will request the required sensitive API key through its native plugin configuration. Start a new Claude session or run /reload-plugins.\n`
  );
  return {
    marketplace: marketplace.name,
    marketplaceRoot,
    product,
    selector,
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
