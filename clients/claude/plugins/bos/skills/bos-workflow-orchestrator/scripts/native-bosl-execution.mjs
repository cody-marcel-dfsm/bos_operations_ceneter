import Ajv2020 from "./vendor/ajv2020.bundle.mjs";
import {buildJourneyRegistrationRequest, validateActionEnvelope, validatePayload} from "./journey-runtime-client.mjs";
import {unwrapNativeRead, validateCurrentContext} from "./native-callback-contract.mjs";

// Owner-directed native BOSL execution exception (2026-11-19). These exact
// tools run only when freshly advertised for the selected context and the host
// lacks authenticated HTTPS; HTTPS stays the default.
export const NATIVE_BOSL_TOOLS = Object.freeze({
  register: "lead-director.journeys.register",
  action: "lead-director.journeys.action",
  graphExport: "bos.graph_export.read"
});
const NAMES = new Set(Object.values(NATIVE_BOSL_TOOLS));
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const bytes = value => Buffer.byteLength(JSON.stringify(value));

// Authority selectors and credentials never travel in business arguments.
const AUTHORITY_KEYS = new Set(["contexthandle", "organizationid", "applicationid", "installationid",
  "roleid", "rolecode", "token", "accesstoken", "authorization", "apikey", "credential", "credentials"]);

function carriesAuthority(value, handle) {
  if (typeof value === "string") return value.includes(handle);
  if (Array.isArray(value)) return value.some(item => carriesAuthority(item, handle));
  if (object(value)) {
    return Object.entries(value).some(([key, item]) =>
      AUTHORITY_KEYS.has(key.toLowerCase().replace(/[^a-z]/gu, "")) || carriesAuthority(item, handle));
  }
  return false;
}

export function createNativeBoslExecution({context, catalog}) {
  validateCurrentContext(context);
  const data = catalog?.structuredContent;
  if (catalog?.isError !== false || !object(data) || data.contract_version !== "bos-identity-mcp/v2" ||
      data.context_handle !== context.context_handle || !Array.isArray(data.tools) || bytes(data) > 2 * 1024 * 1024) {
    throw new Error("Use the fresh structured context-tool catalog bound to the selected handle.");
  }
  const ajv = new Ajv2020({strict: false, validateFormats: false});
  const descriptors = new Map();
  for (const name of NAMES) {
    const matches = data.tools.filter(item => item?.name === name);
    if (matches.length === 0) continue;
    if (matches.length !== 1 || !object(matches[0].inputSchema) || bytes(matches[0]) > 512 * 1024) {
      throw new Error(`Native ${name} descriptor is ambiguous or malformed.`);
    }
    descriptors.set(name, ajv.compile(structuredClone(matches[0].inputSchema)));
  }
  const call = (name, arguments_) => {
    const validate = descriptors.get(name);
    if (!validate) {
      const error = new Error(`host_capability_unavailable: ${name} is not freshly advertised and the host lacks authenticated HTTPS.`);
      error.code = "host_capability_unavailable";
      throw error;
    }
    if (carriesAuthority(arguments_, context.context_handle)) {
      throw new Error("Native BOSL arguments must not carry the context handle, a credential or any authority selector.");
    }
    if (!validate(arguments_)) throw new Error(`Native ${name} arguments violate its current descriptor.`);
    return Object.freeze({tool_name: name, context_handle: context.context_handle, arguments: arguments_});
  };
  return Object.freeze({
    available: name => descriptors.has(name),
    // The discovered registration contract validates the document exactly as
    // for HTTPS. The local-only registrationRequest binds the unchanged
    // submission for interpretJourneyResponse review; it is never sent.
    register(contract, document) {
      if (!object(document)) throw new Error("Native registration requires the complete raw BOSL document.");
      const registrationRequest = buildJourneyRegistrationRequest(contract, context.context_handle, document);
      const native = call(NATIVE_BOSL_TOOLS.register, {document: JSON.parse(registrationRequest.body)});
      return Object.freeze({...native, registrationRequest});
    },
    action(action, ...payload) {
      validateActionEnvelope(action, {lifecycleOnly: true});
      if (action.payload_schema === null) {
        if (payload.length) throw new Error("action without a payload schema must not include a caller payload");
        return call(NATIVE_BOSL_TOOLS.action, {href: action.href});
      }
      if (!payload.length) throw new Error("action requires a body declared by payload_schema");
      // The same validator as HTTPS, including date-time formats.
      validatePayload(payload[0], action.payload_schema);
      return call(NATIVE_BOSL_TOOLS.action, {href: action.href, payload: structuredClone(payload[0])});
    },
    graphExport: () => call(NATIVE_BOSL_TOOLS.graphExport, {}),
    // Returns {http_status, body, headers} for interpretJourneyResponse.
    unwrap(envelope) {
      const {isError, result} = unwrapNativeRead(envelope, context);
      if (!object(result) || !Number.isInteger(result.http_status) ||
          result.ttlMs !== 0 || result.cacheScope !== "private") {
        throw new Error("Native BOSL result must carry an integer http_status and private uncached scope.");
      }
      if (Object.hasOwn(result, "error")) {
        if (!object(result.error)) throw new Error("Native BOSL refusal must carry a public error object.");
        return {http_status: result.http_status, body: {error: result.error}, headers: object(result.headers) ? result.headers : {}};
      }
      // An MCP error envelope keeps its failure disposition: only a structured
      // refusal is surfaced, and a success-shaped body is never accepted.
      if (isError) throw new Error("Native BOSL tool reported an MCP error without a structured refusal.");
      if (!Object.hasOwn(result, "body")) throw new Error("Native BOSL result requires a body or error.");
      return {http_status: result.http_status, body: result.body, headers: object(result.headers) ? result.headers : {}};
    }
  });
}
