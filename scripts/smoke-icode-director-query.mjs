#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const ICODE_DIRECTOR_ENDPOINT =
  "https://dfsm.ai/mcp/apps/leaddirector/icode-operations";
export const ICODE_DIRECTOR_REQUIRED_TOOLS = Object.freeze([
  "bos_get_context",
  "icode_get_email_thread",
  "icode_list_enrollments",
  "icode_search_calendar_events",
  "icode_search_email_evidence",
  "icode_search_leads",
  "icode_search_students"
]);

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

export function currentLocalWeek(now = new Date(), timeZone) {
  if (!timeZone) throw new Error("ICODE_SMOKE_TIME_ZONE is required");
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now).filter(({ type }) => type !== "literal")
    .map(({ type, value }) => [type, value]));
  const start = new Date(Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day)
  ));
  const localDay = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (localDay === 0 ? 6 : localDay - 1));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

function parseMcpPayload(text) {
  const candidates = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());
  for (const candidate of candidates.length ? candidates : [text.trim()]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue until a complete JSON or SSE data payload is found.
    }
  }
  return undefined;
}

function safeCorrelationId(value) {
  const text = String(value ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : undefined;
}

function rpcError(payload) {
  const error = payload?.error;
  if (!error) return undefined;
  return {
    code: Number.isInteger(error.code) ? error.code : "unclassified_rpc_error"
  };
}

function toolResult(payload) {
  return payload?.result;
}

function structuredResult(payload) {
  return toolResult(payload)?.structuredContent?.result;
}

function safeContextObservation(payload) {
  const result = toolResult(payload);
  const context = structuredResult(payload);
  const apps = Array.isArray(context?.apps) ? context.apps : [];
  const roles = new Set(
    apps.map((app) => app?.delegated_role_id).filter(Boolean)
  );
  const expectedApps = apps.filter((app) => app?.app_code === "lead_director");
  return {
    isError: result?.isError,
    installationPresent: Boolean(context?.installation_id),
    organizationPresent: Boolean(context?.org_id),
    appCount: apps.length,
    roleCount: roles.size,
    expectedIcodeApplication: expectedApps.length === 1
  };
}

function recordAttributes(record) {
  return record && typeof record.attributes === "object" ? record.attributes : {};
}

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function hasAnyKey(value, keys) {
  return keys.some((key) => hasOwn(value, key));
}

function hasEnrollmentShape(record) {
  const attributes = recordAttributes(record);
  return hasAnyKey(attributes, [
    "class_type", "class_category", "class_name", "course",
    "class_start_date", "class_date"
  ]);
}

function isCampRecord(record) {
  const attributes = recordAttributes(record);
  return [
    attributes.class_type,
    attributes.class_category,
    attributes.class_name,
    attributes.course
  ].some((value) => /camp/i.test(String(value ?? "")));
}

function rosterObservation(payload) {
  const result = toolResult(payload);
  const records = structuredResult(payload);
  const rows = Array.isArray(records) ? records : [];
  const enrollmentRows = rows.filter(hasEnrollmentShape);
  const campRows = rows.filter(isCampRecord);
  const rosterRows = campRows.length ? campRows : rows;
  return {
    isError: result?.isError,
    recordCount: rows.length,
    enrollmentShapeCount: enrollmentRows.length,
    campRecordCount: campRows.length,
    studentFieldSchemaCount: rosterRows.filter((record) =>
      hasOwn(record, "display_name") ||
      hasOwn(recordAttributes(record), "student_name")
    ).length,
    studentValueCount: rosterRows.filter((record) =>
      Boolean(record?.display_name || recordAttributes(record).student_name)
    ).length,
    familyPhoneFieldSchemaCount: rosterRows.filter((record) =>
      hasOwn(record, "phone") ||
      hasOwn(recordAttributes(record), "guardian_phone")
    ).length,
    familyPhoneValueCount: rosterRows.filter((record) =>
      Boolean(record?.phone || recordAttributes(record).guardian_phone)
    ).length
  };
}

export function serverRemediationPrompt({
  check,
  correlationId,
  observed,
  startDate,
  endDate,
}) {
  const safe = {
    check,
    correlation_id: safeCorrelationId(correlationId),
    reporting_window: { start_date: startDate, end_date: endDate },
    observed
  };
  return [
    "SERVER REMEDIATION PROMPT",
    "Fix the deployed iCode director-report MCP contract.",
    `Route: ${ICODE_DIRECTOR_ENDPOINT}`,
    "Failure evidence:",
    JSON.stringify(safe, null, 2),
    "Required server resolution:",
    "1. Authenticate the existing client BOS_API_KEY and derive exactly one iCode installation, organization, actor, and delegated role.",
    "2. Enable the icode-operations resource group in canonical installed-app metadata for that principal.",
    `3. Publish the exact required report tools: ${ICODE_DIRECTOR_REQUIRED_TOOLS.join(", ")}.`,
    "4. Ensure the Calimatic plugin publishes calimatic_list_enrollments and calimatic_search_students so the named route aliases them to icode_list_enrollments and icode_search_students.",
    "5. Execute icode_list_enrollments with server-derived scope and query.start_date/query.end_date; return structured class-enrollment records with class date, student, guardian, and family-phone fields when provider data contains them.",
    "6. Keep org_id, app_code, installed_app_id, and delegated_role_id out of public tool arguments; do not change the endpoint or create another API key.",
    "7. Redeploy, then run npm run smoke:mcp:icode-data with the authorized iCode key until this query passes.",
    "Owning server surfaces: backend/platform_orchestration/mcp_operational_profiles.py, agent_operation_catalog.py, canonical installed-app metadata, operation registry, and Calimatic provider binding."
  ].join("\n");
}

export class IcodeDirectorSmokeFailure extends Error {
  constructor(prompt, report) {
    super(prompt);
    this.name = "IcodeDirectorSmokeFailure";
    this.report = report;
  }
}

export async function runIcodeDirectorSmoke({
  apiKey,
  endpoint = ICODE_DIRECTOR_ENDPOINT,
  fetchImpl = fetch,
  now = new Date(),
  timeZone,
  startDate,
  endDate
} = {}) {
  if (endpoint !== ICODE_DIRECTOR_ENDPOINT) {
    throw new Error("The iCode director smoke test accepts only the approved endpoint");
  }
  if (!apiKey) throw new Error("BOS_API_KEY is absent from this process");
  const week = currentLocalWeek(now, timeZone);
  startDate ||= week.startDate;
  endDate ||= week.endDate;
  const report = {
    endpoint,
    reportingWindow: { startDate, endDate },
    timeZone,
    credentialPresent: true
  };
  let lastCorrelationId;
  let sessionId;
  const post = async (body) => {
    const headers = {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-03-26"
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      redirect: "error"
    });
    const returnedSessionId = response.headers.get("mcp-session-id");
    if (returnedSessionId) sessionId = returnedSessionId;
    const correlationId = safeCorrelationId(
      response.headers.get("x-correlation-id")
    );
    if (correlationId) lastCorrelationId = correlationId;
    return {
      status: response.status,
      correlationId,
      payload: parseMcpPayload(await response.text())
    };
  };
  const fail = (check, observed, correlationId = lastCorrelationId) => {
    report.failure = { check, correlationId, observed };
    throw new IcodeDirectorSmokeFailure(serverRemediationPrompt({
      check,
      correlationId,
      observed,
      startDate,
      endDate
    }), report);
  };

  const initialize = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "icode-director-build-smoke", version: "1" }
    }
  });
  report.initialize = {
    status: initialize.status,
    correlationId: initialize.correlationId,
    protocolVersion: initialize.payload?.result?.protocolVersion,
    sessionEstablished: Boolean(sessionId),
    error: rpcError(initialize.payload)
  };
  if (initialize.status !== 200 || initialize.payload?.error) {
    fail("authenticated MCP initialize", report.initialize, initialize.correlationId);
  }
  if (report.initialize.protocolVersion !== "2025-03-26") {
    fail("MCP protocol negotiation", report.initialize, initialize.correlationId);
  }
  const initialized = await post({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  });
  report.initialized = {
    status: initialized.status,
    correlationId: initialized.correlationId,
    error: rpcError(initialized.payload)
  };
  if (initialized.status < 200 || initialized.status >= 300 ||
      initialized.payload?.error) {
    fail("MCP initialized notification", report.initialized,
      initialized.correlationId);
  }

  const listed = await post({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  });
  const tools = listed.payload?.result?.tools ?? [];
  const toolNames = tools.map((tool) => tool?.name).filter(Boolean).sort();
  const missingTools = ICODE_DIRECTOR_REQUIRED_TOOLS.filter(
    (name) => !toolNames.includes(name)
  );
  report.toolsList = {
    status: listed.status,
    correlationId: listed.correlationId,
    count: toolNames.length,
    names: toolNames,
    missingTools,
    error: rpcError(listed.payload)
  };

  const contextCall = toolNames.includes("bos_get_context")
    ? await post({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "bos_get_context", arguments: {} }
    })
    : undefined;
  report.context = contextCall && {
    status: contextCall.status,
    correlationId: contextCall.correlationId,
    ...safeContextObservation(contextCall.payload),
    error: rpcError(contextCall.payload)
  };
  if (!contextCall || contextCall.status !== 200 ||
      contextCall.payload?.error || report.context?.isError !== false ||
      !report.context.installationPresent || !report.context.organizationPresent ||
      report.context.appCount !== 1 || report.context.roleCount !== 1 ||
      !report.context.expectedIcodeApplication) {
    fail("bos_get_context proves one authenticated iCode scope", {
      context: report.context,
      missingTools
    }, contextCall?.correlationId ?? listed.correlationId);
  }
  if (listed.status !== 200 || listed.payload?.error || missingTools.length) {
    fail("tools/list contains the complete director-report read contract", {
      status: listed.status,
      toolCount: toolNames.length,
      toolNames,
      missingTools,
      context: report.context,
      error: rpcError(listed.payload)
    }, listed.correlationId);
  }

  const enrollments = await post({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "icode_list_enrollments",
      arguments: { query: { start_date: startDate, end_date: endDate } }
    }
  });
  report.enrollments = {
    status: enrollments.status,
    correlationId: enrollments.correlationId,
    ...rosterObservation(enrollments.payload),
    error: rpcError(enrollments.payload)
  };
  if (enrollments.status !== 200 || enrollments.payload?.error ||
      report.enrollments.isError !== false ||
      !Array.isArray(structuredResult(enrollments.payload))) {
    fail("current-week enrollment query returns a structured record array",
      report.enrollments,
      enrollments.correlationId);
  }
  if (report.enrollments.enrollmentShapeCount !==
      report.enrollments.recordCount) {
    fail("enrollment records use the canonical class record shape",
      report.enrollments, enrollments.correlationId);
  }
  if (report.enrollments.campRecordCount > 0 &&
      (report.enrollments.studentFieldSchemaCount !==
        report.enrollments.campRecordCount ||
       report.enrollments.familyPhoneFieldSchemaCount !==
        report.enrollments.campRecordCount)) {
    fail("camp records expose student and family-phone fields",
      report.enrollments, enrollments.correlationId);
  }
  report.dataQuality = report.enrollments.campRecordCount > 0 ? {
    campDataPresent: true,
    studentFieldSchemaPresent: report.enrollments.studentFieldSchemaCount > 0,
    familyPhoneFieldSchemaPresent:
      report.enrollments.familyPhoneFieldSchemaCount > 0,
    studentValuesPresent: report.enrollments.studentValueCount > 0,
    familyPhoneValuesPresent: report.enrollments.familyPhoneValueCount > 0,
    warning: report.enrollments.studentValueCount === 0 ||
      report.enrollments.familyPhoneValueCount === 0
      ? "camp fields are structurally present with incomplete provider values"
      : undefined
  } : {
    campDataPresent: false,
    contentValidation: "not_applicable_for_this_reporting_window"
  };
  report.ok = true;
  return report;
}

async function main() {
  try {
    const report = await runIcodeDirectorSmoke({
      apiKey: process.env.BOS_API_KEY,
      timeZone: process.env.ICODE_SMOKE_TIME_ZONE,
      startDate: process.env.ICODE_SMOKE_START_DATE,
      endDate: process.env.ICODE_SMOKE_END_DATE
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (error instanceof IcodeDirectorSmokeFailure) {
      console.error(error.message);
    } else {
      console.error("iCode director smoke failed before a safe contract report was available");
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
