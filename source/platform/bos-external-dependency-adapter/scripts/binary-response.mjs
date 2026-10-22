import {createHash} from "node:crypto";

const legacyHeaders = ["Content-Disposition", "Content-Length", "Content-Type", "Digest",
  "X-Content-SHA256", "X-Correlation-ID"];
const providerHeaders = ["Content-Disposition", "Content-Length", "Content-Type", "Content-MD5",
  "X-Correlation-ID"];

// This is a transport representation; MIME types and filename extensions are opaque.
export function binaryResponseContract(contact) {
  const response = contact?.execution?.response;
  if (response?.body !== "binary") return null;
  const optionalMd5 = response.integrity === "provider_md5_if_available";
  const expected = optionalMd5 ? providerHeaders : legacyHeaders;
  const keys = optionalMd5 ? ["body", "content_type", "headers", "integrity"] : ["body", "content_type", "headers"];
  if (response.content_type !== "provider" || Object.keys(response).length !== keys.length ||
      Object.keys(response).some(key => !keys.includes(key)) || !Array.isArray(response.headers) ||
      response.headers.length !== expected.length || new Set(response.headers).size !== expected.length ||
      response.headers.some(header => !expected.includes(header))) {
    throw new TypeError("Unsupported described binary response");
  }
  const limits = contact.limits ?? {};
  const maxBytes = limits.maximum_attachment_bytes;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("Described binary operation requires an attachment byte limit");
  }
  if (maxBytes > (optionalMd5 ? 20 : 25) * 1024 * 1024 ||
      (limits.maximum_file_bytes !== undefined && limits.maximum_file_bytes !== maxBytes)) {
    throw new TypeError("Described binary file byte limits are unsupported or disagree");
  }
  const maxDurationSeconds = limits.maximum_duration_seconds;
  if (!Number.isSafeInteger(maxDurationSeconds) || maxDurationSeconds < 1 ||
      maxDurationSeconds > (optionalMd5 ? 120 : 900)) {
    throw new TypeError("Described binary duration limit is unsupported");
  }
  return {maxBytes, maxDurationSeconds, headers: response.headers,
    requiredHeaders: response.headers.filter(header => !optionalMd5 || header !== "Content-MD5"), optionalMd5};
}

export function validateBinaryResponseBody(body, headers, contract) {
  for (const name of contract.requiredHeaders) {
    if (!Object.hasOwn(headers, name.toLowerCase())) throw new TypeError(`Binary response is missing described header ${name}`);
  }
  if (body.byteLength > contract.maxBytes) throw new TypeError("Binary response exceeds the described attachment limit");
  const length = headers["content-length"];
  if ((contract.optionalMd5 && !/^(?:0|[1-9][0-9]*)$/u.test(length)) ||
      !Number.isSafeInteger(Number(length)) || Number(length) !== body.byteLength) {
    throw new TypeError("Binary response Content-Length does not match its body");
  }
  if (contract.optionalMd5 && Object.hasOwn(headers, "content-md5")) {
    const checksum = headers["content-md5"];
    const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) :
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    if (!/^[A-Za-z0-9+/]{22}==$/u.test(checksum) ||
        createHash("md5").update(bytes).digest("base64") !== checksum) {
      throw new TypeError("Binary response Content-MD5 is malformed or does not match its body");
    }
  }
}

// Called inside the authenticated host. Successful declared downloads remain bytes,
// including application/json and text files; non-success responses retain JSON errors.
export async function readDiscoveredHttpResponse(response, contact) {
  const contract = binaryResponseContract(contact);
  const headers = Object.fromEntries(response.headers);
  if (!contract || response.status < 200 || response.status >= 300) {
    return {status: response.status, headers, body: await response.json()};
  }
  let reader;
  let timer;
  let completed = false;
  try {
    for (const name of contract.requiredHeaders) {
      if (!Object.hasOwn(headers, name.toLowerCase())) throw new TypeError(`Binary response is missing described header ${name}`);
    }
    const length = headers["content-length"];
    if (!/^(?:0|[1-9][0-9]*)$/u.test(length) || !Number.isSafeInteger(Number(length))) {
      throw new TypeError("Binary response Content-Length is invalid");
    }
    if (Number(length) > contract.maxBytes) throw new TypeError("Binary response exceeds the described attachment limit");
    const body = new Uint8Array(Number(length));
    let offset = 0;
    if (response.body) {
      reader = response.body.getReader();
      const deadline = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new TypeError("Binary response exceeded its described duration limit")), contract.maxDurationSeconds * 1000);
      });
      for (;;) {
        const {done, value} = await Promise.race([reader.read(), deadline]);
        if (done) break;
        if (!(value instanceof Uint8Array) || value.byteLength > body.length - offset) {
          throw new TypeError("Binary response exceeds its described length or attachment limit");
        }
        body.set(value, offset);
        offset += value.byteLength;
      }
    }
    if (offset !== body.length) throw new TypeError("Binary response Content-Length does not match its body");
    validateBinaryResponseBody(body, headers, contract);
    completed = true;
    return {status: response.status, headers, body};
  } finally {
    clearTimeout(timer);
    if (!completed) {
      try { void Promise.resolve(reader ? reader.cancel() : response.body?.cancel()).catch(() => {}); } catch {}
    }
    try { reader?.releaseLock(); } catch {}
  }
}
