import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const forbiddenNames = new Set([
  ".env",
  "credentials.json",
  "service-account.json",
  "id_rsa",
  "id_ed25519"
]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bbos_agent_[A-Za-z0-9_-]{16,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bgh[ps]_[A-Za-z0-9]{30,}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /"(?:access_token|refresh_token|client_secret|private_key)"\s*:\s*"(?!REDACTED|EXAMPLE|<)[^"]+"/i,
  /\/Users\/[A-Za-z0-9._-]+\//
];
const textExtensions = new Set([
  ".json", ".md", ".mjs", ".js", ".ts", ".toml", ".yaml", ".yml"
]);
const ignoredDirectories = new Set([".git", "dist", "node_modules", "tmp"]);
const failures = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    if (forbiddenNames.has(entry.name) || entry.name.startsWith(".env.")) {
      failures.push(`Forbidden credential filename: ${path}`);
      continue;
    }
    if ([".pem", ".key", ".p12", ".pfx"].includes(extname(entry.name))) {
      failures.push(`Forbidden credential file type: ${path}`);
      continue;
    }
    if (!textExtensions.has(extname(entry.name))) continue;
    const content = await readFile(path, "utf8");
    for (const pattern of secretPatterns) {
      if (pattern.test(content)) failures.push(`Credential pattern in ${path}`);
    }
  }
}

await scan(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Package structure and credential scan passed.");
