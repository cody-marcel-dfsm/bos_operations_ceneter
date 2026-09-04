import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url).pathname;

export const allowedTopLevelPaths = new Set([
  ".agents",
  ".claude-plugin",
  ".githooks",
  ".github",
  ".gitignore",
  "AGENTS.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "SECURITY.md",
  "TRADEMARKS.md",
  "acceptance",
  "brand",
  "clients",
  "contracts",
  "package-manifest.json",
  "package.json",
  "products",
  "scripts",
  "source",
  "tests",
  "tools",
]);

export function validatePublicationPaths(paths) {
  const failures = [];
  for (const path of paths) {
    const topLevel = path.split("/", 1)[0];
    if (/^vault(?:\/|$)/i.test(path)) {
      failures.push(`Private Vault path is public: ${path}`);
    } else if (!allowedTopLevelPaths.has(topLevel)) {
      failures.push(`Path is outside the public allowlist: ${path}`);
    }
  }
  return failures;
}

async function gitOutput(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

export async function publicationFailures() {
  const tracked = (await gitOutput(["ls-files", "-z"]))
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const failures = validatePublicationPaths(tracked);

  const reachable = (await gitOutput(["rev-list", "--objects", "--all"]))
    .toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.slice(line.indexOf(" ") + 1))
    .filter((path) => path && !/^[a-f0-9]{40}$/i.test(path));
  for (const path of reachable) {
    if (/^vault(?:\/|$)/i.test(path)) {
      failures.push(`Private Vault history is reachable: ${path}`);
    }
  }
  return [...new Set(failures)].sort();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const failures = await publicationFailures();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Public path allowlist and reachable Git history passed.");
  }
}
