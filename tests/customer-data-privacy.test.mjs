import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, relative} from "node:path";
import test from "node:test";

import {
  customerDataFindings,
  isProposedTextArtifact,
  isOperationalTextArtifact,
  operationalPrivacyText,
  isCpuProfileTextArtifact,
  cpuProfilePrivacyText,
  isWatcherProcessMetadata,
  normalizeSensitiveText,
  fixturePrivacyFailures,
  root,
  sha256,
  verifiedGithubMetadataText,
  verifiedNativeProbeMetadataText,
  verifiedSyntheticSourceFixtureText
} from "../scripts/check-customer-data.mjs";
import {syntheticIdentity} from "../scripts/lib/synthetic-fixtures.mjs";
import {createDeterministicZip} from "../scripts/lib/deterministic-zip.mjs";

// Production native witnesses use *.stdout.log/*.stderr.log; child sessions
// use JSONL and retained test/probe output also uses these base suffixes.
const operationalSuffixes = [".tap", ".ndjson", ".stderr", ".stdout", ".json", ".jsonl", ".log", ".stdout.log", ".stderr.log", ".tap.log"];

function originalDigestMatch(text, path, blocked) {
  const words = normalizeSensitiveText(`${path} ${text}`).split(" ").filter(Boolean);
  for (let size = 1; size <= 8; size += 1) {
    for (let index = 0; index + size <= words.length; index += 1) {
      if (blocked.has(sha256(words.slice(index, index + size).join(" ")))) return true;
    }
  }
  return false;
}

test("digest memoization equals the original matcher across path and short or empty line boundaries", () => {
  const words = ["synthetic", "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta"];
  for (let length = 1; length <= 8; length += 1) {
    const phrase = words.slice(0, length);
    const blocked = new Set([sha256(phrase.join(" "))]);
    for (let split = 0; split <= length; split += 1) {
      const text = `${phrase.slice(0, split).join("\n\n")}\n${phrase.slice(split).join("\n")}`;
      for (const path of ["fixture.md", "prefix synthetic"]) {
        const actual = customerDataFindings(text, path, blocked).some(item => item.endsWith("identifier digest"));
        assert.equal(actual, originalDigestMatch(text, path, blocked), `${length}/${split}/${path}`);
        assert.equal(customerDataFindings(text, path, blocked).some(item => item.endsWith("identifier digest")), actual);
      }
    }
  }
  const acrossPath = new Set([sha256("synthetic path final body beginning")]);
  assert.equal(customerDataFindings("body\n\n beginning", "synthetic/path/final", acrossPath).length, 1);
  const nineWords = "one two three four five six seven eight nine";
  assert.deepEqual(customerDataFindings(nineWords, "fixture.md", new Set([sha256(nineWords)])), []);
});

test("digest memoization tracks exact policy mutation and preserves finding order and attribution", () => {
  const phrase = "synthetic blocked fixture";
  const blocked = new Set([sha256("unrelated synthetic identity")]);
  assert.deepEqual(customerDataFindings(phrase, "first.md", blocked), []);
  blocked.add(sha256(phrase));
  const address = ["person", "production-domain.invalidated"].join("@");
  const phone = ["202", "867", "5309"].join("-");
  for (const path of ["first.md", "second.md"]) {
    assert.deepEqual(customerDataFindings(`${address}\n${phone}\n${phrase}`, path, blocked), [
      `${path}: non-synthetic email address`, `${path}: non-fictional phone number`, `${path}: prohibited customer identifier digest`
    ]);
  }
  blocked.delete(sha256(phrase));
  assert.deepEqual(customerDataFindings(phrase, "first.md", blocked), []);
});

test("digest cache eviction and oversized windows preserve detection", () => {
  const blocked = new Set([sha256("synthetic blocked fixture")]);
  const manyLines = Array.from({length: 33000}, (_, index) => `syntheticvalue${index}`).join("\n");
  assert.deepEqual(customerDataFindings(manyLines, "fixture.md", blocked), []);
  const wideLines = Array.from({length: 600}, (_, index) => `synthetic${index}${"x".repeat(1100)}`).join("\n");
  assert.deepEqual(customerDataFindings(wideLines, "fixture.md", blocked), []);
  assert.deepEqual(customerDataFindings(`${"x".repeat(17000)}\nsynthetic\nblocked\nfixture`, "fixture.md", blocked),
    ["fixture.md: prohibited customer identifier digest"]);
});

test("native CPU profiles receive complete text checks while malformed or opaque profiles remain blocked", async () => {
  const profile = {startTime: 1, endTime: 2, nodes: [{id: 1, callFrame: {functionName: "synthetic", url: "fixture.mjs"}}], samples: [1], timeDeltas: [1]};
  assert.equal(isCpuProfileTextArtifact("fixture.cpuprofile", Buffer.from(JSON.stringify(profile))), true);
  for (const bytes of [Buffer.from([0xff]), Buffer.from("hidden\0bytes"), Buffer.from("{}"), Buffer.from("not a profile")]) {
    assert.equal(isCpuProfileTextArtifact("fixture.cpuprofile", bytes), false);
  }
  const directory = await mkdtemp(join(tmpdir(), "boc-privacy-cpu-"));
  const path = join(directory, "fixture.cpuprofile"), opaque = join(directory, "opaque.cpuprofile");
  profile.nodes[0].callFrame.functionName = ["person", "production-domain.invalidated"].join("@");
  try {
    await writeFile(path, JSON.stringify(profile));
    await writeFile(opaque, Buffer.from([0xff]));
    const result = await fixturePrivacyFailures([path, opaque]);
    assert(result.some(item => item.includes("fixture.cpuprofile: non-synthetic email")));
    assert(result.some(item => item.includes("opaque.cpuprofile: unreviewed binary")));
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test("CPU profile privacy retains escaped and overwritten strings plus original numeric lexemes", async () => {
  const profile = {startTime: 1, endTime: 2, nodes: [{id: 1, callFrame: {functionName: "synthetic", url: "fixture.mjs"}}], samples: [1], timeDeltas: [1]};
  const raw = JSON.stringify(profile).replace('"startTime":1', '"startTime":1e+000');
  assert(cpuProfilePrivacyText(raw).startsWith(raw + "\n"));
  assert(customerDataFindings(cpuProfilePrivacyText(raw), "fixture.cpuprofile", new Set([sha256("starttime 1e 000")]))
    .some(value => value.includes("identifier digest")));
  const directory = await mkdtemp(join(tmpdir(), "boc-profile-strings-"));
  const paths = ["escaped", "overwritten", "safe", "phone"].map(name => join(directory, name + ".cpuprofile"));
  const address = ["person", "production-domain.invalidated"].join("@").replace("@", "\\u0040");
  const encoded = raw.replace('"functionName":"synthetic"', `"functionName":"${address}"`);
  const overwritten = raw.replace('"functionName":"synthetic"', `"functionName":"${address}","functionName":"synthetic"`);
  const safe = raw.replace('"functionName":"synthetic"', `"functionName":"${["fixture", "example.invalid"].join("@").replace("@", "\\u0040")}"`);
  const phone = raw.replace('"functionName":"synthetic"', `"functionName":"${["202", "867", "5309"].join("-").replace("2", "\\u0032")}"`);
  const phrase = raw.replace('"functionName":"synthetic"', '"functionName":"synthetic\\u0020blocked\\u0020fixture"');
  assert(customerDataFindings(cpuProfilePrivacyText(phrase), "fixture.cpuprofile", new Set([sha256("synthetic blocked fixture")]))
    .some(value => value.includes("identifier digest")));
  try {
    for (const [index, text] of [encoded, overwritten, safe, phone].entries()) await writeFile(paths[index], text);
    const result = await fixturePrivacyFailures(paths);
    assert(result.some(value => value.includes("escaped.cpuprofile: non-synthetic email")));
    assert(result.some(value => value.includes("overwritten.cpuprofile: non-synthetic email")));
    assert(result.some(value => value.includes("phone.cpuprofile: non-fictional phone")));
    assert(result.every(value => !value.includes("safe.cpuprofile:")));
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test("privacy archive collection retains text and opaque binary admission", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-privacy-archive-"));
  const path = join(directory, "fixture.zip");
  try {
    await writeFile(path, createDeterministicZip([
      {path: "retained.log", mode: 0o644, content: Buffer.from(["person", "production-domain.invalidated"].join("@"))},
      {path: "opaque.png", mode: 0o644, content: Buffer.from("unapproved synthetic binary")}
    ]));
    const result = await fixturePrivacyFailures([path]);
    assert(result.some(item => item.includes("fixture.zip!retained.log: non-synthetic email")));
    assert(result.some(item => item.includes("fixture.zip!opaque.png: unreviewed binary")));
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test("proposed text drafts require a known source type and valid control-free UTF-8", () => {
  for (const path of ["workflow.md.proposed", "client.mjs.proposed", "record.json.proposed"]) {
    assert.equal(isProposedTextArtifact(path, Buffer.from("Synthetic text.\n")), true);
  }
  for (const [path, bytes] of [["image.png.proposed", Buffer.from("text")], ["unknown.proposed", Buffer.from("text")],
    ["client.mjs.proposed", Buffer.from([0xff])], ["workflow.md.proposed", Buffer.from("hidden\0bytes")]]) {
    assert.equal(isProposedTextArtifact(path, bytes), false);
  }
  const external = ["person", "production-domain.invalidated"].join("@");
  assert(customerDataFindings(external, "workflow.md.proposed", new Set()).some(item => item.includes("email")));
  const phrase = "synthetic blocked draft identity";
  assert(customerDataFindings(phrase, "client.mjs.proposed", new Set([sha256(normalizeSensitiveText(phrase))]))
    .some(item => item.includes("identifier digest")));
});

test("operational output is strict UTF-8 text and retains complete privacy checks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-operational-privacy-"));
  const paths = [];
  try {
    for (const extension of operationalSuffixes) {
      assert.equal(isOperationalTextArtifact(`fixture${extension}`, Buffer.from("Synthetic text.\n\t")), true);
      assert.equal(isOperationalTextArtifact(`fixture${extension}`, Buffer.from("\x1b[36;1mSynthetic\x1b[0m")), true);
      for (const bytes of [Buffer.from([0xff]), Buffer.from("hidden\0bytes"), Buffer.from("\x1b[2J"), Buffer.from("\x1b[31;")]) {
        assert.equal(isOperationalTextArtifact(`fixture${extension}`, bytes), false);
      }
      const path = join(directory, `sensitive${extension}`);
      await writeFile(path, ["person", "production-domain.invalidated"].join("@"));
      paths.push(path);
      for (const [kind, bytes] of [["invalid", Buffer.from([0xff])], ["control", Buffer.from("hidden\0bytes")]]) {
        const invalid = join(directory, `${kind}${extension}`);
        await writeFile(invalid, bytes); paths.push(invalid);
      }
    }
    assert.equal(isOperationalTextArtifact("opaque.png", Buffer.from("Synthetic text")), false);
    const opaque = join(directory, "opaque.stderr");
    await writeFile(opaque, Buffer.from([0xff])); paths.push(opaque);
    const findings = await fixturePrivacyFailures(paths);
    for (const extension of operationalSuffixes) {
      assert(findings.some(value => value.includes(`sensitive${extension}: non-synthetic email`)));
      for (const kind of ["invalid", "control"]) assert(findings.some(value => value.includes(`${kind}${extension}: unreviewed binary`)));
    }
    assert(findings.some(value => value.includes("opaque.stderr: unreviewed binary")));
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test("terminal color output preserves raw evidence and checks rendered and escaped identifier values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-privacy-terminal-"));
  const address = ["person", "production-domain.invalidated"].join("@");
  const phone = ["202", "867", "5309"].join("-");
  const color = value => value.slice(0, 3) + "\x1b[36;1m" + value.slice(3) + "\x1b[0m";
  const paths = [];
  try {
    for (const suffix of operationalSuffixes) for (const [name, text] of [
      ["email", color(address)], ["phone", color(phone)],
      ["escaped", JSON.stringify({value: color(address)}) + "\n{}\n"]
    ]) {
      const path = join(directory, name + suffix); await writeFile(path, text); paths.push(path);
      assert(operationalPrivacyText(text, {}).startsWith(text));
    }
    const findings = await fixturePrivacyFailures(paths);
    for (const path of paths) assert(findings.some(value => value.startsWith(relative(root, path) + ":")), path);
    const phrase = "synthetic blocked color phrase", text = color(phrase);
    assert(customerDataFindings(operationalPrivacyText(text, {}), "color.log", new Set([sha256(phrase)]))
      .some(value => value.includes("identifier digest")));
  } finally {await rm(directory, {recursive: true, force: true});}
});

test("multi-record operational JSON inspects escaped strings and duplicate members without losing raw evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-operational-records-"));
  const address = ["person", "production-domain.invalidated"].join("@");
  const phone = ["202", "867", "5309"].join("-");
  const phrase = "synthetic blocked operational phrase";
  const encoded = value => JSON.stringify(value).replaceAll("@", "\\u0040")
    .replaceAll("2", "\\u0032").replaceAll(" ", "\\u0020");
  const rows = value => `{"value":${encoded(value)}}\n{"safe":true}\n`;
  try {
    const paths = [];
    for (const extension of operationalSuffixes) {
      for (const [name, raw] of [
        ["email", rows(address)], ["phone", rows(phone)],
        ["duplicate", `{"value":${encoded(address)},"value":""}\n{"safe":true}\n`],
        ["malformed", `{"bad":"\\xZZ"}\n{"value":${encoded(address)}}\n`],
        ["nested", JSON.stringify(rows(address)) + "\n" + JSON.stringify({safe: true}) + "\n"],
        ["fragment", "native output: " + rows(address)]
      ]) {
        const path = join(directory, name + extension); await writeFile(path, raw); paths.push(path);
        assert.equal(await readFile(path, "utf8"), raw, "privacy inspection preserves retained bytes");
      }
    }
    const findings = await fixturePrivacyFailures(paths);
    for (const path of paths) assert(findings.some(value => value.startsWith(relative(root, path) + ":")), path);
    const raw = rows(phrase);
    const inspected = operationalPrivacyText(raw, {});
    assert(inspected.startsWith(raw), "all original nonmetadata bytes remain inspected");
    assert(customerDataFindings(inspected, "records.ndjson", new Set([sha256(phrase)]))
      .some(value => value.includes("identifier digest")));
    for (const [value, kind] of [[address, "email"], [phone, "phone"], [phrase, "identifier digest"]]) {
      const duplicate = `{"value":${encoded(value)},"value":""}\n{"safe":true}\n`;
      assert(customerDataFindings(operationalPrivacyText(duplicate, {}), "duplicate.ndjson", new Set([sha256(phrase)]))
        .some(finding => finding.includes(kind)));
    }
    const numeric = '{"value":1e+000}\r\n{"safe":true}\r\n';
    assert(operationalPrivacyText(numeric, {}).includes(numeric));
    assert(customerDataFindings(operationalPrivacyText(numeric, {}), "records.ndjson", new Set([sha256("1e 000")]))
      .some(value => value.includes("identifier digest")));
    const malformed = `{"bad":"\\xZZ"}\n{"value":${encoded(address)}}\n`;
    assert.doesNotThrow(() => operationalPrivacyText(malformed, {}));
    assert(customerDataFindings(operationalPrivacyText(malformed, {}), "records.ndjson", new Set())
      .some(value => value.includes("email")));
    const unrelated = JSON.stringify({parts: ["202", "867", "5309"]});
    assert.deepEqual(customerDataFindings(operationalPrivacyText(unrelated, {}), "independent.log", new Set()), [],
      "decoded independent values cannot invent a phone across value boundaries");
    for (const suffix of operationalSuffixes) {
      for (const raw of [rows(phrase), `{"value":${encoded(phrase)},"value":""}\r\n{"safe":true}\r\n`,
        JSON.stringify(rows(phrase)), `malformed {\n{"value":${encoded(phrase)}}\n`]) {
        const view = operationalPrivacyText(raw, {});
        assert(view.startsWith(raw));
        assert(customerDataFindings(view, `records${suffix}`, new Set([sha256(phrase)]))
          .some(value => value.includes("identifier digest")));
      }
    }
  } finally {await rm(directory, {recursive: true, force: true});}
});

test("archived operational records use the same escaped-value and strict-byte policy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-privacy-record-archive-"));
  const path = join(directory, "records.zip");
  const encoded = JSON.stringify(["person", "production-domain.invalidated"].join("@")).replace("@", "\\u0040");
  try {
    await writeFile(path, createDeterministicZip(operationalSuffixes.flatMap(suffix => [
      {path: `escaped${suffix}`, mode: 0o644, content: Buffer.from(`{"value":${encoded}}\n{"safe":true}\n`)},
      {path: `opaque${suffix}`, mode: 0o644, content: Buffer.from([0xff])}
    ])));
    const findings = await fixturePrivacyFailures([path]);
    for (const suffix of operationalSuffixes) {
      assert(findings.some(value => value.includes(`records.zip!escaped${suffix}: non-synthetic email`)));
      assert(findings.some(value => value.includes(`records.zip!opaque${suffix}: unreviewed binary`)));
    }
  } finally {await rm(directory, {recursive: true, force: true});}
});

test("malformed record recovery cannot consume later valid escaped values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-privacy-record-recovery-"));
  const address = ["person", "production-domain.invalidated"].join("@");
  const phone = ["202", "867", "5309"].join("-");
  const phrase = "synthetic blocked record recovery";
  const encode = value => JSON.stringify(value).replaceAll("@", "\\u0040").replaceAll("2", "\\u0032").replaceAll(" ", "\\u0020");
  const rows = value => [
    `{"broken":"unterminated\n{"value":${encode(value)}}\n`,
    `{"broken":"escape\\\n{"value":${encode(value)}}\n`,
    `{"bad":"\\xZZ","value":${encode(value)}}\n`,
    `{"broken":"unterminated\r\n{"value":${encode(value)},"value":""}\r\n`,
    ...[1, 2, 3, 4].map(count => `{"broken":"prefix${"\\".repeat(count)}"tail\n{"value":${encode(value)}}\n`),
    `{"first":"unterminated\n{"safe":true}\n{"second":"unterminated\n{"value":${encode(value)}}\n{"last":"unterminated\n`,
    `{"broken":"unterminated\n{"nested":{"value":${encode(value)},"value":""}}\n`,
    `{"broken":"unterminated\n{"value":${encode(value.slice(0, 3) + "\x1b[36;1m" + value.slice(3) + "\x1b[0m")}}\n`
  ];
  const paths = [];
  try {
    for (const suffix of operationalSuffixes) for (const [index, text] of rows(address).entries()) {
      const path = join(directory, `email-${index}${suffix}`); await writeFile(path, text); paths.push(path);
      assert(operationalPrivacyText(text, {}).startsWith(text));
    }
    const findings = [];
    for (let index = 0; index < paths.length; index += 100) findings.push(...await fixturePrivacyFailures(paths.slice(index, index + 100)));
    for (const path of paths) assert(findings.some(value => value.startsWith(relative(root, path) + ":")), path);
    for (const [value, kind] of [[phone, "phone"], [phrase, "identifier digest"]]) for (const text of rows(value)) {
      assert(customerDataFindings(operationalPrivacyText(text, {}), "recovery.log", new Set([sha256(phrase)]))
        .some(value => value.includes(kind)));
    }
    const nested = JSON.stringify(rows(address)[0]);
    assert(customerDataFindings(operationalPrivacyText(nested, {}), "nested-recovery.log", new Set())
      .some(value => value.includes("email")));
    for (const text of rows("synthetic fixture value")) {
      assert.deepEqual(customerDataFindings(operationalPrivacyText(text, {}), "safe-recovery.log", new Set([sha256(phrase)])), []);
    }
  } finally {await rm(directory, {recursive: true, force: true});}
});

test("verified own native argv normalization preserves every nonmetadata value and denies forged custody", () => {
  const setting = ["plugins.synthetic", "synthetic-marketplace.enabled=false"].join("@");
  const raw = JSON.stringify(["app-server", "-c", setting]);
  const identity = {argv_sha256: sha256(raw), namespaceVerified: true};
  const scan = (text, proof = identity, blocked = new Set()) => customerDataFindings(
    verifiedNativeProbeMetadataText(text, proof), "own-native-probe.json", blocked);
  assert.deepEqual(scan(raw), []);
  assert(scan(raw, {...identity, namespaceVerified: false}).some(item => item.includes("email")));
  assert(scan(raw, {...identity, argv_sha256: "f".repeat(64)}).some(item => item.includes("email")));
  assert(scan(JSON.stringify(["app-server", setting]), {argv_sha256: sha256(JSON.stringify(["app-server", setting])), namespaceVerified: true})
    .some(item => item.includes("email")), "only the actual -c typed slot can normalize");
  const external = ["person", "production-domain.invalidated"].join("@");
  const phone = ["202", "867", "5309"].join("");
  for (const extra of [external, phone, "synthetic secret deny phrase"]) {
    const text = JSON.stringify(["app-server", "-c", setting, extra]);
    const blocked = new Set([sha256(normalizeSensitiveText(extra))]);
    assert(scan(text, {argv_sha256: sha256(text), namespaceVerified: true}, blocked).length > 0);
  }
  const escaped = JSON.stringify(["app-server", "-c", setting, external]).replace("person@", "person\\u0040");
  assert(scan(escaped).some(item => item.includes("email")), "forged bytes retain decoded values and all original lexemes");
  const duplicate = `{"body":${JSON.stringify(external)},"body":""}`;
  assert(scan(duplicate, {argv_sha256: sha256(duplicate), namespaceVerified: true}).some(item => item.includes("email")));
});

test("retained synthetic PID diff recognition requires exact custody and the original typed source slot", () => {
  const source_path = "tests/native-callback-continuation.test.mjs";
  const pid = 2 ** 31 - 2;
  const line = `+  await writeFile(join(f.root, f.registration, "mutation.guard"), JSON.stringify({pid: ${pid}, token: randomUUID()}), {mode: 0o600});`;
  const text = `diff --git a/${source_path} b/${source_path}\n${line}\n`;
  const identity = {source_path, artifact_sha256: sha256(text), sourceFixtureVerified: true};
  const scan = (raw, proof = identity) => customerDataFindings(verifiedSyntheticSourceFixtureText(raw, proof), "retained.diff", new Set());
  assert.deepEqual(scan(text), []);
  assert(scan(text, {...identity, sourceFixtureVerified: false}).some(item => item.includes("phone")));
  assert(scan(text, {...identity, artifact_sha256: "f".repeat(64)}).some(item => item.includes("phone")));
  assert(scan(text, {...identity, source_path: "tests/foreign.test.mjs"}).some(item => item.includes("phone")));
  for (const raw of [text + `+const customer = "${pid}";\n`, text.replace("mutation.guard", "customer.payload")]) {
    assert(scan(raw, {...identity, artifact_sha256: sha256(raw)}).some(item => item.includes("phone")));
  }
  const external = ["person", "production-domain.invalidated"].join("@");
  const raw = text + `+const customer = "${external}";\n`;
  assert(scan(raw, {...identity, artifact_sha256: sha256(raw)}).some(item => item.includes("email")));
});

test("privacy scanner narrowly recognizes bounded ASCII watcher process metadata", () => {
  const path = join(root, "Vault", "tmp", "vault-index", "watcher.pid");
  for (const value of ["1", "12345\n", `${2 ** 31 - 1}\n`]) {
    assert.equal(isWatcherProcessMetadata(path, Buffer.from(value)), true);
  }
  for (const value of ["", "0\n", `${2 ** 31}\n`, "1".repeat(11), "12\n34", "12\r\n", "123@example.com", "123\0"]) {
    assert.equal(isWatcherProcessMetadata(path, Buffer.from(value)), false);
  }
  assert.equal(isWatcherProcessMetadata(path, Buffer.from([0xb1])), false);
  assert.equal(isWatcherProcessMetadata(join(root, "watcher.pid"), Buffer.from("123\n")), false);
});

test("privacy scanner accepts generated tenant-neutral fixtures", () => {
  const fixture = syntheticIdentity("privacy-test");
  assert.deepEqual(customerDataFindings(JSON.stringify(fixture), "fixture.json", new Set()), []);
});

test("privacy scanner rejects non-synthetic emails without embedding customer data", () => {
  const externalAddress = `${["person", "production-domain"].join("@")}\.${"invalidated"}`;
  assert.deepEqual(
    customerDataFindings(`contact ${externalAddress}`, "fixture.json", new Set()),
    ["fixture.json: non-synthetic email address"]
  );
});

test("privacy scanner accepts reserved fictional phones and rejects ordinary NANP phones", () => {
  assert.deepEqual(
    customerDataFindings("+1-202-555-0142", "fixture.json", new Set()),
    []
  );
  assert.deepEqual(
    customerDataFindings(["+1", "202", "867", "5309"].join("-"), "fixture.json", new Set()),
    ["fixture.json: non-fictional phone number"]
  );
  assert.deepEqual(
    customerDataFindings(["202", "867", "5309"].join(""), "fixture.json", new Set()),
    ["fixture.json: non-fictional phone number"]
  );
});

test("privacy scanner rejects hashed identifiers without shipping their values", () => {
  const syntheticSensitive = "prohibited fixture identity with five tokens";
  const blocked = new Set([sha256(normalizeSensitiveText(syntheticSensitive))]);
  assert.deepEqual(
    customerDataFindings(`prefix ${syntheticSensitive} suffix`, "fixture.json", blocked),
    ["fixture.json: prohibited customer identifier digest"]
  );
});

test("verified owned GitHub identity normalizes only exact provider slots", () => {
  const repository = "cody-marcel-dfsm/bos_operations_ceneter";
  const id = Number(["202", "867", "5309"].join(""));
  const node_id = "synthetic-owned-native-provider-identity";
  const identities = {repository, pull_requests: {"7": {id_sha256: sha256(String(id)), node_id_sha256: sha256(node_id)}}};
  const row = {id, node_id, number: 7, url: `https://api.github.com/repos/${repository}/pulls/7`,
    html_url: `https://github.com/${repository}/pull/7`,
    head: {repo: {full_name: repository, ssh_url: `${["git", "github.com"].join("@")}:${repository}.git`}},
    base: {repo: {full_name: repository, ssh_url: `${["git", "github.com"].join("@")}:${repository}.git`}}};
  const scan = (value, registry = identities) => customerDataFindings(
    verifiedGithubMetadataText(JSON.stringify(value), registry), "native-provider.json", new Set());
  assert.deepEqual(scan(row), []);
  assert(scan({...row, id: id + 1}).some((x) => x.includes("phone")));
  assert(scan({...row, node_id: "forged-provider-id"}).some((x) => x.includes("phone")));
  assert(scan({...row, url: "https://api.github.com/repos/foreign/customer/pulls/7"}).some((x) => x.includes("phone")));
  assert(scan(row, {repository: "foreign/customer", pull_requests: identities.pull_requests}).some((x) => x.includes("phone")));
  const external = ["person", "production-domain.invalidated"].join("@");
  assert(scan({...row, body: external}).some((x) => x.includes("email")));
  assert(scan({...row, customer_phone: String(id)}).some((x) => x.includes("phone")));
  const other = structuredClone(row);
  other.head.repo.ssh_url = external;
  assert(scan(other).some((x) => x.includes("email")));
  const rawCases = [
    JSON.stringify(row).replace('"id":', `"body":${JSON.stringify(external)},"body":"","id":`),
    JSON.stringify(row).replace('"id":', `"nested":{"phone":"${id}","phone":""},"id":`),
    JSON.stringify(row).replace('"id":', `"id":${JSON.stringify(external)},"id":`),
    JSON.stringify(row).replace('"id":', `"body":${JSON.stringify(external)},"b\\u006fdy":"","id":`),
  ];
  for (const raw of rawCases) {
    assert(verifiedGithubMetadataText(raw, identities).startsWith(raw));
    assert(customerDataFindings(raw, "duplicate-provider.json", new Set()).length > 0);
  }
  const sensitive = "blocked synthetic duplicate identity";
  const rawBlocked = JSON.stringify(row).replace('"id":',
    `"nested":{"label":${JSON.stringify(sensitive)},"label":""},"id":`);
  assert(customerDataFindings(verifiedGithubMetadataText(rawBlocked, identities), "duplicate-provider.json",
    new Set([sha256(normalizeSensitiveText(sensitive))])).some((x) => x.includes("identifier digest")));
  for (const number of ["9007199254740993", "1.0000000000000001", "9.007199254740993e15", "1e+30", "-0"]) {
    for (const member of [`"synthetic_customer_identifier":${number}`, `"nested":[{"identifier":${number}}]`]) {
      const raw = JSON.stringify(row).replace('"id":', `${member},"id":`);
      const masked = verifiedGithubMetadataText(raw, identities);
      assert(masked.includes(member), "original nonmetadata numeric bytes remain scanned");
      const blocked = new Set([sha256(normalizeSensitiveText(number))]);
      assert(customerDataFindings(masked, "numeric-provider.json", blocked)
        .some((x) => x.includes("identifier digest")));
    }
  }
  const escaped = JSON.stringify(row).replace('"id":', '"customer":"blocked \\u0073ynthetic identifier","id":');
  assert(customerDataFindings(verifiedGithubMetadataText(escaped, identities), "escaped-provider.json",
    new Set([sha256(normalizeSensitiveText("blocked synthetic identifier"))]))
    .some((x) => x.includes("identifier digest")));
  const phrase = "generated synthetic deny phrase";
  const encoded = JSON.stringify(phrase).replaceAll(" ", "\\u0020");
  const scientific = JSON.stringify(row).replace(`"id":${id}`, `"id":${id.toExponential()}`);
  const unique = scientific.replace('"node_id":', `"body":${encoded},"node_id":`);
  const duplicate = unique.replace(`"body":${encoded}`, `"body":${encoded},"body":""`);
  const blocked = new Set([sha256(normalizeSensitiveText(phrase))]);
  for (const raw of [unique, duplicate]) {
    assert(customerDataFindings(verifiedGithubMetadataText(raw, identities), "overwritten-provider.json", blocked)
      .some((x) => x.includes("identifier digest")));
  }
});

test("own HTTP GitHub check-run metadata verifies nested PR IDs while preserving headers and other fields", () => {
  const repository = "cody-marcel-dfsm/bos_operations_ceneter";
  const id = 17, node_id = "synthetic-owned-check-run";
  const pullId = Number(["202", "867", "5309"].join(""));
  const html_url = `https://github.com/${repository}/actions/runs/23/job/${id}`;
  const identities = {repository, check_runs: [{id_sha256: sha256(String(id)), node_id_sha256: sha256(node_id),
    html_url_sha256: sha256(html_url)}], pull_requests: {"7": {id_sha256: sha256(String(pullId))}}};
  const row = {id, node_id, url: `https://api.github.com/repos/${repository}/check-runs/${id}`, html_url,
    pull_requests: [{id: pullId, number: 7, url: `https://api.github.com/repos/${repository}/pulls/7`}]};
  const header = "HTTP/2.0 200 OK\ncontent-type: application/json\nx-request-id: synthetic\n\n";
  const scan = (raw, registry = identities, blocked = new Set()) => customerDataFindings(
    verifiedGithubMetadataText(raw, registry), "retained-http.txt", blocked);
  const text = header + JSON.stringify(row);
  assert.deepEqual(scan(text), []);
  assert.deepEqual(customerDataFindings(operationalPrivacyText(text, identities), "http.stderr", new Set()), []);
  assert(operationalPrivacyText(text, identities).startsWith(header));
  const records = JSON.stringify(row) + "\r\n" + JSON.stringify(row) + "\r\n";
  assert.deepEqual(customerDataFindings(operationalPrivacyText(records, identities), "metadata.ndjson", new Set()), []);
  assert(customerDataFindings(operationalPrivacyText(header.replace("HTTP/2.0", "INVALID") + JSON.stringify(row), identities),
    "malformed-http.stderr", new Set()).some(value => value.includes("phone")));
  assert(verifiedGithubMetadataText(text, identities).startsWith(header), "all original headers remain inspected");
  for (const change of [r => { r.node_id = "foreign"; }, r => { r.url = r.url.replace(repository, "foreign/repository"); },
    r => { r.html_url += "?foreign"; }, r => { r.pull_requests[0].id += 1; },
    r => { r.pull_requests[0].url = r.pull_requests[0].url.replace(repository, "foreign/repository"); }]) {
    const forged = structuredClone(row); change(forged);
    assert(scan(header + JSON.stringify(forged)).some(value => value.includes("phone")));
  }
  assert(scan(text, {...identities, repository: "foreign/repository"}).some(value => value.includes("phone")));
  assert(scan(header.replace("HTTP/2.0", "INVALID") + JSON.stringify(row)).some(value => value.includes("phone")));
  const external = ["person", "production-domain.invalidated"].join("@");
  assert(scan(header.replace("x-request-id: synthetic", `x-request-id: ${external}`) + JSON.stringify(row))
    .some(value => value.includes("email")));
  for (const extra of [{customer: external}, {customer_phone: String(pullId)}]) {
    assert(scan(header + JSON.stringify({...row, ...extra})).length > 0);
  }
  const escaped = JSON.stringify({...row, customer: external}).replace("person@", "person\\u0040");
  assert(scan(header + escaped).some(value => value.includes("email")));
  const duplicate = JSON.stringify(row).replace('"pull_requests":', `"customer":${JSON.stringify(external)},"customer":"","pull_requests":`);
  assert(scan(header + duplicate).some(value => value.includes("email")));
  const phrase = "synthetic blocked retained diagnostic";
  const body = JSON.stringify({...row, output: phrase});
  assert(scan(header + body, identities, new Set([sha256(phrase)])).some(value => value.includes("identifier digest")));
  assert.doesNotThrow(() => scan('HTTP/2.0 200 OK\n\n{"invalid":"\\xZZ"}'));
  const svg = '<svg viewBox="0 0 1400 960"><path d="M 210 270 L 380 270"/></svg>';
  assert.equal(verifiedGithubMetadataText(svg, identities), svg, "non-JSON text keeps its original representation");
});

test("privacy scanner includes untracked candidates and rejects unreviewed binaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-privacy-gate-"));
  const candidate = join(directory, "customer-screenshot.png");
  await writeFile(candidate, Buffer.from("unreviewed-binary-fixture"));
  try {
    const findings = (await fixturePrivacyFailures([candidate]))
      .filter((finding) => finding.includes("customer-screenshot"));
    assert.equal(findings.length, 1);
    assert.match(findings[0], /customer-screenshot\.png: unreviewed binary publication artifact$/u);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test("privacy scanner reads text logs and diffs instead of rejecting them as binaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-privacy-text-"));
  const candidates = ["workflow-output.log", "workflow-output.diff", "workflow-output.patch"]
    .map((name) => join(directory, name));
  try {
    for (const candidate of candidates) await writeFile(candidate, "ok 1 - synthetic output\n");
    const findings = (await fixturePrivacyFailures(candidates))
      .filter((finding) => finding.includes("workflow-output"));
    assert.deepEqual(findings, []);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});


test("fixture privacy scope requires explicit paths and retains customer and binary rejection", async () => {
  await assert.rejects(fixturePrivacyFailures([]), /nonempty bounded/);
  const directory = await mkdtemp(join(tmpdir(), "boc-privacy-fixtures-"));
  const text = join(directory, "synthetic.md.proposed"), binary = join(directory, "synthetic.mjs.proposed");
  try {
    await writeFile(text, ["person", "production-domain.invalidated"].join("@"));
    await writeFile(binary, Buffer.from([0xff, 0]));
    const findings = await fixturePrivacyFailures([text, binary]);
    assert(findings.some(item => item.includes("email")));
    assert(findings.some(item => item.includes("unreviewed binary")));
  } finally { await rm(directory, {recursive: true, force: true}); }
});
