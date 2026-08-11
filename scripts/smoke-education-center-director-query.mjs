#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const EDUCATION_CENTER_DIRECTOR_ENDPOINT =
  "https://dfsm.ai/mcp/apps/leaddirector/education-center";
export const EDUCATION_CENTER_DIRECTOR_REQUIRED_TOOLS = Object.freeze([
  "bos_get_context",
  "education_center_get_email_thread",
  "education_center_list_enrollments",
  "education_center_search_calendar_events",
  "education_center_search_email_evidence",
  "education_center_search_leads",
  "education_center_search_students"
]);

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

export function currentLocalWeek(now = new Date(), timeZone) {
  if (!timeZone) throw new Error("EDUCATION_CENTER_SMOKE_TIME_ZONE is required");
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
  return Number.isInteger(error.code)
    ? { present: true, code: error.code }
    : { present: true };
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
    toolResultSucceeded: result?.isError === false,
    installationPresent: Boolean(context?.installation_id),
    organizationPresent: Boolean(context?.org_id),
    appCount: apps.length,
    roleCount: roles.size,
    expectedEducationCenterApplication: expectedApps.length === 1
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
    toolResultSucceeded: result?.isError === false,
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
    "Fix the deployed Education Center director-report MCP contract.",
    `Route: ${EDUCATION_CENTER_DIRECTOR_ENDPOINT}`,
    "Failure evidence:",
    JSON.stringify(safe, null, 2),
    "Required server resolution:",
    "1. Authenticate the existing client EDUCATION_CENTER_BOS_API_KEY and derive exactly one Education Center installation, organization, actor, and delegated role.",
    "2. Enable the education-center resource group in canonical installed-app metadata for that principal.",
    `3. Publish the exact required report tools: ${EDUCATION_CENTER_DIRECTOR_REQUIRED_TOOLS.join(", ")}.`,
    "4. Ensure the Calimatic plugin publishes calimatic_list_enrollments and calimatic_search_students so the named route aliases them to education_center_list_enrollments and education_center_search_students.",
    "5. Execute education_center_list_enrollments with server-derived scope and query.start_date/query.end_date; return structured class-enrollment records with class date, student, guardian, and family-phone fields when provider data contains them.",
    "6. Keep org_id, app_code, installed_app_id, and delegated_role_id out of public tool arguments; do not change the endpoint or create another API key.",
    "7. Redeploy, then run npm run smoke:mcp:education-center-data with the authorized Education Center key until this query passes.",
    "Owning server surfaces: backend/platform_orchestration/mcp_operational_profiles.py, agent_operation_catalog.py, canonical installed-app metadata, operation registry, and Calimatic provider binding."
  ].join("\n");
}

export class EducationCenterDirectorSmokeFailure extends Error {
  constructor(prompt, report) {
    super(prompt);
    this.name = "EducationCenterDirectorSmokeFailure";
    this.report = report;
  }
}

export async function runEducationCenterDirectorSmoke({
  apiKey,
  endpoint = EDUCATION_CENTER_DIRECTOR_ENDPOINT,
  fetchImpl = fetch,
  now = new Date(),
  onProgress,
  timeZone,
  startDate,
  endDate
} = {}) {
  if (endpoint !== EDUCATION_CENTER_DIRECTOR_ENDPOINT) {
    throw new Error("The Education Center director smoke test accepts only the approved endpoint");
  }
  if (!apiKey) throw new Error("EDUCATION_CENTER_BOS_API_KEY is absent from this process");
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
  const post = async (phase, body) => {
    onProgress?.({ phase, state: "started" });
    const headers = {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-03-26"
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
        redirect: "error"
      });
    } catch (error) {
      onProgress?.({ phase, state: "failed" });
      throw error;
    }
    const returnedSessionId = response.headers.get("mcp-session-id");
    if (returnedSessionId) sessionId = returnedSessionId;
    const correlationId = safeCorrelationId(
      response.headers.get("x-correlation-id")
    );
    if (correlationId) lastCorrelationId = correlationId;
    const result = {
      status: response.status,
      correlationId,
      payload: parseMcpPayload(await response.text())
    };
    onProgress?.({
      phase,
      state: "completed",
      status: result.status
    });
    return result;
  };
  const fail = (check, observed, correlationId = lastCorrelationId) => {
    report.failure = { check, correlationId, observed };
    throw new EducationCenterDirectorSmokeFailure(serverRemediationPrompt({
      check,
      correlationId,
      observed,
      startDate,
      endDate
    }), report);
  };

  const initialize = await post("initialize", {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "education-center-director-build-smoke", version: "1" }
    }
  });
  report.initialize = {
    status: initialize.status,
    correlationId: initialize.correlationId,
    protocolAccepted:
      initialize.payload?.result?.protocolVersion === "2025-03-26",
    sessionEstablished: Boolean(sessionId),
    error: rpcError(initialize.payload)
  };
  if (initialize.status !== 200 || initialize.payload?.error) {
    fail("authenticated MCP initialize", report.initialize, initialize.correlationId);
  }
  if (!report.initialize.protocolAccepted) {
    fail("MCP protocol negotiation", report.initialize, initialize.correlationId);
  }
  const initialized = await post("initialized notification", {
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

  const listed = await post("tool discovery", {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  });
  const tools = listed.payload?.result?.tools ?? [];
  const toolNames = tools.map((tool) => tool?.name).filter(Boolean).sort();
  const missingTools = EDUCATION_CENTER_DIRECTOR_REQUIRED_TOOLS.filter(
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

  const contextRequest = toolNames.includes("bos_get_context")
    ? post("authenticated context", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "bos_get_context", arguments: {} }
    })
    : undefined;
  const toolListSucceeded = listed.status === 200 &&
    !listed.payload?.error && missingTools.length === 0;
  const enrollmentsRequest = toolListSucceeded
    ? post("bounded enrollment query", {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "education_center_list_enrollments",
        arguments: { query: { start_date: startDate, end_date: endDate } }
      }
    })
    : undefined;
  const [contextCall, enrollments] = await Promise.all([
    contextRequest,
    enrollmentsRequest
  ]);
  report.context = contextCall && {
    status: contextCall.status,
    correlationId: contextCall.correlationId,
    ...safeContextObservation(contextCall.payload),
    error: rpcError(contextCall.payload)
  };
  if (!contextCall || contextCall.status !== 200 ||
      contextCall.payload?.error || !report.context?.toolResultSucceeded ||
      !report.context.installationPresent || !report.context.organizationPresent ||
      report.context.appCount !== 1 || report.context.roleCount !== 1 ||
      !report.context.expectedEducationCenterApplication) {
    fail("bos_get_context proves one authenticated Education Center scope", {
      context: report.context,
      missingTools
    }, contextCall?.correlationId ?? listed.correlationId);
  }
  if (!toolListSucceeded) {
    fail("tools/list contains the complete director-report read contract", {
      status: listed.status,
      toolCount: toolNames.length,
      toolNames,
      missingTools,
      context: report.context,
      error: rpcError(listed.payload)
    }, listed.correlationId);
  }

  report.enrollments = {
    status: enrollments.status,
    correlationId: enrollments.correlationId,
    ...rosterObservation(enrollments.payload),
    error: rpcError(enrollments.payload)
  };
  if (enrollments.status !== 200 || enrollments.payload?.error ||
      !report.enrollments.toolResultSucceeded ||
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
    const report = await runEducationCenterDirectorSmoke({
      apiKey: process.env.EDUCATION_CENTER_BOS_API_KEY,
      onProgress: ({ phase, state, status }) => {
        if (state === "started") {
          console.error(`[Education Center build smoke] ${phase} started`);
          return;
        }
        const statusText = status === undefined ? state : `HTTP ${status}`;
        console.error(`[Education Center build smoke] ${phase} ${statusText}`);
      },
      timeZone: process.env.EDUCATION_CENTER_SMOKE_TIME_ZONE,
      startDate: process.env.EDUCATION_CENTER_SMOKE_START_DATE,
      endDate: process.env.EDUCATION_CENTER_SMOKE_END_DATE
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (error instanceof EducationCenterDirectorSmokeFailure) {
      console.error(error.message);
    } else {
      console.error("Education Center director smoke failed before a safe contract report was available");
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
