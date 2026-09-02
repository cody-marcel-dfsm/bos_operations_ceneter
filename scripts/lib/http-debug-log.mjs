const secretKeyPattern = /(?:authorization|cookie|set-cookie|www-authenticate|proxy-authenticate|token|secret|password|passwd|code|state|verifier|challenge|assertion|credential|session|account[-_]?id|organization[-_]?id|owners?)/i;
const safeUrlParameterNames = new Set(["resource"]);
const maximumBodyCharacters = 16_384;
const maximumProtocolPayloadCharacters = 4_096;
const maximumErrorCharacters = 4_096;

function redactScalar(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(
      /(\b(?:authorization|proxy[-_ ]?authorization|cookie|set[-_ ]?cookie)\b\s*[:=]\s*)[\s\S]*/i,
      "$1[REDACTED]"
    )
    .replace(/\b(Basic|Bearer|Digest)\s+[\s\S]*/i, "$1 [REDACTED]")
    .replace(/([?&](?:access_token|refresh_token|id_token|code|state|code_verifier|code_challenge|client_secret|account_id|organization_id)=)[^&#\s]*/gi, "$1[REDACTED]")
    .replace(/(\b(?:(?:chatgpt[-_ ]?)?account[-_ ]?id|organization[-_ ]?id|authorization|cookie|set[-_ ]?cookie|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|client[-_ ]?secret|token|secret|password|passwd|code|state|verifier|challenge|assertion|credential|session)\b\s*[:=]\s*)[^\s,;}&]+/gi, "$1[REDACTED]")
    .replace(/("(?:access_token|refresh_token|id_token|token|secret|password|code|state|code_verifier|code_challenge|account_id|organization_id)"\s*:\s*")[^"]*(")/gi, "$1[REDACTED]$2");
}

function redactValue(value, key = "") {
  if (secretKeyPattern.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactValue(childValue, childKey)
      ])
    );
  }
  return redactScalar(value);
}

export function redactDebugValue(value) {
  return redactValue(value);
}

export function sanitizeDebugError(error) {
  const sanitized = new Error(
    String(redactScalar(error?.message ?? String(error)))
      .slice(0, maximumErrorCharacters)
  );
  sanitized.name = String(redactScalar(error?.name ?? "Error")).slice(0, 256);
  return sanitized;
}

export function createProtocolDebugLogger({
  enabled = process.env.BOS_HTTP_DEBUG !== "0",
  writer = (line) => process.stderr.write(`${line}\n`),
  source = "bos-protocol"
} = {}) {
  let requestSequence = 0;
  return {
    nextRequestId() {
      return `${source}-${++requestSequence}`;
    },
    write(entry) {
      if (!enabled) return;
      const redacted = redactValue(entry);
      const event = {
        timestamp: new Date().toISOString(),
        source,
        ...redacted
      };
      const serialized = JSON.stringify(event);
      if (serialized.length <= maximumProtocolPayloadCharacters) {
        writer(serialized);
        return;
      }
      const bounded = {
        timestamp: event.timestamp,
        source: String(event.source).slice(0, 256),
        ...Object.fromEntries(
          ["event", "request_id", "protocol_id", "method", "duration_ms", "ok"]
            .filter((key) => event[key] !== undefined)
            .map((key) => [
              key,
              typeof event[key] === "string"
                ? event[key].slice(0, 256)
                : event[key]
            ])
        ),
        payload: {
          truncated: true,
          original_characters: serialized.length
        }
      };
      writer(JSON.stringify(bounded));
    }
  };
}

export function redactDebugUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    for (const name of [...url.searchParams.keys()]) {
      if (!safeUrlParameterNames.has(name)) {
        url.searchParams.set(name, "[REDACTED]");
      }
    }
    return url.href;
  } catch {
    return redactScalar(String(rawUrl));
  }
}

function redactHeaders(headers) {
  if (!headers) return {};
  const entries = headers instanceof Headers
    ? [...headers.entries()]
    : Array.isArray(headers)
      ? headers
      : Object.entries(headers);
  return Object.fromEntries(entries.map(([name, value]) => [
    name.toLowerCase(),
    secretKeyPattern.test(name) ? "[REDACTED]" : redactScalar(String(value))
  ]));
}

function redactBody(body, contentType = "") {
  if (body == null) return null;
  const text = typeof body === "string" ? body : String(body);
  const structuredContent = !contentType ||
    /^(?:application\/(?:json|[^;]+\+json))(?:;|$)/i.test(contentType);
  try {
    const redacted = redactValue(JSON.parse(text));
    const serialized = JSON.stringify(redacted);
    if (serialized.length > maximumBodyCharacters) {
      return {
        value: serialized.slice(0, maximumBodyCharacters),
        truncated: true,
        original_characters: text.length
      };
    }
    return {
      value: redacted,
      truncated: false
    };
  } catch {
    if (structuredContent) {
      return {
        value: "[REDACTED_UNPARSEABLE_STRUCTURED_BODY]",
        content_type: contentType || null,
        original_characters: text.length,
        truncated: text.length > maximumBodyCharacters
      };
    }
    if (contentType &&
        !/^(?:application\/(?:json|[^;]+\+json)|text\/(?:event-stream|plain))(?:;|$)/i
          .test(contentType)) {
      return {
        value: "[REDACTED_NON_STRUCTURED_BODY]",
        content_type: contentType,
        original_characters: text.length,
        truncated: false
      };
    }
    const redacted = redactScalar(text);
    return {
      value: redacted.slice(0, maximumBodyCharacters),
      truncated: redacted.length > maximumBodyCharacters,
      original_characters: text.length
    };
  }
}

async function responseBody(response) {
  try {
    return await response.clone().text();
  } catch (error) {
    return `[unavailable: ${error.message}]`;
  }
}

export function createHttpDebugFetch(fetchImpl = fetch, {
  enabled = process.env.BOS_HTTP_DEBUG !== "0",
  writer = (line) => process.stderr.write(`${line}\n`),
  source = "bos-contract",
  includeHeaders = true,
  includeBodies = true
} = {}) {
  let requestSequence = 0;
  const write = (entry) => {
    if (!enabled) return;
    writer(JSON.stringify({
      timestamp: new Date().toISOString(),
      source,
      ...entry
    }));
  };

  return async function debugFetch(url, init = {}) {
    const requestId = `${source}-${++requestSequence}`;
    const startedAt = Date.now();
    write({
      event: "http.request",
      request_id: requestId,
      method: (init.method ?? "GET").toUpperCase(),
      url: redactDebugUrl(url),
      headers: includeHeaders ? redactHeaders(init.headers) : "[OMITTED_BY_POLICY]",
      body: includeBodies
        ? redactBody(
          init.body,
          new Headers(init.headers).get("content-type") ?? ""
        )
        : "[OMITTED_BY_POLICY]"
    });

    try {
      const response = await fetchImpl(url, init);
      write({
        event: "http.response",
        request_id: requestId,
        duration_ms: Date.now() - startedAt,
        status: response.status,
        headers: includeHeaders
          ? redactHeaders(response.headers)
          : "[OMITTED_BY_POLICY]",
        body: includeBodies
          ? redactBody(
            await responseBody(response),
            response.headers.get("content-type") ?? ""
          )
          : "[OMITTED_BY_POLICY]"
      });
      return response;
    } catch (error) {
      const sanitizedError = sanitizeDebugError(error);
      write({
        event: "http.error",
        request_id: requestId,
        duration_ms: Date.now() - startedAt,
        error: {
          name: sanitizedError.name,
          message: sanitizedError.message
        }
      });
      throw sanitizedError;
    }
  };
}
