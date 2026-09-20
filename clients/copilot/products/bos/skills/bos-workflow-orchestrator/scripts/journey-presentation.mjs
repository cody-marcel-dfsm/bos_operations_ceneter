#!/usr/bin/env node

import {
  buildActionRequest,
  validateClientInstruction,
  validateClientResolution
} from "./journey-runtime-client.mjs";

const hiddenPresentationKeys = new Set([
  "access_token",
  "refresh_token",
  "bearer_token",
  "api_key",
  "credential",
  "credential_id",
  "credential_token",
  "secret",
  "provider_id",
  "provider_account_id",
  "provider_payload",
  "campaign_id",
  "audience_id",
  "execution_id",
  "database_id",
  "artifact_ref",
  "object_name",
  "attendee",
  "attendees",
  "recipient",
  "recipients",
  "email",
  "emails",
  "email_address",
  "email_addresses",
  "contact",
  "contacts"
]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function discoveredAction(contract, expectedOperation) {
  requireObject(contract, "operation contract");
  requireString(contract.operation, "operation contract.operation");
  if (contract.operation !== expectedOperation || contract.status !== "described") {
    throw new Error(`operation contract must be the exact discovered ${expectedOperation} contract`);
  }
  requireObject(contract.execution, "operation contract.execution");
  requireString(contract.execution.method, "operation contract.execution.method");
  requireString(contract.execution.uri, "operation contract.execution.uri");
  if (!contract.execution.uri.startsWith("/") ||
      contract.execution.uri.startsWith("//") ||
      /[\s\\#]/u.test(contract.execution.uri)) {
    throw new Error("operation contract.execution.uri must be a safe origin-relative URI");
  }
  requireObject(contract.input_schema, "operation contract.input_schema");
  return {
    verb: "query",
    method: contract.execution.method,
    href: contract.execution.uri,
    payload_schema: contract.input_schema
  };
}

export function buildCampaignStatusRequest(contract, category) {
  requireString(category, "category");
  return buildActionRequest(
    discoveredAction(contract, "sendgrid-email.campaign.status"),
    { category }
  );
}

export function buildCampaignMetricsRequest(contract, category, observationWindow) {
  requireString(category, "category");
  const payload = { category };
  if (observationWindow !== undefined) {
    requireObject(observationWindow, "observation_window");
    requireString(observationWindow.from, "observation_window.from");
    requireString(observationWindow.through, "observation_window.through");
    payload.observation_window = {
      from: observationWindow.from,
      through: observationWindow.through
    };
  }
  return buildActionRequest(
    discoveredAction(contract, "sendgrid-email.campaign.metrics"),
    payload
  );
}

function normalizedSecurityKey(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function cloneAllowed(value) {
  if (Array.isArray(value)) return value.map(cloneAllowed);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !hiddenPresentationKeys.has(normalizedSecurityKey(key)))
        .map(([key, child]) => [key, cloneAllowed(child)])
    );
  }
  return structuredClone(value);
}

function pick(source, fields) {
  requireObject(source, "public result");
  return Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(source, field))
      .map((field) => [field, cloneAllowed(source[field])])
  );
}

export function presentCampaignStatus(result) {
  return pick(result, [
    "category",
    "state",
    "terminal",
    "send_outcome",
    "lifecycle_timestamps",
    "send_summary",
    "issues",
    "available_actions",
    "observed_at"
  ]);
}

export function presentCampaignMetrics(result) {
  return pick(result, [
    "category",
    "effective_window",
    "successful_sends",
    "failed_sends",
    "delivery",
    "engagement",
    "observed_at"
  ]);
}

export function presentClientInstruction(instruction) {
  validateClientInstruction(instruction);
  const data = pick(instruction, [
    "problem",
    "campaign_review",
    "campaign_result",
    "send_diagnostics",
    "approval",
    "data"
  ]);
  return {
    goal: instruction.goal,
    message: instruction.message,
    semantic_operation: instruction.semantic_operation ?? null,
    data
  };
}

export function presentClientResolution(resolution) {
  validateClientResolution(resolution);
  return {
    goal: resolution.goal,
    instruction: resolution.instruction,
    operation: resolution.operation ?? null,
    requires_user_approval: resolution.requires_user_approval,
    approval_scope: cloneAllowed(resolution.approval_scope ?? [])
  };
}

function edgeTargets(node) {
  const targets = [];
  if (typeof node.next === "string") targets.push({ target: node.next, label: "next" });
  for (const [kind, branch] of [["success", node.transitions], ["failure", node.catch]]) {
    for (const [index, item] of (branch?.cases ?? []).entries()) {
      if (typeof item?.next === "string") {
        targets.push({ target: item.next, label: `${kind} ${index + 1}` });
      }
    }
    if (typeof branch?.default === "string") {
      targets.push({ target: branch.default, label: `${kind} default` });
    }
  }
  return targets;
}

function safeLabel(value) {
  return String(value)
    .replaceAll(/[^A-Za-z0-9 _:.+-]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function buildJourneyGraphView(document, runtime = {}) {
  requireObject(document, "journey document");
  if (!Array.isArray(document.nodes) || document.nodes.length === 0) {
    throw new Error("journey document.nodes must be a non-empty array");
  }
  const completed = new Set(
    Array.isArray(runtime.completed_path) ? runtime.completed_path : []
  );
  const current = runtime.current_step?.code ?? null;
  const ids = new Map(document.nodes.map((node, index) => [node.code, `n${index}`]));
  const lines = ["flowchart LR"];
  const accessible = [];
  for (const node of document.nodes) {
    requireString(node.code, "journey node.code");
    if (!["client", "server"].includes(node.type)) {
      throw new Error("journey node.type must be client or server");
    }
    const states = [];
    if (completed.has(node.code)) states.push("completed");
    if (node.code === current) states.push("CURRENT");
    if (node.terminal === true) states.push("terminal");
    const suffix = states.length ? `, ${states.join(", ")}` : "";
    lines.push(`  ${ids.get(node.code)}["${safeLabel(node.code)} · ${node.type}${suffix}"]`);
    accessible.push(`${node.code} [${node.type}${suffix}]`);
  }
  for (const node of document.nodes) {
    for (const edge of edgeTargets(node)) {
      if (!ids.has(edge.target)) continue;
      lines.push(
        `  ${ids.get(node.code)} -->|${safeLabel(edge.label)}| ${ids.get(edge.target)}`
      );
    }
  }
  if (current && ids.has(current)) lines.push(`  class ${ids.get(current)} current`);
  if (completed.size) {
    const completedIds = [...completed].filter((code) => ids.has(code)).map((code) => ids.get(code));
    if (completedIds.length) lines.push(`  class ${completedIds.join(",")} completed`);
  }
  lines.push("  classDef current fill:#005A9C,color:#FFFFFF,stroke:#1F2937,stroke-width:4px");
  lines.push("  classDef completed fill:#007A5E,color:#FFFFFF,stroke:#1F2937,stroke-width:2px");
  return {
    mermaid: lines.join("\n"),
    accessible_text: accessible.join(" -> ")
  };
}
