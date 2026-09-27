const rawUriPattern = /^(?:[A-Za-z0-9._~!$&'()*+,;=:@{}/?-]|%[0-9A-F]{2})+$/u;
const percentOctetPattern = /%([0-9A-F]{2})/gu;
const asciiUnreservedByte = (byte) =>
  (byte >= 0x41 && byte <= 0x5A) ||
  (byte >= 0x61 && byte <= 0x7A) ||
  (byte >= 0x30 && byte <= 0x39) ||
  new Set([0x2D, 0x2E, 0x5F, 0x7E]).has(byte);
const forbiddenEncodedByte = new Set([0x23, 0x2F, 0x3F, 0x5C, 0x7F]);
const decodedControlPattern = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

export function validateSafeBosExecutionUri(value, label = "execution URI") {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096 ||
      !value.startsWith("/bos/") || value.startsWith("//") || value.includes("//") ||
      !rawUriPattern.test(value)) {
    throw new TypeError(`${label} must be a canonical safe origin-relative /bos/ URI`);
  }

  for (const match of value.matchAll(percentOctetPattern)) {
    const byte = Number.parseInt(match[1], 16);
    if (byte <= 0x1F || forbiddenEncodedByte.has(byte) || asciiUnreservedByte(byte)) {
      throw new TypeError(`${label} must be a canonical safe origin-relative /bos/ URI`);
    }
  }

  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new TypeError(`${label} must be a canonical safe origin-relative /bos/ URI`);
  }
  if (decoded.normalize("NFC") !== decoded || decodedControlPattern.test(decoded) ||
      /[\\#]/u.test(decoded)) {
    throw new TypeError(`${label} must be a canonical safe origin-relative /bos/ URI`);
  }

  const path = decoded.split("?", 1)[0];
  if (!path.startsWith("/bos/") || path.includes("//") ||
      path.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new TypeError(`${label} must be a canonical safe origin-relative /bos/ URI`);
  }
  return value;
}
