#!/usr/bin/env node

import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {readFile, readdir, stat} from "node:fs/promises";
import {extname, join, relative, resolve} from "node:path";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
export const root = resolve(new URL("../", import.meta.url).pathname);
const digestPath = join(root, "privacy", "customer-identifiers.sha256");
const approvedBinaryPath = join(root, "privacy", "approved-binary-assets.sha256");
const textExtensions = new Set([
  "", ".cjs", ".css", ".csv", ".html", ".js", ".json", ".jsonl", ".jsx",
  ".lock", ".md", ".mjs", ".py", ".sh", ".sql", ".svg", ".toml", ".ts", ".tsx",
  ".sha256", ".txt", ".yaml", ".yml"
]);
const ignoredParts = new Set([".git", "node_modules", "vendor", "index"]);
const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/giu;
const formattedNanpPattern = /(?<![\dA-Z])(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s](\d{3})[-.\s](\d{4})(?!\d)/giu;
const compactNanpPattern = /(?<![\dA-Z])(?:\+?1)?([2-9]\d{2})(\d{3})(\d{4})(?![\dA-Z])/giu;

export function normalizeSensitiveText(value) {
  return (value.toLowerCase().match(/[a-z0-9]+/gu) ?? []).join(" ");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function allowedSyntheticDomain(domain) {
  const current = domain.toLowerCase();
  return current === "example.com" || current === "example.org" ||
    current === "example.net" || current.endsWith(".example") ||
    current.endsWith(".invalid") || current.endsWith(".test");
}

function allowedFictionalPhone(exchange, subscriber) {
  return exchange === "555" && /^01\d{2}$/u.test(subscriber);
}

export function customerDataFindings(text, path, blockedDigests) {
  const findings = [];
  for (const match of text.matchAll(emailPattern)) {
    if (!allowedSyntheticDomain(match[1])) {
      findings.push(`${path}: non-synthetic email address`);
    }
  }
  for (const pattern of [formattedNanpPattern, compactNanpPattern]) {
    for (const match of text.matchAll(pattern)) {
      if (!allowedFictionalPhone(match[2], match[3])) {
        findings.push(`${path}: non-fictional phone number`);
      }
    }
  }
  const normalized = normalizeSensitiveText(`${path} ${text}`);
  const words = normalized.split(" ").filter(Boolean);
  for (let size = 1; size <= 8; size += 1) {
    for (let index = 0; index + size <= words.length; index += 1) {
      if (blockedDigests.has(sha256(words.slice(index, index + size).join(" ")))) {
        findings.push(`${path}: prohibited customer identifier digest`);
        return [...new Set(findings)];
      }
    }
  }
  return [...new Set(findings)];
}

async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    if (ignoredParts.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

async function trackedFiles() {
  const {stdout} = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {cwd: root}
  );
  return stdout.split("\0").filter(Boolean).map((path) => join(root, path));
}

async function scanZip(path, blockedDigests, approvedBinaryDigests) {
  const findings = [];
  const {stdout} = await execFileAsync("unzip", ["-Z1", path], {maxBuffer: 16 * 1024 * 1024});
  for (const entry of stdout.split(/\r?\n/u).filter(Boolean)) {
    const {stdout: body} = await execFileAsync("unzip", ["-p", path, entry], {
      encoding: "buffer", maxBuffer: 16 * 1024 * 1024
    });
    const label = `${relative(root, path)}!${entry}`;
    if (textExtensions.has(extname(entry).toLowerCase())) {
      findings.push(...customerDataFindings(body.toString("utf8"), label, blockedDigests));
    } else if (!approvedBinaryDigests.has(sha256(body))) {
      findings.push(`${label}: unreviewed binary publication artifact`);
    }
  }
  return findings;
}

export async function privacyFailures({extraPaths = []} = {}) {
  const blockedDigests = new Set((await readFile(digestPath, "utf8")).split(/\s+/u).filter(Boolean));
  const approvedBinaryDigests = new Set(
    (await readFile(approvedBinaryPath, "utf8")).split(/\s+/u).filter(Boolean)
  );
  const candidates = new Set([...await trackedFiles(), ...extraPaths.map((path) => resolve(path))]);
  const vault = join(root, "Vault");
  try {
    if ((await stat(vault)).isDirectory()) {
      for (const path of await walk(vault)) candidates.add(path);
    }
  } catch {}
  const findings = [];
  for (const path of [...candidates].sort()) {
    if (path.includes(`${join(root, "Vault", "index")}/`)) continue;
    if (path.endsWith(".zip")) {
      findings.push(...await scanZip(path, blockedDigests, approvedBinaryDigests));
      continue;
    }
    if (!textExtensions.has(extname(path).toLowerCase())) {
      let body;
      try { body = await readFile(path); } catch { continue; }
      if (!approvedBinaryDigests.has(sha256(body))) {
        findings.push(`${relative(root, path)}: unreviewed binary publication artifact`);
      }
      continue;
    }
    let body;
    try { body = await readFile(path, "utf8"); } catch { continue; }
    findings.push(...customerDataFindings(body, relative(root, path), blockedDigests));
  }
  return [...new Set(findings)].sort();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const failures = await privacyFailures();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Customer-data privacy gate passed for source, Vault, generated clients, and package archives.");
  }
}
