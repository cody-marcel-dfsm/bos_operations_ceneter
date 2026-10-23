#!/usr/bin/env node

import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, readdir, rm, stat, writeFile} from "node:fs/promises";
import {extname, join, relative, resolve} from "node:path";
import {tmpdir} from "node:os";
import {promisify} from "node:util";
import {privacyFileCoverage, privacyPolicyIdentity} from "./lib/privacy-coverage.mjs";

const execFileAsync = promisify(execFile);
export const root = resolve(new URL("../", import.meta.url).pathname);
const digestPath = join(root, "privacy", "customer-identifiers.sha256");
const approvedBinaryPath = join(root, "privacy", "approved-binary-assets.sha256");
const textExtensions = new Set([
  "", ".cjs", ".css", ".csv", ".html", ".js", ".json", ".jsonl", ".jsx",
  ".diff", ".lock", ".log", ".md", ".mjs", ".patch", ".py", ".sh", ".sql", ".svg", ".toml", ".ts", ".tsx",
  ".sha256", ".txt", ".yaml", ".yml"
]);
// Native reviewer/validation output, retained TAP and JSON record streams share
// one format contract, including compound names such as *.stdout.log.
const operationalTextExtensions = new Set([".tap", ".ndjson", ".stderr", ".stdout", ".json", ".jsonl", ".log"]);
const terminalSgrPattern = /\u001b\[[0-9;]*m/gu;
const ignoredParts = new Set([".git", "node_modules", "vendor", "index"]);
const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/giu;
const formattedNanpPattern = /(?<![\dA-Z])(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s](\d{3})[-.\s](\d{4})(?!\d)/giu;
const compactNanpPattern = /(?<![\dA-Z])(?:\+?1)?([2-9]\d{2})(\d{3})(\d{4})(?![\dA-Z])/giu;
const digestWindowCaches = new WeakMap();
const maxDigestCacheEntries = 32768;
const maxDigestCacheCharacters = 4 * 1024 * 1024;
const maxDigestWindowCharacters = 16384;

function digestMatcher(blockedDigests) {
  const identity = JSON.stringify([...blockedDigests].sort());
  let matcher = digestWindowCaches.get(blockedDigests);
  if (!matcher || matcher.identity !== identity) {
    matcher = {identity, digests: new Set(blockedDigests), windows: new Map(), characters: 0};
    digestWindowCaches.set(blockedDigests, matcher);
  }
  return matcher;
}

function blockedWordWindow(words, matcher) {
  const key = words.join(" ");
  const cached = matcher.windows.get(key);
  if (cached !== undefined) return cached;
  let found = false;
  for (let size = 1; size <= 8 && !found; size += 1) {
    for (let index = 0; index + size <= words.length; index += 1) {
      if (matcher.digests.has(sha256(words.slice(index, index + size).join(" ")))) {
        found = true;
        break;
      }
    }
  }
  if (key.length <= maxDigestWindowCharacters) {
    while (matcher.windows.size >= maxDigestCacheEntries || matcher.characters + key.length > maxDigestCacheCharacters) {
      const oldest = matcher.windows.keys().next().value;
      matcher.characters -= oldest.length;
      matcher.windows.delete(oldest);
    }
    matcher.windows.set(key, found);
    matcher.characters += key.length;
  }
  return found;
}

function hasBlockedDigest(text, path, blockedDigests) {
  if (blockedDigests.size === 0) return false;
  const matcher = digestMatcher(blockedDigests);
  let previous = [];
  for (const line of `${path} ${text}`.split("\n")) {
    const words = normalizeSensitiveText(line).split(" ").filter(Boolean);
    if (!words.length) continue;
    const window = previous.concat(words);
    if (blockedWordWindow(window, matcher)) return true;
    // Every one-to-eight-word phrase crossing any number of short/empty lines
    // is included in the next exact window. The path/body boundary is identical.
    previous = window.slice(-7);
  }
  return false;
}

// Read native V8 CPU profiles as their validated JSON text, preserving every
// original field for the same customer-data checks. Other opaque files retain
// the exact approved-binary requirement.
export function isCpuProfileTextArtifact(path, body) {
  if (extname(path).toLowerCase() !== ".cpuprofile") return false;
  try {
    const text = new TextDecoder("utf-8", {fatal: true}).decode(body);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) return false;
    const profile = JSON.parse(text);
    return profile !== null && typeof profile === "object" && !Array.isArray(profile) &&
      Number.isFinite(profile.startTime) && Number.isFinite(profile.endTime) && profile.endTime >= profile.startTime &&
      Array.isArray(profile.nodes) && profile.nodes.length > 0 && profile.nodes.every(node =>
        Number.isSafeInteger(node.id) && node.id > 0 && node.callFrame !== null && typeof node.callFrame === "object" &&
        typeof node.callFrame.functionName === "string" && typeof node.callFrame.url === "string") &&
      Array.isArray(profile.samples) && Array.isArray(profile.timeDeltas) && profile.samples.length === profile.timeDeltas.length &&
      profile.samples.every(value => Number.isSafeInteger(value) && value > 0) &&
      profile.timeDeltas.every(value => Number.isFinite(value) && value >= 0);
  } catch { return false; }
}

export function cpuProfilePrivacyText(text) {
  // Keep original bytes/number lexemes and decode every original string token,
  // including overwritten duplicate members that JSON.parse would discard.
  return text + "\n" + [...text.matchAll(/"(?:\\[\s\S]|[^"\\])*"/gu)]
    .map(token => JSON.parse(token[0])).join("\n");
}

export function isProposedTextArtifact(path, body) {
  if (extname(path).toLowerCase() !== ".proposed") return false;
  const sourceExtension = extname(path.slice(0, -".proposed".length)).toLowerCase();
  if (!sourceExtension || !textExtensions.has(sourceExtension)) return false;
  try {
    const text = new TextDecoder("utf-8", {fatal: true}).decode(body);
    return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text);
  } catch { return false; }
}

// Retained operational output remains text only with lossless UTF-8 decoding
// and ordinary whitespace controls. Every admitted byte still receives the
// same identifier, email and phone checks as other text evidence.
export function isOperationalTextArtifact(path, body) {
  if (!operationalTextExtensions.has(extname(path).toLowerCase())) return false;
  try {
    const text = new TextDecoder("utf-8", {fatal: true}).decode(body);
    return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text.replace(terminalSgrPattern, ""));
  } catch { return false; }
}

// A retained own CLI probe contains public -c plugin enablement keys whose
// marketplace.enabled suffix resembles an email domain. Normalize only those
// typed slots after exact artifact and independently retained namespace custody.
export function verifiedNativeProbeMetadataText(text, identity) {
  if (!identity) return text;
  const tokens = [...text.matchAll(/"(?:\\[\s\S]|[^"\\])*"/gu)];
  let unverified = text;
  try { unverified += "\n" + tokens.map(token => JSON.parse(token[0])).join("\n"); } catch {}
  if (identity.namespaceVerified !== true || sha256(text) !== identity.argv_sha256) return unverified;
  let args;
  try { args = JSON.parse(text); } catch { return unverified; }
  if (!Array.isArray(args) || args.some(value => typeof value !== "string")) return unverified;
  if (tokens.length !== args.length) return unverified;
  const normalized = [...args], spans = [];
  for (let index = 1; index < args.length; index++) {
    if (args[index - 1] === "-c" &&
        /^plugins\.[a-z0-9][a-z0-9_-]{0,127}@[a-z0-9][a-z0-9_-]{0,127}\.enabled=false$/u.test(args[index])) {
      normalized[index] = "verified-own-native-plugin-isolation-setting";
      spans.push({start: tokens[index].index, end: tokens[index].index + tokens[index][0].length, value: normalized[index]});
    }
  }
  let original = text;
  for (const {start, end, value} of spans.reverse()) original = original.slice(0, start) + JSON.stringify(value) + original.slice(end);
  return original + "\n" + JSON.stringify(normalized);
}

async function ownNativeProbeIdentity(path, registry) {
  const identity = registry.probes?.find(item => resolve(root, item.path) === path);
  if (!identity) return null;
  try {
    const bytes = await readFile(resolve(root, identity.namespace_path));
    if (sha256(bytes) !== identity.namespace_sha256) return {...identity, namespaceVerified: false};
    const namespace = JSON.parse(bytes);
    if (namespace.args_file_sha256 !== identity.argv_sha256 || namespace.uses_ordinary_default_home !== true ||
        namespace.bos_metadata_identical !== true || namespace.credentials_read_or_exported !== false ||
        namespace.probe_auth_home_override !== false || namespace.probe_ignore_user_config !== false || namespace.probe_profile_override !== false) return {...identity, namespaceVerified: false};
    return {...identity, namespaceVerified: true};
  } catch { return {...identity, namespaceVerified: false}; }
}

export function verifiedSyntheticSourceFixtureText(text, identity) {
  if (identity?.sourceFixtureVerified !== true || sha256(text) !== identity.artifact_sha256 ||
      identity.source_path !== "tests/native-callback-continuation.test.mjs") return text;
  const header = `diff --git a/${identity.source_path} b/${identity.source_path}`;
  let selected = false;
  return text.split("\n").map(line => {
    if (line.startsWith("diff --git ")) selected = line === header;
    if (!selected) return line;
    const match = /^\+  await writeFile\(join\(f\.root, f\.registration, "mutation\.guard"\), JSON\.stringify\(\{pid: ([0-9]+), token: randomUUID\(\)\}\), \{mode: 0o600\}\);$/u.exec(line);
    if (!match || Number(match[1]) !== 2 ** 31 - 2) return line;
    return line.replace(`pid: ${match[1]},`, "pid: synthetic-dead-process-id,");
  }).join("\n");
}

export async function ownSourceFixtureIdentity(path, registry) {
  const identity = registry.synthetic_source_fixtures?.find(item => resolve(root, item.path) === path);
  if (!identity) return null;
  try {
    const handoffBytes = await readFile(resolve(root, identity.handoff_path));
    const nativeBytes = await readFile(resolve(root, identity.native_validation_path));
    if (sha256(handoffBytes) !== identity.handoff_sha256 || sha256(nativeBytes) !== identity.native_validation_sha256) return null;
    const handoff = JSON.parse(handoffBytes), native = JSON.parse(nativeBytes);
    if (resolve(handoff.native_current_diff.path) !== path || handoff.native_current_diff.sha256 !== identity.artifact_sha256 ||
        native.kind !== "oracle-validation-record-v1" || native.exit_code !== 0 || native.candidate_tree !== handoff.candidate_tree ||
        JSON.stringify(native.command) !== JSON.stringify(["node", "--test", identity.source_path]) ||
        native.live_inputs?.[identity.source_path]?.sha256 !== handoff.changed_source_paths?.[resolve(root, identity.source_path)]?.sha256) return null;
    return {...identity, sourceFixtureVerified: true};
  } catch { return null; }
}

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
  if (hasBlockedDigest(text, path, blockedDigests)) findings.push(`${path}: prohibited customer identifier digest`);
  return [...new Set(findings)];
}

// Exact provider identity verified through the existing native GitHub client.
// Only these typed metadata slots are normalized; every other field is scanned.
export function verifiedGithubMetadataText(text, identities, {rawOnly = false} = {}) {
  // gh --include retains the HTTP envelope. Accept its strict ASCII header
  // grammar while keeping that complete envelope in the inspected output.
  const envelope = /^(HTTP\/(?:1\.[01]|2(?:\.0)?|3(?:\.0)?) [1-5]\d{2}(?: [\x20-\x7e]*)?\r?\n(?:[!#$%&'*+.^_`|~0-9A-Za-z-]+:[\t\x20-\x7e]*\r?\n)*\r?\n)([\s\S]*)$/u.exec(text);
  const prefix = envelope?.[1] ?? "";
  const body = envelope?.[2] ?? text;
  let row, ranges, tokens;
  const unverified = () => !rawOnly && tokens ? text + "\n" + tokens.filter(token => token[0].startsWith('"'))
    .map(token => { try { return JSON.parse(token[0]); } catch { return token[0]; } }).join("\n") : text;
  try {
    row = JSON.parse(body);
    tokens = [...body.matchAll(/"(?:\\[\s\S]|[^"\\])*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/gu)];
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
    return unverified();
  }
  const repository = "cody-marcel-dfsm/bos_operations_ceneter";
  if (identities?.repository !== repository) return unverified();
  const ownId = (entry, identity) => identity && Number.isSafeInteger(entry?.id) && entry.id > 0 &&
    sha256(String(entry.id)) === identity.id_sha256;
  const ownPull = entry => Number.isSafeInteger(entry?.number) && entry.number > 0 &&
    ownId(entry, identities.pull_requests?.[String(entry.number)]) &&
    entry.url === `https://api.github.com/repos/${repository}/pulls/${entry.number}`;
  const identity = identities.pull_requests?.[String(row?.number)];
  const directPull = ownPull(row) && typeof row.node_id === "string" &&
    sha256(row.node_id) === identity.node_id_sha256 &&
    row.html_url === `https://github.com/${repository}/pull/${row.number}`;
  const checkIdentity = identities.check_runs?.find(entry => ownId(row, entry));
  const ownCheck = checkIdentity && typeof row.node_id === "string" &&
    sha256(row.node_id) === checkIdentity.node_id_sha256 &&
    row.url === `https://api.github.com/repos/${repository}/check-runs/${row.id}` &&
    typeof row.html_url === "string" && sha256(row.html_url) === checkIdentity.html_url_sha256 &&
    Array.isArray(row.pull_requests);
  if (!directPull && !ownCheck) return unverified();
  const normalized = structuredClone(row);
  normalized.id = directPull ? "verified-own-github-pull-request-id" : "verified-own-github-check-run-id";
  const replacements = [{path: ["id"], value: normalized.id}];
  if (ownCheck) for (const [index, pull] of row.pull_requests.entries()) {
    if (!ownPull(pull)) continue;
    normalized.pull_requests[index].id = "verified-own-github-pull-request-id";
    replacements.push({path: ["pull_requests", index, "id"], value: normalized.pull_requests[index].id});
  }
  for (const branch of directPull ? ["head", "base"] : []) {
    const repo = normalized[branch]?.repo;
    if (repo?.full_name === repository && repo.ssh_url === `${["git", "github.com"].join("@")}:${repository}.git`) {
      repo.ssh_url = "verified-own-github-repository-ssh-url";
      replacements.push({path: [branch, "repo", "ssh_url"], value: repo.ssh_url});
    }
  }
  // Preserve every original nonmetadata byte, including numeric lexemes. The
  // additional decoded view retains checks of escaped strings without replacing
  // inspection of the original representation.
  let original = body;
  const spans = replacements.map(({path, value}) => ({range: ranges.get(JSON.stringify(path)), value}));
  if (spans.some(({range}) => !range)) return unverified();
  for (const {range: [start, end], value} of spans.sort((a, b) => b.range[0] - a.range[0])) {
    original = original.slice(0, start) + JSON.stringify(value) + original.slice(end);
  }
  return prefix + original + (rawOnly ? "" : "\n" + JSON.stringify(normalized));
}

// Operational records can contain multiple JSON documents or JSON fragments.
// Preserve raw nonmetadata bytes and inspect each original valid string token,
// including overwritten members, without requiring one whole JSON document.
// This view is restricted to operational/JSONL evidence; ordinary source/SVG
// keeps its existing representation and avoids combining unrelated attributes.
export function operationalPrivacyText(text, identities) {
  const boundary = "\nBOS_PRIVACY_VALUE_BOUNDARY\n";
  const rendered = text.replace(terminalSgrPattern, "");
  if (rendered !== text) return text + boundary + operationalPrivacyText(rendered, identities);
  const whole = verifiedGithubMetadataText(text, identities, {rawOnly: true});
  const records = text.split(/\r?\n/u).filter(line => line.trim());
  const jsonRecords = records.length > 0 && records.every(line => {
    try {JSON.parse(line); return true;} catch {return false;}
  });
  const inspected = whole !== text ? whole : jsonRecords ? text.replace(/[^\r\n]+/gu,
    line => verifiedGithubMetadataText(line, identities, {rawOnly: true})) : text;
  const decoded = [];
  const seen = new Set([inspected]);
  const pending = [inspected];
  while (pending.length) {
    const value = pending.pop();
    const renderedValue = value.replace(terminalSgrPattern, "");
    if (renderedValue !== value && !seen.has(renderedValue)) {
      seen.add(renderedValue); decoded.push(renderedValue); pending.push(renderedValue);
    }
    const admit = token => {
      let string;
      try {string = JSON.parse(token);} catch {return false;}
      if (seen.has(string)) return true;
      seen.add(string); decoded.push(string); pending.push(string);
      return true;
    };
    for (const token of value.matchAll(/"(?:\\[\s\S]|[^"\\])*"/gu)) admit(token[0]);
    {
      // A malformed prefix can shift quote pairing into valid unrelated tokens,
      // without any JSON.parse failure. Revisit every unescaped quote using
      // record-bounded candidates, retaining JSON.parse as the value validator.
      // Adjacent quote spans overlap at most twice; normal decoding is retained.
      const candidate = /"(?:\\[^\r\n]|[^"\\\r\n])*"/uy;
      let backslashes = 0;
      for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character === '"' && backslashes % 2 === 0) {
          candidate.lastIndex = index;
          const token = candidate.exec(value);
          if (token) admit(token[0]);
        }
        backslashes = character === "\\" ? backslashes + 1 : 0;
      }
    }
  }
  // Decoded values are independent evidence. A word boundary keeps unrelated
  // numeric/string values from assembling a new phone or blocked phrase, while
  // the complete original representation and each complete value stay checked.
  return inspected + boundary + decoded.join(boundary);
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

async function scanZip(path, bytes, blockedDigests, approvedBinaryDigests, executable) {
  const findings = [];
  const readerEnvironment = {...process.env};
  for (const name of ["UNZIP", "UNZIPOPT", "ZIPINFO", "ZIPINFOOPT"]) delete readerEnvironment[name];
  const directory = await mkdtemp(join(tmpdir(), "boc-privacy-archive-"));
  const snapshot = join(directory, "snapshot.zip");
  try {
  await writeFile(snapshot, bytes, {flag: "wx", mode: 0o600});
  const {stdout} = await execFileAsync(executable, ["-Z1", snapshot], {env: readerEnvironment, maxBuffer: 16 * 1024 * 1024});
  for (const entry of stdout.split(/\r?\n/u).filter(Boolean)) {
    const {stdout: body} = await execFileAsync(executable, ["-p", snapshot, entry], {
      env: readerEnvironment, encoding: "buffer", maxBuffer: 16 * 1024 * 1024
    });
    const label = `${relative(root, path)}!${entry}`;
    if (operationalTextExtensions.has(extname(entry).toLowerCase())) {
      if (isOperationalTextArtifact(entry, body)) {
        findings.push(...customerDataFindings(operationalPrivacyText(body.toString("utf8"), {}), label, blockedDigests));
      } else if (!approvedBinaryDigests.has(sha256(body))) {
        findings.push(`${label}: unreviewed binary publication artifact`);
      }
    } else if (textExtensions.has(extname(entry).toLowerCase())) {
      findings.push(...customerDataFindings(body.toString("utf8"), label, blockedDigests));
    } else if (!approvedBinaryDigests.has(sha256(body))) {
      findings.push(`${label}: unreviewed binary publication artifact`);
    }
  }
  return findings;
  } finally { await rm(directory, {recursive: true, force: true}); }
}

export async function privacyFailures({extraPaths = []} = {}) {
  const candidates = new Set([...await trackedFiles(), ...extraPaths.map((path) => resolve(path))]);
  const vault = join(root, "Vault");
  try {
    if ((await stat(vault)).isDirectory()) {
      for (const path of await walk(vault)) candidates.add(path);
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return scanPrivacyCandidates(candidates);
}

// Unit fixtures exercise the same complete per-file policy without repeating
// collection of the entire repository/Vault. The production CLI always uses
// privacyFailures above and retains its complete source/evidence gate.
export async function fixturePrivacyFailures(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 100 || paths.some(path => typeof path !== "string" || !path)) {
    throw new Error("Provide a nonempty bounded set of explicit privacy fixture paths.");
  }
  return scanPrivacyCandidates(new Set(paths.map(path => resolve(path))));
}

export let lastPrivacyCoverage = null;

async function scanPrivacyCandidates(candidates) {
  const names = [digestPath, approvedBinaryPath, join(root, "privacy", "owned-github-pr-identities.json"),
    join(root, "privacy", "owned-native-probe-identities.json")];
  const rules = await Promise.all(names.map(async path => ({path, body: await readFile(path)})));
  const blockedDigests = new Set(rules[0].body.toString("utf8").split(/\s+/u).filter(Boolean));
  const approvedBinaryDigests = new Set(rules[1].body.toString("utf8").split(/\s+/u).filter(Boolean));
  const githubIdentities = JSON.parse(rules[2].body), nativeProbeIdentities = JSON.parse(rules[3].body);
  const policy = await privacyPolicyIdentity([{path: new URL(import.meta.url).pathname,
    body: await readFile(new URL(import.meta.url))}, ...rules], {
      functions: [customerDataFindings, normalizeSensitiveText, hasBlockedDigest, blockedWordWindow, digestMatcher,
        allowedSyntheticDomain, allowedFictionalPhone, sha256, scanPrivacyCandidates,
        isCpuProfileTextArtifact, cpuProfilePrivacyText, isProposedTextArtifact, isOperationalTextArtifact,
        verifiedNativeProbeMetadataText, verifiedSyntheticSourceFixtureText, ownNativeProbeIdentity,
        ownSourceFixtureIdentity, isWatcherProcessMetadata, operationalPrivacyText, verifiedGithubMetadataText,
        scanZip].map(value => value.toString()),
      textExtensions: [...textExtensions], operationalTextExtensions: [...operationalTextExtensions],
      patterns: [emailPattern, formattedNanpPattern, compactNanpPattern, terminalSgrPattern].map(String)
    });
  const source = await execFileAsync("git", ["rev-parse", "HEAD", "HEAD^{tree}"], {cwd: root,
    env: {...process.env, GIT_OPTIONAL_LOCKS: "0"}});
  const [commit, tree] = source.stdout.trim().split("\n");
  const scan = async (path, body, context) => {
    if (path.endsWith(".zip")) return scanZip(path, body, blockedDigests, approvedBinaryDigests, policy.executables[1].path);
    const label = relative(root, path);
    if (operationalTextExtensions.has(extname(path).toLowerCase())) {
      if (!isOperationalTextArtifact(path, body))
        return approvedBinaryDigests.has(sha256(body)) ? [] : [`${label}: unreviewed binary publication artifact`];
      const nativeText = verifiedNativeProbeMetadataText(body.toString("utf8"), context.nativeProbe);
      const sourceText = verifiedSyntheticSourceFixtureText(nativeText, context.sourceFixture);
      return customerDataFindings(operationalPrivacyText(sourceText, githubIdentities), label, blockedDigests);
    }
    if (!textExtensions.has(extname(path).toLowerCase())) {
      if (isWatcherProcessMetadata(path, body)) return customerDataFindings(body.toString("ascii"), label, blockedDigests);
      const proposedText = isProposedTextArtifact(path, body), cpuProfileText = isCpuProfileTextArtifact(path, body);
      if (proposedText || cpuProfileText) {
        const text = body.toString("utf8");
        return customerDataFindings(cpuProfileText ? cpuProfilePrivacyText(text) : verifiedGithubMetadataText(text, githubIdentities),
          label, blockedDigests);
      }
      return approvedBinaryDigests.has(sha256(body)) ? [] : [`${label}: unreviewed binary publication artifact`];
    }
    const nativeText = verifiedNativeProbeMetadataText(body.toString("utf8"), context.nativeProbe);
    const sourceText = verifiedSyntheticSourceFixtureText(nativeText, context.sourceFixture);
    return customerDataFindings(verifiedGithubMetadataText(sourceText, githubIdentities), label, blockedDigests);
  };
  policy.context.scan = scan.toString();
  const result = await privacyFileCoverage({root, directory: join(root, ".git", "oracle", "privacy-coverage"),
    candidates: [...candidates].filter(path => !path.includes(`${join(root, "Vault", "index")}/`)), policy,
    source: {commit, tree, command: [process.execPath, ...process.execArgv, ...process.argv.slice(1)]}, scan,
    contextFor: async path => ({nativeProbe: await ownNativeProbeIdentity(path, nativeProbeIdentities),
      sourceFixture: await ownSourceFixtureIdentity(path, nativeProbeIdentities)})});
  lastPrivacyCoverage = result.report;
  return result.findings;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const failures = await privacyFailures();
  console.log(JSON.stringify({privacy_coverage: {
    source_commit: lastPrivacyCoverage.source.commit, source_tree: lastPrivacyCoverage.source.tree,
    files: lastPrivacyCoverage.files.length, reused: lastPrivacyCoverage.reused,
    scanned: lastPrivacyCoverage.scanned, invalidated: lastPrivacyCoverage.invalidated,
    policy_sha256: lastPrivacyCoverage.policy_sha256, membership_sha256: lastPrivacyCoverage.membership_sha256
  }}));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Customer-data privacy gate passed for source, Vault, generated clients, and package archives.");
  }
}
