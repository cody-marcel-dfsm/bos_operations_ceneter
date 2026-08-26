#!/usr/bin/env node

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const PLAN_VERSION = "bos-query-plan/v1";
const RESULT_VERSION = "bos-query-result/v1";
const EVENT_VERSION = "bos-execution-event/v1";
const MODES = new Set(["per_source", "federated", "merged_view", "synchronize_from"]);
const ORIGINS = new Set(["cache", "live", "mixed"]);
const USAGE_SCOPES = new Set(["host_measured", "client_visible_estimate", "unavailable"]);

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function instant(value, label) {
  const parsed = new Date(text(value, label));
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${label} must be an ISO instant`);
  return parsed;
}

function jsonShape(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return { type: "array", count: value.length };
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, jsonShape(value[key])])
    );
  }
  return typeof value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function usage(value = { scope: "unavailable" }) {
  object(value, "usage");
  const scope = text(value.scope ?? "unavailable", "usage.scope");
  if (!USAGE_SCOPES.has(scope)) throw new Error("usage.scope is invalid");
  const result = { scope };
  for (const field of ["input_tokens", "output_tokens", "total_tokens"]) {
    if (value[field] === undefined) continue;
    if (!Number.isInteger(value[field]) || value[field] < 0) {
      throw new Error(`usage.${field} must be a non-negative integer`);
    }
    result[field] = value[field];
  }
  return result;
}

export function buildQueryPlan(input) {
  object(input, "input");
  const mode = text(input.mode ?? "federated", "mode");
  if (!MODES.has(mode)) throw new Error("mode is invalid");
  if (!Array.isArray(input.available_tools) || input.available_tools.length === 0) {
    throw new Error("available_tools must be a non-empty array");
  }
  const availableTools = input.available_tools.map((tool, index) =>
    text(tool, `available_tools[${index}]`)
  );
  if (new Set(availableTools).size !== availableTools.length) {
    throw new Error("available_tools must not contain duplicates");
  }
  const callableTools = new Set(availableTools);
  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    throw new Error("sources must be a non-empty array");
  }
  const sources = input.sources.map((source, index) => {
    object(source, `sources[${index}]`);
    const maxAge = source.max_age_seconds ?? 300;
    if (!Number.isInteger(maxAge) || maxAge < 0) {
      throw new Error(`sources[${index}].max_age_seconds must be non-negative`);
    }
    const tool = text(source.tool, `sources[${index}].tool`);
    if (!callableTools.has(tool)) {
      throw new Error(`sources[${index}].tool is absent from available_tools`);
    }
    return {
      source_handle: text(source.source_handle, `sources[${index}].source_handle`),
      source_label: text(source.source_label, `sources[${index}].source_label`),
      tool,
      cache_policy: {
        max_age_seconds: maxAge,
        allow_stale_on_error: source.allow_stale_on_error === true
      },
      query: object(source.query ?? input.query ?? {}, `sources[${index}].query`),
      execution: source.execution === "sequential" ? "sequential" : "parallel"
    };
  });
  const material = {
    plan_version: PLAN_VERSION,
    product: text(input.product, "product"),
    mcp_group: text(input.mcp_group, "mcp_group"),
    manifest_fingerprint: text(input.manifest_fingerprint, "manifest_fingerprint"),
    skills: (input.skills ?? []).map((item, index) => text(item, `skills[${index}]`)),
    dataset: text(input.dataset, "dataset"),
    query: object(input.query ?? {}, "query"),
    sources,
    aggregation: {
      mode,
      preserve_per_source: true
    }
  };
  return { ...material, plan_id: `bos_plan_${hash(material).slice(0, 24)}` };
}

export function explainQueryPlan(plan) {
  object(plan, "plan");
  return {
    plan_version: plan.plan_version,
    plan_id: plan.plan_id,
    product: plan.product,
    mcp_group: plan.mcp_group,
    manifest_fingerprint: plan.manifest_fingerprint,
    skills: plan.skills,
    dataset: plan.dataset,
    query_shape: jsonShape(plan.query),
    sources: plan.sources.map((source) => ({
      source_handle_digest: hash(source.source_handle).slice(0, 16),
      source_label: source.source_label,
      tool: source.tool,
      query_shape: jsonShape(source.query),
      cache_policy: source.cache_policy,
      execution: source.execution
    })),
    aggregation: plan.aggregation,
    executes_source_calls: false
  };
}

export function executionEvent(input) {
  object(input, "event");
  const sequence = input.sequence;
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("event.sequence must be a positive integer");
  }
  return {
    event_version: EVENT_VERSION,
    sequence,
    event_type: text(input.event_type, "event.event_type"),
    occurred_at: instant(input.occurred_at ?? new Date().toISOString(), "event.occurred_at").toISOString(),
    source_handle_digest: input.source_handle
      ? hash(text(input.source_handle, "event.source_handle")).slice(0, 16)
      : null,
    details: object(input.details ?? {}, "event.details")
  };
}

export function normalizeSourceResult(input, options = {}) {
  object(input, "source result");
  const origin = text(input.origin, "origin");
  if (!ORIGINS.has(origin)) throw new Error("origin is invalid");
  const updated = instant(input.last_updated_at, "last_updated_at");
  const now = options.now ? new Date(options.now) : new Date();
  const ageSeconds = Math.max(0, Math.floor((now.valueOf() - updated.valueOf()) / 1000));
  const maxAge = input.max_age_seconds;
  if (!Number.isInteger(maxAge) || maxAge < 0) {
    throw new Error("max_age_seconds must be a non-negative integer");
  }
  const timeZone = options.timeZone;
  const stale = ageSeconds > maxAge;
  const staleFallbackAllowed = input.allow_stale_on_error === true &&
    input.refresh_error === true;
  const cacheUsable = origin !== "cache" || !stale || staleFallbackAllowed;
  return {
    source_handle: text(input.source_handle, "source_handle"),
    source_label: text(input.source_label, "source_label"),
    tool: text(input.tool, "tool"),
    status: cacheUsable
      ? text(input.status ?? "completed", "status")
      : "refresh_required",
    origin,
    freshness: {
      status: stale ? "stale" : "fresh",
      last_updated_at: updated.toISOString(),
      local_label: new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        ...(timeZone ? { timeZone } : {})
      }).format(updated),
      age_seconds: ageSeconds,
      age_label: ageSeconds < 60
        ? `${ageSeconds} seconds ago`
        : ageSeconds < 3600
          ? `${Math.floor(ageSeconds / 60)} minutes ago`
          : `${Math.floor(ageSeconds / 3600)} hours ago`,
      max_age_seconds: maxAge
    },
    stale_fallback_used: origin === "cache" && staleFallbackAllowed,
    coverage: object(input.coverage ?? { complete: true }, "coverage"),
    records: cacheUsable && Array.isArray(input.records) ? input.records : [],
    error: input.error ?? null,
    elapsed_ms: Number.isInteger(input.elapsed_ms) && input.elapsed_ms >= 0
      ? input.elapsed_ms
      : null,
    usage: usage(input.usage)
  };
}

export function buildSourceCacheDescriptor(plan, sourceHandle) {
  object(plan, "plan");
  const selected = plan.sources.find((source) => source.source_handle === sourceHandle);
  if (!selected) throw new Error("source_handle is not present in the plan");
  const material = {
    product: text(plan.product, "plan.product"),
    mcp_group: text(plan.mcp_group, "plan.mcp_group"),
    manifest_fingerprint: text(
      plan.manifest_fingerprint,
      "plan.manifest_fingerprint"
    ),
    dataset: text(plan.dataset, "plan.dataset"),
    source_handle: text(selected.source_handle, "source.source_handle"),
    tool: text(selected.tool, "source.tool"),
    query: object(selected.query, "source.query")
  };
  return {
    cache_key: `bos_query_${hash(material).slice(0, 40)}`,
    source_handle: selected.source_handle,
    tool: selected.tool,
    dataset: plan.dataset,
    query_digest: hash(selected.query),
    freshness_policy: selected.cache_policy
  };
}

function aggregateUsage(sourceResults) {
  if (sourceResults.length === 0) return { scope: "unavailable" };
  const values = sourceResults.map((item) => usage(item.usage));
  if (values.some((item) => item.scope === "unavailable" ||
      !Number.isInteger(item.input_tokens) || !Number.isInteger(item.output_tokens))) {
    return { scope: "unavailable" };
  }
  const inputTokens = values.reduce((total, item) => total + item.input_tokens, 0);
  const outputTokens = values.reduce((total, item) => total + item.output_tokens, 0);
  return {
    scope: values.every((item) => item.scope === "host_measured")
      ? "host_measured"
      : "client_visible_estimate",
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens
  };
}

function mergedPresentation(sourceResults) {
  const candidates = [];
  for (const source of sourceResults) {
    const sourceHandle = text(source.source_handle, "source_result.source_handle");
    const sourceLabel = text(source.source_label, "source_result.source_label");
    const tool = text(source.tool, "source_result.tool");
    for (const record of Array.isArray(source.records) ? source.records : []) {
      const email = record?.identity?.normalized_email;
      candidates.push({
        source_handle: sourceHandle,
        source_label: sourceLabel,
        tool,
        normalized_email: typeof email === "string" && email.trim()
          ? email.trim().toLowerCase()
          : null,
        record
      });
    }
  }

  const groups = new Map();
  for (const candidate of candidates) {
    const key = candidate.normalized_email ?? `unmatched:${groups.size}`;
    const values = groups.get(key) ?? [];
    values.push(candidate);
    groups.set(key, values);
  }

  return {
    policy: "exact_normalized_email",
    groups: [...groups.entries()].map(([key, members]) => {
      if (key.startsWith("unmatched:")) {
        return { status: "unmatched", reason: "missing_normalized_email", members };
      }
      const sourceCounts = new Map();
      for (const member of members) {
        sourceCounts.set(
          member.source_handle,
          (sourceCounts.get(member.source_handle) ?? 0) + 1
        );
      }
      if ([...sourceCounts.values()].some((count) => count > 1)) {
        return {
          status: "ambiguous",
          reason: "duplicate_candidate_within_source",
          identity: { normalized_email: key },
          members
        };
      }
      return {
        status: sourceCounts.size > 1 ? "correlated" : "unmatched",
        reason: sourceCounts.size > 1 ? null : "single_source_only",
        identity: { normalized_email: key },
        members
      };
    })
  };
}

export function aggregateQueryResult(input) {
  object(input, "aggregate input");
  const plan = object(input.plan, "plan");
  if (!Array.isArray(input.source_results)) {
    throw new Error("source_results must be an array");
  }
  const sourceResults = input.source_results;
  const failed = sourceResults.filter((item) => item.status !== "completed");
  const mode = plan.aggregation?.mode ?? "federated";
  return {
    result_version: RESULT_VERSION,
    plan_id: text(plan.plan_id, "plan.plan_id"),
    complete: failed.length === 0,
    mode,
    sources: sourceResults,
    record_count: sourceResults.reduce(
      (count, item) => count + (Array.isArray(item.records) ? item.records.length : 0),
      0
    ),
    failed_source_count: failed.length,
    merged_view: mode === "merged_view"
      ? mergedPresentation(sourceResults)
      : null,
    execution_ledger: Array.isArray(input.execution_ledger)
      ? input.execution_ledger
      : [],
    usage: usage(input.usage ?? aggregateUsage(sourceResults))
  };
}

async function runCli() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const operation = text(input.operation, "operation");
  let result;
  if (operation === "plan") result = buildQueryPlan(input);
  else if (operation === "explain") result = explainQueryPlan(buildQueryPlan(input));
  else if (operation === "event") result = executionEvent(input.event);
  else if (operation === "source_result") result = normalizeSourceResult(input.result, input.options);
  else if (operation === "cache_key") {
    const plan = buildQueryPlan(input);
    result = buildSourceCacheDescriptor(plan, input.source_handle);
  }
  else if (operation === "aggregate") result = aggregateQueryResult(input);
  else throw new Error("operation must be plan, explain, event, source_result, cache_key, or aggregate");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : null;
if (invoked && fileURLToPath(import.meta.url) === invoked) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
