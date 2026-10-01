import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const fields = ["resource", "authorization_servers", "scopes_supported", "issuer",
  "authorization_endpoint", "token_endpoint", "registration_endpoint",
  "response_types_supported", "grant_types_supported",
  "token_endpoint_auth_methods_supported", "code_challenge_methods_supported",
  "authorization_response_iss_parameter_supported"];

function publicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Expected a public HTTPS URL without credentials, query, or fragment");
  }
  return url.href;
}

function metadata(value) {
  const result = {};
  for (const key of fields) {
    const item = value?.[key];
    if (["resource", "issuer"].includes(key) || key.endsWith("_endpoint")) {
      if (typeof item === "string") {
        try { result[key] = publicUrl(item); } catch { result[key] = "[invalid public URL]"; }
      }
    } else if (key === "authorization_servers" && Array.isArray(item)) {
      result[key] = item.map(entry => {
        try { return publicUrl(entry); } catch { return "[invalid public URL]"; }
      });
    } else if (Array.isArray(item) && item.every(entry => typeof entry === "string" && /^[\w:./ -]{1,80}$/.test(entry))) {
      result[key] = item;
    } else if (typeof item === "boolean") result[key] = item;
  }
  return result;
}

// No redirects, curl configuration, authorization headers, cookie jar, or raw logs.
export async function curlPublicGet(url) {
  try {
    const { stdout } = await execute("curl", ["--disable", "--silent", "--show-error",
      "--max-time", "20", "--max-filesize", "131072", "--request", "GET",
      "--header", "Accept: application/json", "--include", publicUrl(url)],
    { maxBuffer: 262144, timeout: 22000 });
    let rest = stdout;
    let status;
    let headers;
    do {
      const boundary = rest.indexOf("\r\n\r\n");
      if (boundary < 0) throw new Error("Invalid HTTP response");
      const block = rest.slice(0, boundary).split("\r\n");
      status = Number(block.shift().match(/^HTTP\/\S+ (\d{3})/)?.[1]);
      headers = new Headers();
      for (const line of block) {
        const colon = line.indexOf(":");
        if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
      }
      rest = rest.slice(boundary + 4);
    } while (rest.startsWith("HTTP/"));
    if (!status) throw new Error("Invalid HTTP status");
    let body = null;
    try { body = JSON.parse(rest); } catch { /* Report metadata parse failure below. */ }
    return { status, headers, body };
  } catch (error) {
    const codes = { 5: "proxy_dns", 6: "dns", 7: "connection", 28: "timeout", 35: "tls", 60: "tls_certificate", ENOENT: "curl_unavailable" };
    return { failure: { category: "transport_or_tool", code: codes[error.code] ?? "transport_or_tool_failure" } };
  }
}

export async function probePublicOAuthDiscovery({ resourceUrl, request = curlPublicGet,
  now = () => new Date().toISOString() }) {
  const report = { schema_version: "bos.public-oauth-smoke/v1", observed_at: now(),
    status: "passed", scope: "signed-out public GET discovery only; full login is unverified",
    requests: [], findings: [] };
  const fail = (code, operation, category = "server_contract") => {
    report.findings.push({ code, operation, category });
    report.status = category === "transport_or_tool" ? "blocked" : report.status === "blocked" ? "blocked" : "failed";
  };
  let resource;
  try { resource = publicUrl(resourceUrl); }
  catch { fail("invalid_resource_url", "configuration", "configuration"); return report; }
  report.resource = resource;
  async function get(url, operation) {
    let response;
    try { response = await request(url); }
    catch { response = { failure: { code: "transport_or_tool_failure" } }; }
    const evidence = { operation, url, observed_at: now(), http_status: response.status ?? null, headers: {} };
    report.requests.push(evidence);
    if (response.failure) { fail(response.failure.code, operation, "transport_or_tool"); return null; }
    const headers = response.headers;
    const type = headers.get("content-type");
    if (type) evidence.headers.content_type = type.split(";")[0].trim().slice(0, 80);
    for (const key of ["x-request-id", "x-correlation-id"]) {
      const value = headers.get(key);
      if (value && /^[\w.-]{1,128}$/.test(value)) evidence.headers[key] = value;
    }
    if (operation !== "resource") evidence.metadata = metadata(response.body);
    return { ...response, evidence };
  }
  const challenge = await get(resource, "resource");
  if (!challenge) return report;
  if (challenge.status !== 401) fail("expected_http_401", "resource");
  const header = challenge.headers.get("www-authenticate") ?? "";
  const advertised = header.match(/\bresource_metadata="([^"]+)"/i)?.[1];
  const scope = header.match(/\bscope="([^"]+)"/i)?.[1];
  challenge.evidence.headers.www_authenticate = { scheme: /^Bearer\b/i.test(header) ? "Bearer" : "unknown" };
  if (scope && /^[\w: -]{1,80}$/.test(scope)) challenge.evidence.headers.www_authenticate.scope = scope;
  let prm;
  try {
    prm = publicUrl(advertised);
    if (new URL(prm).origin !== new URL(resource).origin) throw new Error("Unexpected metadata origin");
  } catch { fail("invalid_resource_metadata_challenge", "resource"); return report; }
  challenge.evidence.headers.www_authenticate.resource_metadata = prm;
  if (!/^Bearer\b/i.test(header)) fail("expected_bearer_challenge", "resource");
  const protectedResource = await get(prm, "protected_resource_metadata");
  if (!protectedResource) return report;
  if (protectedResource.status !== 200) { fail("expected_http_200", "protected_resource_metadata"); return report; }
  const data = protectedResource.body;
  if (!data || typeof data !== "object") { fail("invalid_json_metadata", "protected_resource_metadata"); return report; }
  if (data.resource !== resource) fail("resource_mismatch", "protected_resource_metadata");
  let issuer;
  try {
    if (!Array.isArray(data.authorization_servers) || data.authorization_servers.length !== 1) throw new Error("Ambiguous issuer");
    issuer = publicUrl(data.authorization_servers[0]);
    if (new URL(issuer).origin !== new URL(resource).origin) throw new Error("Unexpected BOS issuer");
  } catch { fail("issuer_alignment", "protected_resource_metadata"); return report; }
  const issuerUrl = new URL(issuer);
  const discovery = new URL(`/.well-known/oauth-authorization-server${issuerUrl.pathname === "/" ? "" : issuerUrl.pathname}`, issuerUrl.origin).href;
  const server = await get(discovery, "authorization_server_metadata");
  if (!server) return report;
  if (server.status !== 200) { fail("expected_http_200", "authorization_server_metadata"); return report; }
  if (!server.body || typeof server.body !== "object") fail("invalid_json_metadata", "authorization_server_metadata");
  else {
    if (server.body.issuer !== data.authorization_servers[0]) fail("issuer_mismatch", "authorization_server_metadata");
    if (!Array.isArray(server.body.code_challenge_methods_supported) || !server.body.code_challenge_methods_supported.includes("S256")) fail("pkce_s256_missing", "authorization_server_metadata");
    if (!Array.isArray(server.body.grant_types_supported) || !server.body.grant_types_supported.includes("authorization_code")) fail("authorization_code_missing", "authorization_server_metadata");
    for (const key of ["authorization_endpoint", "token_endpoint"]) {
      try {
        if (new URL(publicUrl(server.body[key])).origin !== issuerUrl.origin) throw new Error("Endpoint mismatch");
      } catch { fail(`${key}_alignment`, "authorization_server_metadata"); }
    }
  }
  return report;
}

export function compareDiscoveryReports(previous, current) {
  if (previous.schema_version !== current.schema_version || previous.resource !== current.resource) {
    throw new Error("Comparison requires matching report schema and resource");
  }
  const snapshot = report => ({ status: report.status, findings: report.findings,
    requests: report.requests.map(({ observed_at, ...entry }) => ({ ...entry,
      headers: Object.fromEntries(Object.entries(entry.headers).filter(([key]) => !["x-request-id", "x-correlation-id"].includes(key))) })) });
  return { changed: JSON.stringify(snapshot(previous)) !== JSON.stringify(snapshot(current)),
    previous_observed_at: previous.observed_at, current_observed_at: current.observed_at };
}
