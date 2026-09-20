import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

import {
  CONTROLLED_ATTENDEE,
  OBSERVATION_REQUIREMENTS,
  buildNativeEnvironment,
  buildNativePrompt,
  parseArguments,
  runLiveAcceptance,
  sanitizeEvidence,
  validateCandidateAcceptance,
  validateNativeAcceptance,
  validateReleaseTuple
} from "../scripts/verify-agent-driven-journey-live.mjs";
import { root } from "../scripts/lib/package-model.mjs";

const script = join(root, "scripts", "verify-agent-driven-journey-live.mjs");
const fixture = join(root, "acceptance", "fixtures", "recent-meeting-follow-up.bosl.json");
const schemaPath = join(root, "acceptance", "agent-driven-journey-native-result.schema.json");

function releaseTuple() {
  return {
    sourceRevision: "a".repeat(40),
    serverRevision: "lead-director-backend-staging-01234-abc",
    imageDigest: `sha256:${"b".repeat(64)}`,
    packageVersions: { bos: "0.4.106", education_center: "0.4.106" }
  };
}

function candidateAcceptance(tuple = releaseTuple()) {
  return {
    contract: "bos-agent-journey-staging-acceptance/v1",
    source_revision: tuple.sourceRevision,
    server_revision: tuple.serverRevision,
    image_digest: tuple.imageDigest,
    candidate_base_url: "https://agent-journey-acceptance---lead-director-backend-staging-abc-uc.a.run.app",
    provider_mode: "fake",
    live_send: false,
    checks: {
      calendar_search_read: true,
      automation_template_create_replay: true,
      drive_preview_confirm_delete_reconcile: true,
      journey_compile_register_execute_complete: true,
      artifact_materialize_resolve_revoke: true
    }
  };
}

function approvedNativeResult() {
  return {
    contract: "boc-agent-driven-journey-native-result/v1",
    status: "APPROVED",
    connection: {
      host_managed: true,
      protocol_initialized: true,
      bos_connection_reused: true,
      second_connection_created: false,
      manual_auth_instruction: false,
      localhost_callback: false
    },
    release_matched: true,
    provider_mode: "fake",
    live_send: false,
    controlled_attendee_count: 1,
    checks: Object.entries(OBSERVATION_REQUIREMENTS).map(([id, requirements]) => ({
      id,
      status: "passed",
      observations: requirements.map((requirement) => ({
        case: requirement.case,
        request: {
          source: requirement.source,
          method: requirement.method,
          body_shape: requirement.bodyShape
        },
        response: {
          http_status: requirement.httpStatus,
          schema_validated: requirement.schemaValidated,
          summary: `${id}/${requirement.case} returned the approved public result`
        },
        assertions: requirement.assertions
      }))
    })),
    message: "All mandatory no-send acceptance rows passed."
  };
}

test("release evidence requires one immutable candidate tuple", () => {
  const tuple = releaseTuple();
  assert.deepEqual(validateReleaseTuple(tuple), tuple);
  assert.throws(() => validateReleaseTuple({ ...tuple, sourceRevision: "short" }), /full Git SHA/u);
  assert.throws(() => validateReleaseTuple({ ...tuple, imageDigest: "latest" }), /image-digest/u);
  assert.equal(validateCandidateAcceptance(candidateAcceptance(tuple), tuple).provider_mode, "fake");
  assert.throws(
    () => validateCandidateAcceptance({ ...candidateAcceptance(tuple), candidate_base_url: "https://dfsm.ai" }, tuple),
    /isolated Agent Journey candidate/u
  );
  assert.throws(
    () => validateCandidateAcceptance({ ...candidateAcceptance(tuple), checks: { journey: false } }, tuple),
    /incomplete server check/u
  );
});

test("native result requires every approved BOC-JRN-017 row and exact contract assertions", async () => {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const result = approvedNativeResult();
  assert.equal(validateNativeAcceptance(result, schema), result);
  const omitted = structuredClone(result);
  omitted.checks.pop();
  assert.throws(() => validateNativeAcceptance(omitted, schema), /must NOT have fewer than 32 items/u);
  const wrongCalendarShape = structuredClone(result);
  wrongCalendarShape.checks.find(({ id }) => id === "AC-05").observations
    .find(({ case: caseName }) => caseName === "event_read").assertions = ["event_wrapper_used"];
  assert.throws(() => validateNativeAcceptance(wrongCalendarShape, schema), /AC-05\/event_read omitted a required assertion/u);
  const inventedRegistration = structuredClone(result);
  inventedRegistration.checks.find(({ id }) => id === "AC-09").observations[0].request.source = "returned_action";
  assert.throws(() => validateNativeAcceptance(inventedRegistration, schema), /AC-09\/registration has incorrect source/u);
  const falseSuccess = structuredClone(result);
  falseSuccess.checks.find(({ id }) => id === "AC-10").observations
    .find(({ case: caseName }) => caseName === "invalid_bosl").response.http_status = 200;
  assert.throws(() => validateNativeAcceptance(falseSuccess, schema), /AC-10\/invalid_bosl has incorrect HTTP status/u);
});

test("multi-call rows preserve every exact source, method, body, status, and schema result", async () => {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const approved = approvedNativeResult();
  const expectedStatuses = (id) => approved.checks.find((check) => check.id === id)
    .observations.map(({ response }) => response.http_status);
  assert.deepEqual(expectedStatuses("AC-25"), [410, 404]);
  assert.deepEqual(expectedStatuses("AC-27"), [200, 404, 503, 200]);
  assert.deepEqual(expectedStatuses("AC-28"), [200, 200, 400, 410]);
  assert.deepEqual(
    approved.checks.find(({ id }) => id === "AC-24").observations.map(({ case: caseName, request, response }) => ({
      case: caseName,
      source: request.source,
      method: request.method,
      body_shape: request.body_shape,
      http_status: response.http_status,
      schema_validated: response.schema_validated
    })),
    [
      { case: "creation_rate_limit", source: "discovered_contract", method: "POST", body_shape: "raw_bosl", http_status: 429, schema_validated: true },
      { case: "active_capacity_start", source: "returned_action", method: "POST", body_shape: "none", http_status: 409, schema_validated: true },
      { case: "stoppable_choice_state", source: "returned_action", method: "GET", body_shape: "none", http_status: 200, schema_validated: true },
      { case: "user_selected_stop", source: "returned_action", method: "POST", body_shape: "returned_schema", http_status: 200, schema_validated: true },
      { case: "start_after_stop", source: "returned_action", method: "POST", body_shape: "none", http_status: 200, schema_validated: true }
    ]
  );
  assert.deepEqual(
    approved.checks.find(({ id }) => id === "AC-24").observations
      .find(({ case: caseName }) => caseName === "user_selected_stop").assertions,
    ["failed_code_user_stopped"]
  );
  for (const [field, value, message] of [
    ["source", "returned_action", /incorrect source/u],
    ["method", "GET", /incorrect method/u],
    ["body_shape", "none", /incorrect body_shape/u]
  ]) {
    const changed = structuredClone(approved);
    changed.checks.find(({ id }) => id === "AC-28").observations[0].request[field] = value;
    assert.throws(() => validateNativeAcceptance(changed, schema), message);
  }
  const unvalidated = structuredClone(approved);
  unvalidated.checks.find(({ id }) => id === "AC-28").observations[0].response.schema_validated = false;
  assert.throws(() => validateNativeAcceptance(unvalidated, schema), /incorrect schema-validation result/u);
  const missingSubcase = structuredClone(approved);
  missingSubcase.checks.find(({ id }) => id === "AC-27").observations.pop();
  assert.throws(() => validateNativeAcceptance(missingSubcase, schema), /AC-27 has an incomplete observation set/u);
});

test("native acceptance uses only the installed host-managed BOS connection", async () => {
  const tuple = releaseTuple();
  const boslDocument = JSON.parse(await readFile(fixture, "utf8"));
  const nativeResult = approvedNativeResult();
  let commandObserved = false;
  const evidence = await runLiveAcceptance({
    ...tuple,
    candidateAcceptance: candidateAcceptance(tuple),
    boslDocument,
    environment: {
      PATH: process.env.PATH,
      CODEX_HOME: "/host/codex",
      BOS_MCP_ACCESS_TOKEN: "must-never-cross-process-boundary",
      BOS_PROVIDER_SECRET: "must-never-cross-process-boundary",
      BOS_CONTEXT_HANDLE: "must-never-cross-process-boundary",
      BOS_ORGANIZATION_ID: "must-never-cross-process-boundary",
      GOOGLE_CLOUD_KEY: "must-never-cross-process-boundary"
    },
    verifyRuntime: async () => ({
      ok: true,
      failures: [],
      installed_products: {
        bos: { version: "0.4.106" },
        "education-center": { version: "0.4.106" }
      }
    }),
    runCommand: async (args, { environment }) => {
      commandObserved = true;
      assert.deepEqual(args.slice(0, 8), [
        "exec", "--ephemeral", "--json", "--sandbox", "read-only", "--cd", root,
        "--output-schema"
      ]);
      assert.equal(args[8], schemaPath);
      assert.equal(args[9], "--output-last-message");
      assert.equal(environment.CODEX_HOME, "/host/codex");
      assert.equal(environment.BOS_MCP_ACCESS_TOKEN, undefined);
      assert.equal(environment.BOS_PROVIDER_SECRET, undefined);
      assert.equal(environment.BOS_CONTEXT_HANDLE, undefined);
      assert.equal(environment.BOS_ORGANIZATION_ID, undefined);
      assert.equal(environment.GOOGLE_CLOUD_KEY, undefined);
      const prompt = args.at(-1);
      assert.match(prompt, /existing host-managed authenticated connection/u);
      assert.match(prompt, /read the event from response\.event and observed_at from the top-level response/u);
      assert.match(prompt, /registration operation returned by Describe/u);
      assert.match(prompt, new RegExp(CONTROLLED_ATTENDEE.replace(".", "\\."), "u"));
      assert.match(prompt, /Perform no real send/u);
      await writeFile(args[10], JSON.stringify(nativeResult), "utf8");
      return "";
    },
    now: () => new Date("2026-09-20T20:00:00.000Z")
  });
  assert.equal(commandObserved, true);
  assert.equal(evidence.passed, true);
  assert.equal(evidence.native_result.checks.length, 32);
  assert.equal(evidence.observed_at, "2026-09-20T20:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(evidence), /cody\.marcel@dfsm\.ai|must-never-cross/u);
});

test("credential-shaped environment values are never delegated to the verifier task", () => {
  assert.deepEqual(buildNativeEnvironment({
    PATH: "/bin",
    CODEX_HOME: "/codex",
    BOS_MCP_ACCESS_TOKEN: "private",
    BOS_REFRESH_TOKEN: "private",
    BOS_PROVIDER_API_KEY: "private",
    BOS_CONTEXT_HANDLE: "private",
    BOS_ORGANIZATION_ID: "private",
    GOOGLE_CLOUD_KEY: "private",
    UNRELATED_VALUE: "public"
  }), {
    PATH: "/bin",
    CODEX_HOME: "/codex"
  });
});

test("live evidence sanitizer removes authority and attendee data", () => {
  const value = sanitizeEvidence({
    context_handle: "bos_ctx_v2_private",
    attendees: [{ email: CONTROLLED_ATTENDEE }],
    message: `Observed ${CONTROLLED_ATTENDEE}`,
    public: "retained"
  });
  assert.deepEqual(value, {
    context_handle: "[REDACTED]",
    attendees: [{ email: "[REDACTED]" }],
    message: "Observed [REDACTED]",
    public: "retained"
  });
});

test("canonical fixture has the controlled seed and only sanctioned server operations", async () => {
  const document = JSON.parse(await readFile(fixture, "utf8"));
  assert.deepEqual(document.inputs.attendees, [{
    email: CONTROLLED_ATTENDEE,
    display_name: "Cody Marcel",
    response_status: "accepted"
  }]);
  const operations = new Set(
    document.nodes.filter(({ type }) => type === "server").map(({ operation }) => operation).filter(Boolean)
  );
  assert.deepEqual(operations, new Set([
    "email_list.materialize",
    ["i", "code-automated-outreach.templates.resolve"].join(""),
    "sendgrid-email.campaign.prepare",
    "sendgrid-email.campaign.send"
  ]));
  assert.equal(document.nodes.find(({ code }) => code === "review_campaign").type, "client");
  assert.equal(document.nodes.find(({ code }) => code === "show_send_result").type, "client");
});

test("native prompt preserves discovery, returned-action, no-send, and full-matrix semantics", async () => {
  const tuple = releaseTuple();
  const document = JSON.parse(await readFile(fixture, "utf8"));
  const prompt = buildNativePrompt(tuple, document, candidateAcceptance(tuple));
  for (const phrase of [
    "existing host-managed authenticated connection",
    "Do not create a second connection",
    "read the event from response.event",
    "registration operation returned by Describe",
    "Follow every lifecycle URL and payload schema exactly as returned",
    "Perform no real send",
    "AC-31"
  ]) assert.match(prompt, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});

test("arguments and release integration are closed; real-send mode fails before execution", async () => {
  assert.deepEqual(parseArguments([
    "--candidate-acceptance", "/tmp/evidence.json",
    "--provider-mode", "fake"
  ]), { candidate_acceptance: "/tmp/evidence.json", provider_mode: "fake" });
  assert.throws(() => parseArguments(["--base-url", "https://dfsm.ai"]), /unknown argument/u);
  assert.throws(
    () => parseArguments(["--provider-mode", "fake", "--provider-mode", "fake"]),
    /repeated/u
  );
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["acceptance:agent-journey-live"],
    "node scripts/verify-agent-driven-journey-live.mjs");
  assert.match(packageJson.scripts["release:check"], /npm test/u);
  const result = spawnSync(process.execPath, [
    script,
    "--candidate-acceptance", fixture,
    "--evidence-out", join(root, "Vault", "tmp", "must-not-write.json"),
    "--source-revision", "a".repeat(40),
    "--server-revision", "candidate-1",
    "--image-digest", `sha256:${"b".repeat(64)}`,
    "--package-versions-json", "{\"bos\":\"0.4.106\"}",
    "--provider-mode", "live"
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /automated acceptance requires --provider-mode fake/u);
  assert.doesNotMatch(result.stderr, /cody\.marcel@dfsm\.ai/u);
});

test("verifier source contains no direct HTTP or bearer authentication implementation", async () => {
  const source = await readFile(script, "utf8");
  assert.doesNotMatch(source, /headers\.Authorization|Bearer \$\{|globalThis\.fetch|fetchImpl|token_env/u);
  assert.match(source, /inspectCodexRuntime/u);
  assert.match(source, /"exec", "--ephemeral", "--json", "--sandbox", "read-only"/u);
});
