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
  ".diff", ".lock", ".log", ".md", ".mjs", ".patch", ".py", ".sh", ".sql", ".svg", ".toml", ".ts", ".tsx",
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

export function isWatcherProcessMetadata(path, body) {
  return resolve(path) === join(root, "Vault", "tmp", "vault-index", "watcher.pid") &&
    body.length <= 11 && /^[1-9][0-9]{0,9}\n?$/u.test(body.toString("ascii")) &&
    body.every((byte) => byte === 10 || (byte >= 48 && byte <= 57)) &&
    Number(body.toString("ascii")) <= 2 ** 31 - 1;
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

// Exact provider identity verified through the existing native GitHub client.
// Only these typed metadata slots are normalized; every other field is scanned.
export function verifiedGithubMetadataText(text, identities) {
  let row, ranges, tokens;
  try {
    row = JSON.parse(text);
    tokens = [...text.matchAll(/"(?:\\[\s\S]|[^"\\])*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/gu)];
    let index = 0;
    ranges = new Map();
    function value(path) {
      const token = tokens[index++];
      if (token[0] === "{") {
        const keys = new Set();
        while (tokens[index][0] !== "}") {
          const key = JSON.parse(tokens[index++][0]);
          if (keys.has(key)) throw new Error("duplicate JSON member");
          keys.add(key);
          index += 1; // colon; JSON.parse already validated the grammar.
          value([...path, key]);
          if (tokens[index][0] !== ",") break;
          index += 1;
        }
        index += 1;
      } else if (token[0] === "[") {
        let item = 0;
        while (tokens[index][0] !== "]") {
          value([...path, item++]);
          if (tokens[index][0] !== ",") break;
          index += 1;
        }
        index += 1;
      } else {
        ranges.set(JSON.stringify(path), [token.index, token.index + token[0].length]);
      }
    }
    value([]);
  } catch {
    // Inspect decoded original string tokens as well as raw text, including
    // every overwritten member. Parsing an object alone would lose those values.
    return tokens ? text + "\n" + tokens.filter(token => token[0].startsWith('"'))
      .map(token => JSON.parse(token[0])).join("\n") : text;
  }
  const repository = "cody-marcel-dfsm/bos_operations_ceneter";
  const identity = identities?.repository === repository && identities.pull_requests?.[String(row?.number)];
  if (!identity || !Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.node_id !== "string" ||
      sha256(String(row.id)) !== identity.id_sha256 || sha256(row.node_id) !== identity.node_id_sha256 ||
      row.url !== `https://api.github.com/repos/${repository}/pulls/${row.number}` ||
      row.html_url !== `https://github.com/${repository}/pull/${row.number}`) return text;
  const normalized = structuredClone(row);
  normalized.id = "verified-own-github-pull-request-id";
  const replacements = [{path: ["id"], value: normalized.id}];
  for (const branch of ["head", "base"]) {
    const repo = normalized[branch]?.repo;
    if (repo?.full_name === repository && repo.ssh_url === `${["git", "github.com"].join("@")}:${repository}.git`) {
      repo.ssh_url = "verified-own-github-repository-ssh-url";
      replacements.push({path: [branch, "repo", "ssh_url"], value: repo.ssh_url});
    }
  }
  // Preserve every original nonmetadata byte, including numeric lexemes. The
  // additional decoded view retains checks of escaped strings without replacing
  // inspection of the original representation.
  let original = text;
  const spans = replacements.map(({path, value}) => ({range: ranges.get(JSON.stringify(path)), value}));
  if (spans.some(({range}) => !range)) return text;
  for (const {range: [start, end], value} of spans.sort((a, b) => b.range[0] - a.range[0])) {
    original = original.slice(0, start) + JSON.stringify(value) + original.slice(end);
  }
  return original + "\n" + JSON.stringify(normalized);
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
  const githubIdentities = JSON.parse(await readFile(join(root, "privacy", "owned-github-pr-identities.json"), "utf8"));
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
      if (isWatcherProcessMetadata(path, body)) {
        findings.push(...customerDataFindings(body.toString("utf8"), relative(root, path), blockedDigests));
        continue;
      }
      if (!approvedBinaryDigests.has(sha256(body))) {
        findings.push(`${relative(root, path)}: unreviewed binary publication artifact`);
      }
      continue;
    }
    let body;
    try { body = await readFile(path, "utf8"); } catch { continue; }
    findings.push(...customerDataFindings(verifiedGithubMetadataText(body, githubIdentities), relative(root, path), blockedDigests));
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
