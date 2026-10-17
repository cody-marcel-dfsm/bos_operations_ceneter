// Maintainer acceptance only. Credentials remain inside the established reviewer session.
import Ajv from "ajv/dist/2020.js";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {openReviewerSession, trustedUrl} from "../marketplace-reviewer-session.mjs";
import {verifyNativeReviewer} from "../marketplace-native-run.mjs";
import {installedRelease} from "../marketplace-installed-release.mjs";
import {loadPromptCatalog, digest} from "../marketplace-prompt-catalog.mjs";
import {verifyPackageOwnedBinding, readPublishedFile} from "../marketplace-published-package.mjs";
import {body, selectReviewerContext} from "../marketplace-native-hook.mjs";
import {reviewerDiscoveryDocument} from "../marketplace-reviewer-tools.mjs";
import {validateAppDescribe} from "../../source/platform/bos-app-discovery/scripts/validate-discovery.mjs";
import {validateBoslDocument} from "../../source/platform/bos-workflow-orchestrator/scripts/bosl-authoring.mjs";
import {buildJourneyRegistrationRequest, buildIdentityV2JourneyActionRequest, validateRegistrationResponse,
  validateJourneyEnvelope} from "../../source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs";
import {createNotificationProtocol, parseNotificationSse} from "../../source/platform/bos-workflow-orchestrator/scripts/journey-notifications.mjs";
import {readBoundedJson, syntheticIdentity, sealedResource} from "../verify-notification-transport.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const requireCase = (value, code) => {if (!value) {const error = new Error(code); error.acceptance_code = code; throw error;}};
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const terminal = new Set(["completed", "failed", "expired"]);
const sourceFiles = ["bos-app-discovery/scripts/validate-discovery.mjs", "bos-workflow-orchestrator/scripts/bosl-authoring.mjs",
  "bos-workflow-orchestrator/scripts/journey-runtime-client.mjs", "bos-workflow-orchestrator/scripts/journey-notifications.mjs"];

export function requireClientOnlyFixture(document) {
  requireCase(exact(document, ["identity", "name", "inputs", "entry", "nodes"]) && document.identity === syntheticIdentity &&
    typeof document.name === "string" && document.name.length <= 100 && exact(document.inputs, []) &&
    Array.isArray(document.nodes) && document.nodes.length === 1, "client_only_fixture_required");
  const node = document.nodes[0];
  requireCase(exact(node, ["code", "type", "instruction", "inputs", "outputs", "terminal"]) && node.code === document.entry &&
    node.type === "client" && node.terminal === true && exact(node.inputs, []) && exact(node.outputs, []) &&
    exact(node.instruction, ["goal", "message"]) && typeof node.instruction.goal === "string" &&
    typeof node.instruction.message === "string", "client_only_fixture_required");
}

async function publishedPrerequisite() {
  const release = await installedRelease(await loadPromptCatalog(root, "bos"));
  const configuration = JSON.parse((await readPublishedFile(release.path, release.release_commit, ".mcp.json")).toString("utf8"));
  const binding = configuration.mcpServers?.["BOS-Platform"];
  requireCase(binding?.type === "http" && binding.url === sealedResource && !binding.oauth_resource &&
    Object.keys(configuration.mcpServers).length === 1, "published_sealed_connection_required");
  await verifyPackageOwnedBinding(release.entries, release.plugin_id, binding);
  for (const name of sourceFiles) {
    const published = await readPublishedFile(release.path, release.release_commit, "skills/" + name);
    requireCase(published.equals(await readFile(resolve(root, "source/platform", name))), "published_validator_parity_required");
  }
  return release;
}

export async function runLiveNotificationAcceptance(options, dependencies = {}) {
  const report = {contract: "boc-notification-transport-acceptance/v1", mode: "authenticated_reviewer", status: "INCOMPLETE",
    native_host_wake_proven: false, boc_native_authentication_proven: false,
    checks: {}, limitations: ["Native Muse host wake is unavailable and is outside this transport case.",
      "The deployment tuple is an operator assertion; this case does not attest server image provenance.",
      "The synthetic journey definition remains registered; only its client execution is completed."]};
  let config, document, authority, release, phase = "deployment_tuple_required";
  try {
    requireCase(/^[a-f0-9]{40}$/u.test(options.sourceRevision) && /^[a-z][a-z0-9-]{0,127}$/u.test(options.serverRevision) &&
      /^sha256:[a-f0-9]{64}$/u.test(options.imageDigest), "deployment_tuple_required");
    phase = "reviewer_configuration_unavailable";
    config = (await readBoundedJson(options.configPath)).document;
    phase = "client_only_fixture_unavailable";
    document = (await readBoundedJson(options.boslPath)).document;
    requireClientOnlyFixture(document);
    phase = "configured_synthetic_reviewer_authority_unavailable";
    await (dependencies.verifyReviewer ?? verifyNativeReviewer)(config);
    const authorityFile = await readBoundedJson(config.fixture_authority_file);
    requireCase(authorityFile.sha256 === config.fixture_authority_sha256, "fixture_authority_changed");
    authority = authorityFile.document;
    const binding = authority.effect_bindings?.["notification-transport"];
    requireCase(authority.allowed_effects?.includes("read") && authority.allowed_effects?.includes("write") &&
      exact(binding, ["operation", "effect", "input_sha256"]) && binding.operation === "lead-director.journeys.register" &&
      binding.effect === "write" && binding.input_sha256 === digest(document), "fixture_write_authority_required");
    phase = "published_installed_connection_unavailable";
    release = await (dependencies.publishedPrerequisite ?? publishedPrerequisite)();
  } catch (error) {
    return {...report, reason: error.acceptance_code ?? phase};
  }
  Object.assign(report, {source_revision: options.sourceRevision, server_revision: options.serverRevision, image_digest: options.imageDigest,
    published_client: {version: release.version, release_commit: release.release_commit, package_sha256: release.package_sha256},
    fixture_sha256: digest(document), authority_sha256: config.fixture_authority_sha256});
  const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), 90000);
  const streams = [];
  let session, active = true, requests = 0, state, latest, owned = false, statePath, lifecycleCalls = 0, requestSignal, action;
  const fail = code => requireCase(false, code);
  const budget = () => {if (deadline.signal.aborted || ++requests > 64) fail("acceptance_budget_exhausted");};
  try {
    phase = "isolated_reviewer_login_unavailable";
    session = await (dependencies.openSession ?? openReviewerSession)({reviewerUrl: config.reviewer_login_url, resource: sealedResource,
      fetchImpl: (url, init = {}) => {
        if (!active) return fetch(url, init); // Existing grant revocation keeps its own bounded timeout.
        budget();
        return fetch(url, {...init, signal: AbortSignal.any([init.signal, deadline.signal, requestSignal].filter(Boolean))});
      }});
    const rpc = async (method, params) => {budget(); const value = await session.rpc(method, params); requireCase(!value?.isError, "reviewer_rpc_rejected"); return value;};
    const offered = (await rpc("tools/list")).tools;
    const tool = name => {
      const matches = offered?.filter(row => row.name?.replaceAll("_", ".") === name.replaceAll("_", "."));
      requireCase(matches?.length === 1, "discovered_tool_required"); return matches[0].name;
    };
    const call = (name, args) => rpc("tools/call", {name: tool(name), arguments: args});
    state = {organization: config.review_organization, application: config.review_application,
      installation: config.review_installation, role: config.review_role ?? "Director"};
    const fresh = async () => {
      const identity = body(await call("bos.get.context", {}));
      requireCase(identity?.contract_version === "bos-identity-mcp/v2", "reviewer_identity_required");
      const selected = selectReviewerContext(identity.contexts ?? identity.authorized_contexts ?? [], state);
      requireCase(/^bos_ctx_v2_[a-f0-9]{64}$/u.test(selected?.context_handle) &&
        (!state.handle || state.handle === selected.context_handle), "reviewer_scope_changed");
      state.handle = selected.context_handle;
    };
    phase = "exact_reviewer_scope_unavailable";
    await fresh(); report.checks.exact_reviewer_scope = true;
    phase = "current_discovery_unavailable";
    const scoped = reviewerDiscoveryDocument(await call("bos.list.context.tools", {context_handle: state.handle}), state);
    const matches = [];
    const visit = value => {
      if (!value || typeof value !== "object") return;
      if (value.name === "api.contract.get" && value.inputSchema) matches.push(value);
      for (const child of Object.values(value)) visit(child);
    };
    visit(scoped); requireCase(matches.length === 1, "discovered_contract_getter_required");
    const effect = matches[0]._meta?.["bos/effect"];
    requireCase((effect === "read" || (effect === "resource" && /\.read$/u.test(matches[0]._meta?.["bos/capability"] ?? ""))) &&
      matches[0].annotations?.readOnlyHint !== false && matches[0].annotations?.destructiveHint !== true, "read_only_contract_getter_required");
    const accepts = new Ajv({strict: false, validateFormats: false}).compile(matches[0].inputSchema);
    const contract = async input => {
      requireCase(accepts(input), "contract_query_not_advertised"); await fresh();
      return reviewerDiscoveryDocument(await call("bos.execute", {context_handle: state.handle, tool_name: matches[0].name, arguments: input}), state);
    };
    const listed = await rpc("resources/list");
    requireCase(Array.isArray(listed.resources) && (!listed.context_handle || listed.context_handle === state.handle), "scoped_resources_required");
    const resources = listed.resources.filter(row => {
      try {const uri = new URL(row.uri), handles = uri.searchParams.getAll("context_handle");
        return uri.protocol === "bos:" && (handles.length === 1 ? handles[0] === state.handle : handles.length === 0 && listed.context_handle === state.handle);
      } catch {return false;}
    });
    const read = async uri => {
      requireCase(resources.some(row => row.uri === uri), "advertised_resource_required"); await fresh();
      return reviewerDiscoveryDocument(await rpc("resources/read", {uri}), state, uri);
    };
    const apps = resources.filter(row => row.name === "app.describe" || new URL(row.uri).pathname.endsWith("/app.describe"));
    requireCase(apps.length === 1, "unique_app_describe_required");
    const app = await read(apps[0].uri); validateAppDescribe(app);
    // A schema link in validated, context-bound app.describe is also advertised.
    const schemaUri = new URL(app.bosl.schema_uri), schemaHandles = schemaUri.searchParams.getAll("context_handle");
    requireCase(schemaUri.protocol === "bos:" && (schemaHandles.length === 0 ||
      (schemaHandles.length === 1 && schemaHandles[0] === state.handle)), "schema_scope_invalid");
    if (!resources.some(row => row.uri === app.bosl.schema_uri)) resources.push({uri: app.bosl.schema_uri});
    const registration = await contract(app.journey_registration.contract.input);
    const descriptor = await contract({operation: "journeys.notifications.subscribe"});
    const protocol = createNotificationProtocol(descriptor, [syntheticIdentity]);
    const publishedSchema = await read(app.bosl.schema_uri);
    requireCase(validateBoslDocument(document, {publishedSchema, operationContracts: [], callbackSources: []}).valid, "published_bosl_schema_rejected");
    const request = async value => {
      await fresh(); budget();
      const href = trustedUrl(new URL(value.href, sealedResource).href, new URL(sealedResource).origin).href;
      const response = await session.request(href, {method: value.method, headers: value.headers, body: value.body,
        signal: deadline.signal, redirect: "error"});
      if (response.status < 200 || response.status >= 300 || !/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/iu.test(response.headers.get("content-type") ?? "")) {
        await response.body?.cancel(); fail("journey_http_rejected");
      }
      // Bound JSON state/registration responses independently of server behavior.
      const reader = response.body.getReader(); const chunks = []; let total = 0;
      try {while (true) {const next = await reader.read(); if (next.done) break;
        total += next.value.byteLength; requireCase(total <= 512 * 1024, "journey_response_size_exceeded"); chunks.push(next.value);
      }} finally {await reader.cancel(); reader.releaseLock();}
      return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks)));
    };
    phase = "synthetic_registration_unavailable";
    const registered = validateRegistrationResponse(await request(buildJourneyRegistrationRequest(registration, state.handle, document)));
    requireCase(registered.compiled && registered.identity === syntheticIdentity, "synthetic_registration_required"); owned = true;
    const subscribe = async (selectedProtocol, cursor) => {
      await fresh(); budget();
      const url = trustedUrl(new URL(descriptor.execution.uri, sealedResource).href, new URL(sealedResource).origin);
      requireCase(!url.search, "notification_uri_query_forbidden"); url.searchParams.append("identity", syntheticIdentity);
      const controller = new AbortController();
      const headers = {Accept: "text/event-stream", [descriptor.execution.context_header]: state.handle};
      if (cursor !== undefined) headers[descriptor.execution.response.resume_header] = cursor;
      // The existing session supplies its per-call timeout; its injected fetch also
      // combines this stream-owned cancellation signal without exposing credentials.
      requestSignal = controller.signal;
      let response;
      try {response = await session.request(url.href, {method: "GET", headers,
        signal: AbortSignal.any([deadline.signal, controller.signal]), redirect: "error"});}
      finally {requestSignal = undefined;}
      if (response.status !== 200 || !/^text\/event-stream(?:;|$)/iu.test(response.headers.get("content-type") ?? "")) {
        await response.body?.cancel(); fail("notification_stream_rejected");
      }
      const reader = response.body.getReader(); let bytes = 0, count = 0;
      const chunks = (async function* () {try {while (true) {const next = await reader.read(); if (next.done) return;
        bytes += next.value.byteLength; requireCase(bytes <= 512 * 1024, "notification_stream_size_exceeded"); yield next.value;
      }} finally {try {await reader.cancel();} catch {} reader.releaseLock();}})();
      const iterator = parseNotificationSse(chunks, {maxFrameBytes: selectedProtocol.maxFrameBytes, signal: deadline.signal})[Symbol.asyncIterator]();
      let closed = false;
      const stream = {close: async () => {if (closed) return; closed = true; controller.abort(); await iterator.return();}, next: async () => {
        requireCase(++count <= 8, "notification_frame_budget_exceeded"); const next = await iterator.next();
        requireCase(!next.done, "notification_stream_ended"); return selectedProtocol.accept(next.value);
      }};
      streams.push(stream); return stream;
    };
    phase = "initial_stream_ready_unavailable";
    const first = await subscribe(protocol), ready = await first.next();
    requireCase(ready.event === "ready" && ready.id, "initial_ready_required");
    statePath = new URL(protocol.stateAction(syntheticIdentity).href, sealedResource).pathname;
    action = async (value, payload) => {
      requireCase(++lifecycleCalls <= 8, "lifecycle_budget_exceeded");
      const url = trustedUrl(new URL(value.href, sealedResource).href, new URL(sealedResource).origin);
      requireCase(["start", "complete", "step", "state", "failed"].includes(value.verb) &&
        url.pathname === statePath + (value.verb === "state" ? "" : "/" + value.verb), "foreign_lifecycle_action_rejected");
      const built = payload === undefined ? buildIdentityV2JourneyActionRequest(value, state.handle) : buildIdentityV2JourneyActionRequest(value, state.handle, payload);
      latest = validateJourneyEnvelope(await request(built));
      requireCase(latest.identity === syntheticIdentity, "foreign_journey_response_rejected"); return latest;
    };
    phase = "synthetic_start_unavailable";
    await action(registered.actions.start);
    phase = "committed_change_unavailable";
    const changed = await first.next(); requireCase(changed.event === "journey.changed", "committed_change_required");
    await first.close();
    phase = "cursor_replay_unavailable";
    const replayProtocol = createNotificationProtocol(descriptor, [syntheticIdentity], {resuming: true});
    const replay = await subscribe(replayProtocol, ready.id), resumed = await replay.next(), repeated = await replay.next();
    requireCase(resumed.event === "ready" && repeated.event === "journey.changed" && repeated.id === changed.id &&
      digest(repeated.data) === digest(changed.data), "replay_consistency_required");
    await replay.close();
    phase = "authoritative_state_refetch_unavailable";
    await action(replayProtocol.stateAction(syntheticIdentity));
    requireCase(latest.status === "awaiting_client" && latest.current_step.code === document.entry, "authoritative_client_state_required");
    report.checks = {...report.checks, discovered_descriptor: true, ready: true, committed_change: true, replay_stable: true,
      authoritative_state_refetch: true};
    phase = "client_execution_cleanup_unavailable";
    await action(latest.instruction.after_success, latest.instruction.after_success.payload_schema === null ? undefined : {});
    while (!terminal.has(latest.status)) {
      requireCase(latest.status === "step_completed" && latest.action?.verb === "step", "client_cleanup_continuation_unavailable");
      await action(latest.action);
    }
    requireCase(latest.status === "completed", "client_cleanup_failed");
    report.checks.client_execution_completed = true;
    report.boc_native_authentication_proven = true;
    report.status = "PASS";
  } catch (error) {
    report.status = "INCOMPLETE"; report.reason = deadline.signal.aborted ? "bounded_acceptance_deadline" : error.acceptance_code ?? phase;
  } finally {
    for (const stream of streams) {try {await stream.close();} catch {report.status = "INCOMPLETE"; report.reason = "stream_cleanup_failed";}}
    if (owned && latest?.status === "awaiting_client" && action && !deadline.signal.aborted) {
      try {await action(latest.instruction.on_failure, {code: "user_stopped", message: "The bounded synthetic transport test stopped."});}
      catch {report.status = "INCOMPLETE"; report.cleanup = "returned_failure_action_unavailable";}
    }
    if (owned && !terminal.has(latest?.status)) {
      report.status = "INCOMPLETE"; report.cleanup = "owned_client_execution_requires_returned_action_recovery";
    } else if (owned) report.cleanup = latest.status;
    clearTimeout(timer); active = false;
    if (session) {try {await session.close(); report.checks.reviewer_grant_revoked = true;}
      catch {report.status = "INCOMPLETE"; report.reason = "reviewer_grant_revocation_failed";}}
  }
  report.request_budget_used = requests;
  return report;
}
