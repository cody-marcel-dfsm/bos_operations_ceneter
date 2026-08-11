import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EDUCATION_CENTER_DIRECTOR_REQUIRED_TOOLS,
  EducationCenterDirectorSmokeFailure,
  currentLocalWeek,
  runEducationCenterDirectorSmoke
} from "../scripts/smoke-education-center-director-query.mjs";

const CORRELATION_ID = "11111111-1111-4111-8111-111111111111";

function response(payload, status = 200, {
  correlationId = CORRELATION_ID,
  sessionId
} = {}) {
  const headers = { "x-correlation-id": correlationId };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  return new Response(payload === undefined ? "" : JSON.stringify(payload), {
    status,
    headers
  });
}

test("current reporting week follows the configured customer timezone", () => {
  const instant = new Date("2026-08-10T01:30:00Z");
  assert.deepEqual(currentLocalWeek(instant, "America/Denver"), {
    startDate: "2026-08-03",
    endDate: "2026-08-09"
  });
  assert.deepEqual(currentLocalWeek(instant, "Pacific/Kiritimati"), {
    startDate: "2026-08-10",
    endDate: "2026-08-16"
  });
});

test("director live smoke executes context and a bounded camp-roster query", async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ body, options });
    if (body.method === "initialize") {
      return response({
        jsonrpc: "2.0",
        id: body.id,
        result: { protocolVersion: "2025-03-26" }
      }, 200, { sessionId: "session-1" });
    }
    assert.equal(options.headers["Mcp-Session-Id"], "session-1");
    if (body.method === "notifications/initialized") return response(undefined, 202);
    if (body.method === "tools/list") {
      return response({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: EDUCATION_CENTER_DIRECTOR_REQUIRED_TOOLS.map((name) => ({ name }))
        }
      });
    }
    if (body.params?.name === "bos_get_context") {
      return response({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          isError: false,
          structuredContent: {
            result: {
              installation_id: "present",
              org_id: "present",
              apps: [{ app_code: "lead_director", delegated_role_id: "director" }]
            }
          }
        }
      });
    }
    if (body.params?.name === "education_center_list_enrollments") {
      return response({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          isError: false,
          structuredContent: {
            result: [{
              display_name: "[PRESENT]",
              phone: "[PRESENT]",
              attributes: {
                class_type: "Camp",
                class_name: "[PRESENT]",
                class_start_date: "2026-08-10",
                student_name: "[PRESENT]",
                guardian_phone: "[PRESENT]"
              }
            }]
          }
        }
      });
    }
    throw new Error(`Unexpected request: ${JSON.stringify(body)}`);
  };

  const report = await runEducationCenterDirectorSmoke({
    apiKey: "test-secret",
    fetchImpl,
    timeZone: "America/Denver",
    startDate: "2026-08-10",
    endDate: "2026-08-16"
  });
  assert.equal(report.ok, true);
  assert.equal(report.context.appCount, 1);
  assert.equal(report.enrollments.campRecordCount, 1);
  assert.equal(report.enrollments.familyPhoneFieldSchemaCount, 1);
  assert.equal(report.enrollments.familyPhoneValueCount, 1);
  const enrollmentCall = requests.find(
    (request) => request.body.params?.name === "education_center_list_enrollments"
  );
  assert.deepEqual(enrollmentCall.body.params.arguments, {
    query: { start_date: "2026-08-10", end_date: "2026-08-16" }
  });
  assert(!("org_id" in enrollmentCall.body.params.arguments));
});

test("director live smoke overlaps independent read checks after tool discovery", async () => {
  const progress = [];
  const requestOrder = [];
  let contextResolved = false;
  let resolveContext;
  const contextResponse = new Promise((resolve) => {
    resolveContext = () => {
      contextResolved = true;
      resolve(response({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          structuredContent: { result: {
            installation_id: "present",
            org_id: "present",
            apps: [{ app_code: "lead_director", delegated_role_id: "director" }]
          } }
        }
      }));
    };
  });
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    const label = body.params?.name ?? body.method;
    requestOrder.push(label);
    if (body.method === "initialize") return response({
      jsonrpc: "2.0",
      id: body.id,
      result: { protocolVersion: "2025-03-26" }
    }, 200, { sessionId: "session-concurrent" });
    if (body.method === "notifications/initialized") return response(undefined, 202);
    if (body.method === "tools/list") return response({
      jsonrpc: "2.0",
      id: body.id,
      result: { tools: EDUCATION_CENTER_DIRECTOR_REQUIRED_TOOLS.map((name) => ({ name })) }
    });
    if (body.params?.name === "bos_get_context") return contextResponse;
    if (body.params?.name === "education_center_list_enrollments") {
      assert.equal(contextResolved, false);
      resolveContext();
      return response({
        jsonrpc: "2.0",
        id: body.id,
        result: { isError: false, structuredContent: { result: [] } }
      });
    }
    throw new Error(`Unexpected request: ${JSON.stringify(body)}`);
  };

  const report = await runEducationCenterDirectorSmoke({
    apiKey: "test-secret",
    fetchImpl,
    onProgress: (event) => progress.push(event),
    timeZone: "America/Denver"
  });
  assert.equal(report.ok, true);
  assert(progress.every((event) =>
    Object.keys(event).every((key) => ["phase", "state", "status"].includes(key))
  ));
  assert.doesNotMatch(JSON.stringify({ progress, report }), /test-secret/);
  assert.deepEqual(requestOrder, [
    "initialize",
    "notifications/initialized",
    "tools/list",
    "bos_get_context",
    "education_center_list_enrollments"
  ]);
});

test("director live smoke prints a secret-free server prompt for missing tools", async () => {
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return response({
        jsonrpc: "2.0",
        id: body.id,
        result: { protocolVersion: "2025-03-26" }
      }, 200, { sessionId: "session-2" });
    }
    if (body.method === "notifications/initialized") return response(undefined, 202);
    if (body.method === "tools/list") {
      return response({
        jsonrpc: "2.0",
        id: body.id,
        result: { tools: [{ name: "bos_get_context" }] }
      });
    }
    return response({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        isError: false,
        structuredContent: {
          result: {
            installation_id: "present",
            org_id: "present",
            apps: [{ app_code: "lead_director", delegated_role_id: "director" }]
          }
        }
      }
    });
  };

  await assert.rejects(
    runEducationCenterDirectorSmoke({
      apiKey: "private-live-key",
      fetchImpl,
      timeZone: "America/Denver",
      startDate: "2026-08-10",
      endDate: "2026-08-16"
    }),
    (error) => {
      assert(error instanceof EducationCenterDirectorSmokeFailure);
      assert.match(error.message, /^SERVER REMEDIATION PROMPT/);
      assert.match(error.message, /education_center_list_enrollments/);
      assert.match(error.message, /education_center_search_students/);
      assert.doesNotMatch(error.message, /private-live-key/);
      return true;
    }
  );
});

test("server error details containing PII never reach remediation output", async () => {
  const fetchImpl = async () => response({
    jsonrpc: "2.0",
    id: 1,
    error: {
      code: -32001,
      message: "Student Jane Example +1-303-555-0199 private-live-key"
    }
  }, 401);
  await assert.rejects(
    runEducationCenterDirectorSmoke({
      apiKey: "private-live-key",
      fetchImpl,
      timeZone: "America/Denver"
    }),
    (error) => {
      assert(error instanceof EducationCenterDirectorSmokeFailure);
      assert.match(error.message, /-32001/);
      assert.doesNotMatch(error.message, /Jane|303-555|private-live-key/);
      return true;
    }
  );
});

test("protocol mismatch fails before tool discovery", async () => {
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    return response({
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: "2024-11-05" }
    }, 200, { sessionId: "session-old" });
  };
  await assert.rejects(runEducationCenterDirectorSmoke({
    apiKey: "test-secret",
    fetchImpl,
    timeZone: "America/Denver"
  }), /MCP protocol negotiation/);
  assert.equal(requestCount, 1);
});

test("protocol output treats the server version as an untrusted scalar", async () => {
  const privateText = "Jane Student private-live-key family@example.com";
  const fetchImpl = async () => response({
    jsonrpc: "2.0",
    id: 1,
    result: { protocolVersion: privateText }
  });
  await assert.rejects(
    runEducationCenterDirectorSmoke({
      apiKey: "private-live-key",
      fetchImpl,
      timeZone: "America/Denver"
    }),
    (error) => {
      assert(error instanceof EducationCenterDirectorSmokeFailure);
      assert.doesNotMatch(error.message, /Jane|family@example|private-live-key/);
      assert.equal(error.report.initialize.protocolAccepted, false);
      return true;
    }
  );
});

test("failed initialized notification blocks the smoke", async () => {
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return response({
        jsonrpc: "2.0",
        id: body.id,
        result: { protocolVersion: "2025-03-26" }
      }, 200, { sessionId: "session-init" });
    }
    assert.equal(options.headers["Mcp-Session-Id"], "session-init");
    return response({
      jsonrpc: "2.0",
      error: { code: -32002, message: "provider detail" }
    }, 500);
  };
  await assert.rejects(runEducationCenterDirectorSmoke({
    apiKey: "test-secret",
    fetchImpl,
    timeZone: "America/Denver"
  }), /MCP initialized notification/);
});

test("a legitimate empty current-week enrollment array passes the query gate", async () => {
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return response({
        jsonrpc: "2.0",
        id: body.id,
        result: { protocolVersion: "2025-03-26" }
      }, 200, { sessionId: "session-empty" });
    }
    if (body.method === "notifications/initialized") return response(undefined, 202);
    if (body.method === "tools/list") return response({
      jsonrpc: "2.0",
      id: body.id,
      result: { tools: EDUCATION_CENTER_DIRECTOR_REQUIRED_TOOLS.map((name) => ({ name })) }
    });
    if (body.params?.name === "bos_get_context") return response({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        isError: false,
        structuredContent: { result: {
          installation_id: "present",
          org_id: "present",
          apps: [{ app_code: "lead_director", delegated_role_id: "director" }]
        } }
      }
    });
    return response({
      jsonrpc: "2.0",
      id: body.id,
      result: { isError: false, structuredContent: { result: [] } }
    });
  };
  const report = await runEducationCenterDirectorSmoke({
    apiKey: "test-secret",
    fetchImpl,
    timeZone: "America/Denver"
  });
  assert.equal(report.ok, true);
  assert.equal(report.dataQuality.campDataPresent, false);
});

function completeSmokeFetchForEnrollmentRecords(
  records,
  { contextIsError = false, enrollmentIsError = false } = {}
) {
  return async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") return response({
      jsonrpc: "2.0",
      id: body.id,
      result: { protocolVersion: "2025-03-26" }
    }, 200, { sessionId: "session-shape" });
    if (body.method === "notifications/initialized") return response(undefined, 202);
    if (body.method === "tools/list") return response({
      jsonrpc: "2.0",
      id: body.id,
      result: { tools: EDUCATION_CENTER_DIRECTOR_REQUIRED_TOOLS.map((name) => ({ name })) }
    });
    if (body.params?.name === "bos_get_context") return response({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        isError: contextIsError,
        structuredContent: { result: {
          installation_id: "present",
          org_id: "present",
          apps: [{ app_code: "lead_director", delegated_role_id: "director" }]
        } }
      }
    });
    return response({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        isError: enrollmentIsError,
        structuredContent: { result: records }
      }
    });
  };
}

test("tool-result output treats isError as an untrusted scalar", async () => {
  const privateText = "Jane Student private-live-key family@example.com";
  await assert.rejects(
    runEducationCenterDirectorSmoke({
      apiKey: "private-live-key",
      timeZone: "America/Denver",
      fetchImpl: completeSmokeFetchForEnrollmentRecords([], {
        contextIsError: privateText
      })
    }),
    (error) => {
      assert(error instanceof EducationCenterDirectorSmokeFailure);
      assert.doesNotMatch(error.message, /Jane|family@example|private-live-key/);
      assert.equal(error.report.context.toolResultSucceeded, false);
      return true;
    }
  );
});

test("camp fields present with empty provider values pass with a warning", async () => {
  const report = await runEducationCenterDirectorSmoke({
    apiKey: "test-secret",
    timeZone: "America/Denver",
    fetchImpl: completeSmokeFetchForEnrollmentRecords([{
      display_name: null,
      phone: null,
      attributes: { class_type: "Camp", class_name: "Summer Camp" }
    }])
  });
  assert.equal(report.ok, true);
  assert.equal(report.dataQuality.studentFieldSchemaPresent, true);
  assert.equal(report.dataQuality.familyPhoneFieldSchemaPresent, true);
  assert.equal(report.dataQuality.studentValuesPresent, false);
  assert.equal(report.dataQuality.familyPhoneValuesPresent, false);
  assert.match(report.dataQuality.warning, /incomplete provider values/);
});

test("camp records structurally missing student and phone fields fail", async () => {
  await assert.rejects(runEducationCenterDirectorSmoke({
    apiKey: "test-secret",
    timeZone: "America/Denver",
    fetchImpl: completeSmokeFetchForEnrollmentRecords([{
      attributes: { class_type: "Camp", class_name: "Summer Camp" }
    }])
  }), /camp records expose student and family-phone fields/);
});

test("unrecognized nonempty record shapes cannot pass as a seasonal result", async () => {
  await assert.rejects(runEducationCenterDirectorSmoke({
    apiKey: "test-secret",
    timeZone: "America/Denver",
    fetchImpl: completeSmokeFetchForEnrollmentRecords([{
      status: "unknown record shape"
    }])
  }), /enrollment records use the canonical class record shape/);
});

test("a malformed row cannot hide beside a canonical enrollment row", async () => {
  await assert.rejects(runEducationCenterDirectorSmoke({
    apiKey: "test-secret",
    timeZone: "America/Denver",
    fetchImpl: completeSmokeFetchForEnrollmentRecords([{
      display_name: null,
      phone: null,
      attributes: { class_type: "Class", class_name: "Robotics" }
    }, {
      status: "unknown record shape"
    }])
  }), /enrollment records use the canonical class record shape/);
});

test("every camp row must expose both student and family-phone keys", async () => {
  await assert.rejects(runEducationCenterDirectorSmoke({
    apiKey: "test-secret",
    timeZone: "America/Denver",
    fetchImpl: completeSmokeFetchForEnrollmentRecords([{
      display_name: null,
      phone: null,
      attributes: { class_type: "Camp", class_name: "Camp One" }
    }, {
      display_name: null,
      attributes: { class_type: "Camp", class_name: "Camp Two" }
    }])
  }), /camp records expose student and family-phone fields/);
});

test("every complete build and release workflow runs the credentialed data smoke", async () => {
  const packageJson = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url), "utf8"
  ));
  assert.match(packageJson.scripts.build, /smoke:mcp:education-center-data/);
  assert.doesNotMatch(packageJson.scripts.build, /smoke:mcp:video-ads/);
  assert.match(packageJson.scripts["release:check"], /npm run build/);
  for (const relativePath of [
    "../.github/workflows/validate.yml",
    "../.github/workflows/release-customer-zip.yml"
  ]) {
    const workflow = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(workflow, /npm run release:check/);
    assert.match(workflow, /EDUCATION_CENTER_BOS_API_KEY:\s*\$\{\{ secrets\.EDUCATION_CENTER_BOS_API_KEY \}\}/);
    assert.match(workflow, /EDUCATION_CENTER_SMOKE_TIME_ZONE:\s*\$\{\{ vars\.EDUCATION_CENTER_SMOKE_TIME_ZONE \}\}/);
  }
});
