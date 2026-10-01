// Host callbacks use the existing authenticated BOS connection. No credentials
// or authority selectors enter this helper, and it never starts authentication.
export function canonicalSignedOut(error, resourceMetadataUrl) {
  const challenge = error?.headers?.["www-authenticate"]
    ?? error?.headers?.["WWW-Authenticate"];
  return error?.status === 401 && typeof resourceMetadataUrl === "string"
    && typeof challenge === "string" && /^Bearer\s/iu.test(challenge)
    && challenge.match(/\bresource_metadata="([^"]+)"/u)?.[1] === resourceMetadataUrl;
}

export function logoutReceipt(result) {
  const receipt = result?.structuredContent;
  return result?.isError !== true && receipt?.status === "signed_out"
    && receipt?.scope === "current_connection"
    && Object.keys(receipt).sort().join(",") === "scope,status";
}

export async function signOutCurrentConnection({
  listTools, callTool, discardAuthorityReuse, invalidateAuthorityCache,
  resourceMetadataUrl,
}) {
  let status;
  try {
    const tools = await listTools();
    const descriptor = tools.find((tool) => tool.name === "bos_logout");
    if (!descriptor) return { status: "unsupported", terminal: true };
    const schema = descriptor.inputSchema;
    if (schema?.type !== "object" || schema.additionalProperties !== false
      || !schema.properties || Object.keys(schema.properties).length
      || (schema.required ?? []).length) {
      return { status: "unsupported", terminal: true };
    }
    const result = await callTool({ name: descriptor.name, arguments: {} });
    status = logoutReceipt(result) ? "signed_out" : "unconfirmed";
  } catch (error) {
    status = canonicalSignedOut(error, resourceMetadataUrl) ? "signed_out" : "unconfirmed";
  }
  // The callbacks retain the authority captured before revocation, and never
  // touch another authority, saved preferences, or host credential storage.
  let reuseDiscarded = false;
  let cacheCleanup = "unavailable";
  try {
    await discardAuthorityReuse();
    reuseDiscarded = true;
  } catch { /* The caller must report cleanup limitations. */ }
  if (invalidateAuthorityCache) {
    try {
      await invalidateAuthorityCache();
      cacheCleanup = "complete";
    } catch { cacheCleanup = "failed"; }
  }
  return { status, terminal: true, reuseDiscarded, cacheCleanup };
}
