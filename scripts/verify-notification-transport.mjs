import {open, writeFile, realpath} from "node:fs/promises";
import {constants} from "node:fs";
import {resolve, relative, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {parseNotificationSse, createNotificationProtocol} from "../source/platform/bos-workflow-orchestrator/scripts/journey-notifications.mjs";

export const wireContract = "bos-journey-notification-wire-observation/v1";
export const syntheticIdentity = "mcp-client-only-hello-world";
export const maxTranscriptBytes = 512 * 1024;
export const sealedResource = "https://dfsm.ai/mcp/apps/bos/platform";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const requireCase = (value, code) => {if (!value) throw new Error(code);};

function provenance(input) {
  requireCase(/^[a-f0-9]{40}$/u.test(input.source_revision) && /^[a-z][a-z0-9-]{0,127}$/u.test(input.server_revision) &&
    /^sha256:[a-f0-9]{64}$/u.test(input.image_digest), "invalid_deployment_tuple");
  const url = new URL(input.base_url);
  requireCase((url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
    !url.username && !url.password && !url.search && !url.hash && url.pathname === "/", "invalid_candidate_base_url");
}

async function frames(stream, protocol) {
  requireCase(exact(stream, ["frames"]) && Array.isArray(stream.frames) && stream.frames.length > 0 && stream.frames.length <= 8 &&
    stream.frames.every(frame => typeof frame === "string" && Buffer.byteLength(frame) <= 65536 && !/(?:^|[\r\n]):/u.test(frame) &&
      !/bos_ctx_v2_[a-f0-9]{64}|(?:^|[\r\n])(?:authorization|cookie|set-cookie):/iu.test(frame)), "invalid_wire_frames");
  const chunks = (async function* () {for (const frame of stream.frames) yield new TextEncoder().encode(frame);})();
  const output = [];
  for await (const frame of parseNotificationSse(chunks, {maxFrameBytes: protocol.maxFrameBytes})) {
    requireCase(output.length < 8, "wire_frame_count_exceeded");
    const accepted = protocol.accept(frame);
    requireCase(exact(accepted, accepted.id === undefined ? ["event", "data"] : ["event", "id", "data"]) &&
      (accepted.event === "ready" ? exact(accepted.data, ["journeys", "limits", "reconnect"]) &&
        accepted.data.journeys.every(row => exact(row, ["identity", "state_action"])) :
        accepted.event === "journey.changed" && exact(accepted.data, ["identity", "observed_at"])), "only_public_observation_fields_allowed");
    output.push(accepted);
  }
  requireCase(output.length >= 2 && output[0].event === "ready" && output.slice(1).every(frame => frame.event === "journey.changed"), "wire_ready_change_required");
  return output;
}

export async function validateNotificationWireTranscript(input) {
  requireCase(Buffer.byteLength(JSON.stringify(input)) <= maxTranscriptBytes, "transcript_size_exceeded");
  requireCase(exact(input, ["contract", "base_url", "identity", "descriptor", "streams", "resume_cursor", "state_refetch",
    "source_revision", "server_revision", "image_digest"]) && input.contract === wireContract && input.identity === syntheticIdentity,
  "invalid_wire_transcript");
  provenance(input);
  requireCase(Array.isArray(input.streams) && input.streams.length === 2, "two_wire_streams_required");
  const first = await frames(input.streams[0], createNotificationProtocol(input.descriptor, [input.identity]));
  requireCase(input.resume_cursor === first[0].id, "resume_cursor_must_match_baseline");
  const replay = await frames(input.streams[1], createNotificationProtocol(input.descriptor, [input.identity], {resuming: true}));
  const initialChanges = first.slice(1), replayChanges = replay.slice(1);
  requireCase(initialChanges.length === replayChanges.length && initialChanges.every((frame, index) =>
    frame.id === replayChanges[index].id && frame.data.identity === replayChanges[index].data.identity &&
    frame.data.observed_at === replayChanges[index].data.observed_at), "replay_changed_events_must_match");
  requireCase(exact(input.state_refetch, ["http_status", "identity", "status"]) && input.state_refetch.http_status === 200 &&
    input.state_refetch.identity === input.identity && input.state_refetch.status === "awaiting_client", "invalid_sanitized_state_refetch");
  return {contract: "boc-notification-transport-acceptance/v1", mode: "captured_wire", status: "PASS",
    evidence_scope: "independent_client_validation_of_candidate_server_wire", source_revision: input.source_revision,
    server_revision: input.server_revision, image_digest: input.image_digest,
    checks: {ready: true, committed_change: true, resume_cursor_matches_baseline: true, replay_stable: true,
      sanitized_state_refetch: true, frame_schema_valid: true}, frame_count: first.length + replay.length,
    boc_native_authentication_proven: false, native_host_wake_proven: false,
    limitations: ["Deployment provenance and the state HTTP observation were supplied by the candidate owner.",
      "Only the sanitized state observation is independently checked; the original state envelope and network request are not present.",
      "This receipt establishes captured-wire validation, without BOC-native authenticated streaming or native host wake."]};
}

export async function readBoundedJson(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    requireCase(info.isFile() && info.size <= maxTranscriptBytes, "invalid_or_oversized_input_file");
    const buffer = Buffer.alloc(maxTranscriptBytes + 1);
    let used = 0, count;
    do { ({bytesRead: count} = await handle.read(buffer, used, buffer.length - used, null)); used += count; }
    while (count && used < buffer.length);
    requireCase(used <= maxTranscriptBytes, "transcript_size_exceeded");
    const bytes = buffer.subarray(0, used);
    return {document: JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes)), sha256: sha(bytes)};
  } finally {await handle.close();}
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") {
    console.log("npm run acceptance:notifications -- --transcript <private-wire.json> --evidence-out <new-private-receipt.json>\n" +
      "npm run acceptance:notifications -- --reviewer-config <private-config.json> --bosl-file <hash-bound-client-only.json> " +
      "--source-revision <sha> --server-revision <revision> --image-digest <digest> --evidence-out <new-private-receipt.json>");
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    requireCase(/^--[a-z-]+$/u.test(args[i]) && args[i + 1] && !args[i + 1].startsWith("--") && !Object.hasOwn(options, args[i]), "invalid_acceptance_arguments");
    options[args[i]] = args[i + 1];
  }
  const keys = ["--transcript", "--reviewer-config", "--bosl-file", "--source-revision", "--server-revision", "--image-digest", "--evidence-out"];
  requireCase(Object.keys(options).every(key => keys.includes(key)) && options["--evidence-out"], "invalid_acceptance_arguments");
  const output = resolve(options["--evidence-out"]), location = relative(resolve(root, "Vault/tmp"), output);
  requireCase(location && !location.startsWith("..") && !location.startsWith("/"), "evidence_must_remain_private");
  const privateRoot = await realpath(resolve(root, "Vault/tmp"));
  const parentLocation = relative(privateRoot, await realpath(dirname(output)));
  requireCase(!parentLocation.startsWith("..") && !parentLocation.startsWith("/"), "evidence_must_remain_private");
  let evidence;
  if (options["--transcript"]) {
    requireCase(Object.keys(options).length === 2, "transcript_mode_has_no_authentication_options");
    const captured = await readBoundedJson(resolve(options["--transcript"]));
    evidence = {...await validateNotificationWireTranscript(captured.document), transcript_sha256: captured.sha256};
  } else {
    requireCase(keys.filter(key => !["--transcript"].includes(key)).every(key => options[key]), "live_arguments_required");
    const {runLiveNotificationAcceptance} = await import("./lib/notification-transport-live.mjs");
    evidence = await runLiveNotificationAcceptance({configPath: resolve(options["--reviewer-config"]), boslPath: resolve(options["--bosl-file"]),
      sourceRevision: options["--source-revision"], serverRevision: options["--server-revision"], imageDigest: options["--image-digest"]});
  }
  await writeFile(output, JSON.stringify(evidence, null, 2) + "\n", {mode: 0o600, flag: "wx"});
  console.log(JSON.stringify({status: evidence.status, mode: evidence.mode, evidence: output, native_host_wake_proven: false}));
  if (evidence.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {console.error("Notification acceptance failed: bounded input, prerequisite or wire validation failed."); process.exitCode = 1;});
}
