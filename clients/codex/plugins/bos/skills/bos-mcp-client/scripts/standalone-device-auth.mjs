// Opt-in trusted-runtime transport. OAuth material never enters skill envelopes.
export const BOS_RESOURCE = "https://dfsm.ai/mcp/apps/bos/platform";
export const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const ISSUER = "https://dfsm.ai";
const SCOPE = "mcp:tools offline_access";
const METADATA = `${ISSUER}/.well-known/oauth-protected-resource/mcp/apps/bos/platform`;
const AUTH_METADATA = `${ISSUER}/.well-known/oauth-authorization-server`;
const DEVICE_ENDPOINT = `${ISSUER}/api/v1/mcp/oauth/device/authorize`;
const VERIFY_URI = `${ISSUER}/api/v1/mcp/oauth/device`;
const AUTH_ENDPOINT = `${ISSUER}/api/v1/mcp/oauth/authorize`;
const prohibitedHeaders = new Set(["authorization", "proxy-authorization", "cookie", "host",
  "forwarded", "origin", "referer", "x-original-url", "x-rewrite-url", "x-real-ip",
  "connection", "proxy-connection", "keep-alive", "transfer-encoding", "content-length",
  "te", "trailer", "upgrade", "proxy-authenticate"]);
const errorCodes = new Set(["authorization_pending", "slow_down", "access_denied", "expired_token",
  "invalid_grant", "invalid_request", "invalid_scope", "invalid_client", "invalid_target", "rate_limited", "unauthorized_client"]);

export class BosDeviceAuthError extends Error {
  constructor(code) {
    super(`BOS standalone authentication: ${code}`);
    this.name = "BosDeviceAuthError";
    this.code = code;
  }
}
const fail = (code) => { throw new BosDeviceAuthError(code); };
const scalar = (value, max = 8192) => typeof value === "string" && value.length > 0 &&
  value.length <= max && !/[\s\x00-\x1f\x7f]/.test(value);
function endpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.origin === ISSUER && !url.username &&
        !url.password && !url.search && !url.hash) return url.href;
  } catch { /* Fail without echoing server-controlled input. */ }
  fail("invalid_metadata");
}
const defaultSleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new BosDeviceAuthError("cancelled")); return; }
  const done = () => { signal?.removeEventListener("abort", abort); resolve(); };
  const timer = setTimeout(done, ms);
  const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort);
    reject(new BosDeviceAuthError("cancelled")); };
  signal?.addEventListener("abort", abort, {once: true});
});

export function createStandaloneBosTransport({credentialStore, presentVerification,
  fetchImpl = fetch, sleep = defaultSleep, now = Date.now, signal} = {}) {
  for (const method of ["load", "save", "delete"]) {
    if (typeof credentialStore?.[method] !== "function") fail("secure_store_required");
  }
  if (typeof presentVerification !== "function") fail("verification_surface_required");
  let record = null;
  let loaded = false;
  let metadata = null;
  let authentication = null;
  let refreshing = null;
  const responseSignals = new WeakMap();
  const check = () => { if (signal?.aborted) fail("cancelled"); };
  const store = async (method, value) => {
    try { return await credentialStore[method](BOS_RESOURCE, value); }
    catch { fail("secure_store_unavailable"); }
  };
  const load = async () => {
    if (loaded) return;
    const value = await store("load");
    if (value != null) {
      if (value.resource !== BOS_RESOURCE || value.issuer !== ISSUER ||
          !scalar(value.client_id, 512) ||
          (value.access_token !== undefined && (!scalar(value.access_token) ||
            !Number.isFinite(value.expires_at) || !scalar(value.refresh_token))) ||
          (value.refresh_token !== undefined && !scalar(value.refresh_token))) {
        fail("invalid_secure_record");
      }
      record = {...value};
    }
    loaded = true;
  };
  const save = async (value) => { await store("save", value); record = value; loaded = true; };
  const clearGrant = async () => {
    const client = record?.client_id;
    await store("delete");
    record = null;
    if (client) await save({resource: BOS_RESOURCE, issuer: ISSUER, client_id: client});
  };
  const http = async (url, init) => {
    check();
    try {
      const timeout = AbortSignal.timeout(15000);
      const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const response = await fetchImpl(url, {...init, redirect: "manual", credentials: "omit",
        referrerPolicy: "no-referrer", signal: requestSignal});
      responseSignals.set(response, requestSignal);
      return response;
    }
    catch { check(); fail("transport_unavailable"); }
  };
  const json = async (response) => {
    try {
      const value = await response.json();
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch { /* Never retain a raw response or transport error. */ }
    fail("invalid_response");
  };
  const oauthPost = async (url, parameters) => {
    const response = await http(url, {method: "POST", headers: {
      accept: "application/json", "content-type": "application/x-www-form-urlencoded"
    }, body: new URLSearchParams(parameters).toString()});
    const body = await json(response);
    if (response.status === 200) return body;
    const code = errorCodes.has(body.error) ? body.error : "oauth_error";
    if (![400, 429].includes(response.status) || (code === "rate_limited" && response.status !== 429)) fail("oauth_error");
    fail(code);
  };
  const discover = async ({deviceRequired = true} = {}) => {
    const response = await http(BOS_RESOURCE, {method: "GET", headers: {accept: "application/json"}});
    if (response.status !== 401 || response.headers.get("www-authenticate") !==
        `Bearer resource_metadata="${METADATA}", scope="mcp:tools"`) fail("invalid_resource_challenge");
    const protectedResponse = await http(METADATA, {headers: {accept: "application/json"}});
    if (protectedResponse.status !== 200) fail("invalid_metadata");
    const protectedMetadata = await json(protectedResponse);
    if (protectedMetadata.resource !== BOS_RESOURCE ||
        JSON.stringify(protectedMetadata.authorization_servers) !== JSON.stringify([ISSUER])) fail("invalid_metadata");
    const authResponse = await http(AUTH_METADATA, {headers: {accept: "application/json"}});
    if (authResponse.status !== 200) fail("invalid_metadata");
    const value = await json(authResponse);
    if (value.issuer !== ISSUER || value.authorization_endpoint !== AUTH_ENDPOINT) fail("invalid_metadata");
    if (deviceRequired && (!Array.isArray(value.grant_types_supported) || !value.grant_types_supported.includes(DEVICE_GRANT) ||
        !value.device_authorization_endpoint)) fail("device_flow_unavailable");
    if ((deviceRequired && endpoint(value.device_authorization_endpoint) !== DEVICE_ENDPOINT) ||
        !Array.isArray(value.grant_types_supported) || !value.grant_types_supported.includes("refresh_token") ||
        (!Array.isArray(value.token_endpoint_auth_methods_supported) || !value.token_endpoint_auth_methods_supported.includes("none"))) fail("invalid_metadata");
    metadata = {device: DEVICE_ENDPOINT, token: endpoint(value.token_endpoint),
      registration: endpoint(value.registration_endpoint)};
    return metadata;
  };
  const register = async () => {
    if (record?.client_id) return;
    const response = await http(metadata.registration, {method: "POST", headers: {
      accept: "application/json", "content-type": "application/json"
    }, body: JSON.stringify({client_name: "BOS standalone device client", application_type: "native",
      token_endpoint_auth_method: "none", grant_types: [DEVICE_GRANT, "refresh_token"],
      response_types: [], redirect_uris: []})});
    const value = await json(response);
    if (response.status !== 201 || !scalar(value.client_id, 512) || value.client_secret !== undefined ||
        value.token_endpoint_auth_method !== "none" ||
        JSON.stringify(value.grant_types) !== JSON.stringify([DEVICE_GRANT, "refresh_token"]) ||
        JSON.stringify(value.response_types) !== "[]" || JSON.stringify(value.redirect_uris) !== "[]") fail("invalid_registration");
    await save({resource: BOS_RESOURCE, issuer: ISSUER, client_id: value.client_id});
  };
  const acceptTokens = async (value) => {
    const scopes = typeof value.scope === "string" ? value.scope.split(/\s+/).filter(Boolean) : [];
    if (value.token_type?.toLowerCase() !== "bearer" || !scalar(value.access_token) ||
        !scalar(value.refresh_token) || !Number.isFinite(value.expires_in) || value.expires_in <= 0 ||
        value.expires_in > 86400 || !scopes.includes("mcp:tools") ||
        scopes.some(scope => !SCOPE.split(" ").includes(scope))) fail("invalid_token_response");
    await save({resource: BOS_RESOURCE, issuer: ISSUER, client_id: record.client_id,
      access_token: value.access_token, refresh_token: value.refresh_token,
      expires_at: now() + value.expires_in * 1000});
  };
  const authenticate = async () => {
    await load();
    await discover();
    await register();
    const device = await oauthPost(metadata.device, {client_id: record.client_id,
      resource: BOS_RESOURCE, scope: SCOPE});
    if (!scalar(device.device_code) || typeof device.user_code !== "string" ||
        !/^[A-Za-z0-9 -]{4,128}$/.test(device.user_code) || device.verification_uri !== VERIFY_URI ||
        !Number.isFinite(device.expires_in) || device.expires_in <= 0 || device.expires_in > 600 ||
        (device.interval !== undefined && (!Number.isFinite(device.interval) || device.interval < 5 || device.interval > 600))) fail("invalid_device_response");
    const deadline = now() + device.expires_in * 1000;
    let interval = (device.interval ?? 5) * 1000;
    let presented;
    try { presented = await presentVerification(Object.freeze({verification_uri: VERIFY_URI,
      user_code: device.user_code, expires_in: device.expires_in})); }
    catch { fail("verification_surface_unavailable"); }
    if (presented !== true) fail("cancelled");
    while (now() < deadline) {
      check();
      await sleep(Math.min(interval, deadline - now()), signal);
      check();
      if (now() >= deadline) fail("expired_token");
      try {
        const tokens = await oauthPost(metadata.token, {grant_type: DEVICE_GRANT,
          client_id: record.client_id, device_code: device.device_code, resource: BOS_RESOURCE});
        await acceptTokens(tokens);
        return;
      } catch (error) {
        if (!(error instanceof BosDeviceAuthError)) fail("oauth_error");
        if (error.code === "authorization_pending") continue;
        if (error.code === "slow_down") { interval += 5000; continue; }
        if (["transport_unavailable", "rate_limited"].includes(error.code)) { interval = Math.min(interval * 2, 600000); continue; }
        throw error;
      }
    }
    fail("expired_token");
  };
  const recoverAuthentication = async (message) => {
    if (!message || message.schema_version !== "bos.authentication-handoff/v1" ||
        message.message_type !== "request" || message.protected_resource !== BOS_RESOURCE ||
        !message.condition || !["authentication", "mcp_session"].includes(message.condition.category) ||
        !scalar(message.condition.code, 128) || !["protected_resource", "bos_platform", "client_host"].includes(message.condition.source) ||
        Object.keys(message.condition).some(key => !["category", "code", "source"].includes(key)) ||
        Object.keys(message).some(key => !["schema_version", "message_type", "protected_resource", "condition", "host_correlation"].includes(key)) ||
        (message.host_correlation !== undefined && !scalar(message.host_correlation, 512))) fail("invalid_handoff");
    if (!authentication) authentication = authenticate().finally(() => { authentication = null; });
    await authentication;
    return {schema_version: "bos.authentication-handoff/v1", message_type: "result",
      protected_resource: BOS_RESOURCE, status: "READY",
      ...(message.host_correlation === undefined ? {} : {host_correlation: message.host_correlation})};
  };
  const validAccess = async () => {
    await load();
    if (!record?.access_token) fail("sign_in_required");
    if (record.expires_at > now() + 5000) return record.access_token;
    if (!refreshing) refreshing = (async () => {
      await discover({deviceRequired: false});
      try {
        await acceptTokens(await oauthPost(metadata.token, {grant_type: "refresh_token",
          refresh_token: record.refresh_token, client_id: record.client_id, resource: BOS_RESOURCE}));
      } catch (error) {
        if (error instanceof BosDeviceAuthError && ["invalid_grant", "invalid_client", "unauthorized_client"].includes(error.code)) await clearGrant();
        throw error;
      }
    })().finally(() => { refreshing = null; });
    await refreshing;
    return record.access_token;
  };
  const readSse = async (response, expectedId) => {
    if (!response.body?.getReader) fail("invalid_response");
    const reader = response.body.getReader();
    const requestSignal = responseSignals.get(response);
    const decoder = new TextDecoder();
    let total = 0, buffer = "", data = [];
    const frame = () => {
      if (!data.length) return null;
      let value;
      try { value = JSON.parse(data.join("\n")); } catch { fail("invalid_response"); }
      data = [];
      if (value?.jsonrpc === "2.0" && value.id === expectedId &&
          Object.hasOwn(value, "result") !== Object.hasOwn(value, "error")) return value;
      return null;
    };
    const lines = (final = false) => {
      while (true) {
        const match = /[\r\n]/.exec(buffer);
        if (!match || (buffer[match.index] === "\r" && match.index === buffer.length - 1 && !final)) return null;
        const line = buffer.slice(0, match.index);
        const length = buffer[match.index] === "\r" && buffer[match.index + 1] === "\n" ? 2 : 1;
        buffer = buffer.slice(match.index + length);
        if (line === "") { const value = frame(); if (value !== null) return value; }
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
    };
    const read = async () => {
      if (requestSignal?.aborted) fail(signal?.aborted ? "cancelled" : "transport_unavailable");
      let abort;
      const cancelled = new Promise((_, reject) => {
        abort = () => reject(new BosDeviceAuthError(signal?.aborted ? "cancelled" : "transport_unavailable"));
        requestSignal?.addEventListener("abort", abort, {once: true});
      });
      try { return await Promise.race([reader.read(), cancelled]); }
      finally { requestSignal?.removeEventListener("abort", abort); }
    };
    try {
      while (true) {
        const chunk = await read();
        if (chunk.done) {
          buffer += decoder.decode();
          const value = lines(true);
          if (value !== null) return value;
          fail("invalid_response");
        }
        total += chunk.value.byteLength;
        if (total > 8388608) fail("invalid_response");
        buffer += decoder.decode(chunk.value, {stream: true});
        const value = lines();
        if (value !== null) return value;
      }
    } catch (error) {
      if (error instanceof BosDeviceAuthError) throw error;
      fail("invalid_response");
    } finally {
      // Matching responses finish promptly even when the server keeps SSE open.
      void reader.cancel().catch(() => {});
    }
  };
  const request = async (request) => {
    check();
    let url, route;
    try {
      url = new URL(request.href, ISSUER);
      // Match the router's one transport decode; forward the original safe URI.
      route = new URL(decodeURIComponent(url.pathname), ISSUER);
    } catch { fail("invalid_request_target"); }
    if (route.origin !== ISSUER || route.search || route.hash || url.origin !== ISSUER || url.username || url.password || url.hash ||
        typeof request.href !== "string" || !request.href.startsWith("/") || request.href.startsWith("//") ||
        route.pathname.startsWith("/api/v1/oauth") || route.pathname.startsWith("/api/v1/mcp/oauth") ||
        !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(request.method)) fail("invalid_request_target");
    let headers;
    try { headers = new Headers(request.headers); } catch { fail("invalid_request_headers"); }
    if ([...headers.keys()].some(name => prohibitedHeaders.has(name) || name.startsWith("x-forwarded-"))) fail("caller_credentials_forbidden");
    headers.set("authorization", `Bearer ${await validAccess()}`);
    const response = await http(url.href, {method: request.method, headers,
      ...(request.body === undefined ? {} : {body: typeof request.body === "string" ? request.body : JSON.stringify(request.body)})});
    if (response.status === 401) await clearGrant();
    const safeHeaders = {};
    for (const name of ["content-type", "content-length", "content-disposition", "mcp-session-id", "www-authenticate", "retry-after"]) {
      const value = response.headers.get(name);
      if (value !== null && (name !== "www-authenticate" || value === `Bearer resource_metadata="${METADATA}", scope="mcp:tools"`)) safeHeaders[name] = value;
    }
    const contentType = response.headers.get("content-type") ?? "";
    let body;
    if (contentType.includes("application/json")) body = await json(response);
    else if (contentType.includes("text/event-stream")) {
      let rpc;
      try { rpc = typeof request.body === "string" ? JSON.parse(request.body) : request.body; }
      catch { fail("invalid_response"); }
      if (rpc?.jsonrpc !== "2.0" || !(typeof rpc.id === "string" || Number.isSafeInteger(rpc.id))) fail("invalid_response");
      body = await readSse(response, rpc.id);
    } else if (response.status === 204 || response.status === 202) body = null;
    else if (contentType.startsWith("image/")) {
      try { body = new Uint8Array(await response.arrayBuffer()); } catch { fail("invalid_response"); }
      if (body.byteLength > 8388608) fail("invalid_response");
    } else fail("invalid_response");
    return {status: response.status, headers: safeHeaders, body};
  };
  return Object.freeze({getProtectedResource: () => BOS_RESOURCE, recoverAuthentication, request});
}
