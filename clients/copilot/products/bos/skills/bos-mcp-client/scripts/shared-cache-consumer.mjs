export const sharedCacheConsumerVersion = "bos.shared-cache-consumer/v1";

const consumerMethods = Object.freeze([
  "begin",
  "commit",
  "abort",
  "read",
  "inspect",
  "invalidateExact",
  "invalidateDataset",
  "invalidateSource",
  "invalidateCurrentAuthority"
]);

// The installed BOS host injects the ready consumer. This public helper only
// validates and narrows that injected object; it has no authority, cache-root,
// binding-provider, or consumer-construction input.
export function acceptBosSharedCacheConsumer(consumer) {
  if (!consumer || typeof consumer !== "object" || Array.isArray(consumer)) {
    throw new TypeError("A BOS-injected shared-cache consumer is required");
  }
  for (const method of consumerMethods) {
    if (typeof consumer[method] !== "function") {
      throw new TypeError(`BOS shared-cache consumer.${method} is required`);
    }
  }
  return Object.freeze(Object.fromEntries(consumerMethods.map((method) => [
    method,
    (request) => consumer[method](request)
  ])));
}

export function formatSharedCacheFreshness(result, {
  locale,
  timeZone,
  now = new Date()
} = {}) {
  const updated = result?.sync_completed_at ? new Date(result.sync_completed_at) : null;
  const valid = updated && !Number.isNaN(updated.valueOf());
  const ageSeconds = valid
    ? Math.max(0, Math.floor((new Date(now).valueOf() - updated.valueOf()) / 1000))
    : null;
  return {
    origin: result?.origin === "cache" || result?.state === "current" ? "cached" : "live",
    last_updated_local: valid
      ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium", timeStyle: "medium", ...(timeZone ? { timeZone } : {})
      }).format(updated)
      : null,
    age_seconds: ageSeconds,
    age_human: ageSeconds === null ? "not yet cached" :
      ageSeconds < 60 ? `${ageSeconds} seconds` :
        ageSeconds < 3600 ? `${Math.floor(ageSeconds / 60)} minutes` :
          ageSeconds < 86400 ? `${Math.floor(ageSeconds / 3600)} hours` :
            `${Math.floor(ageSeconds / 86400)} days`,
    max_age_seconds: result?.max_age_seconds ?? null
  };
}
