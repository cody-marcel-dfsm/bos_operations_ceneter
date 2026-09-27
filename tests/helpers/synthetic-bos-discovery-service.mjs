import {createServer} from "node:http";

const schema = (properties = {}, required = []) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  properties,
  required,
  "x-bos-fields": []
});

const source = Object.freeze({
  platform: "bos",
  application: "lead-director",
  plugin: "synthetic-directory"
});

const limits = Object.freeze({
  max_targets: null,
  max_results_per_source: 5,
  pagination_supported: false,
  bulk_supported: false,
  streaming_supported: false,
  maximum_duration_seconds: 30,
  maximum_fan_out: 5
});

const guarantees = Object.freeze({
  read_consistency: "point_in_time",
  per_source_atomicity: "source_published",
  cross_source_atomicity: "not_applicable",
  convergence: "not_applicable",
  idempotency: "service_owned"
});

export function syntheticAppDescribe() {
  return {
    application: {platform: "bos", application: "lead-director"},
    describe: {
      contract_version: "lead-director-describe/v1",
      method: "POST",
      uri: "/bos/apps/lead-director/api/v1/organizations/{organization}/describe",
      max_operations: 5,
      operations: ["search", "create", "update", "delete", "calendar_read_event"]
    },
    journey_registration: {
      contract: {
        capability: "api.contract.get",
        input: {operation: "lead-director.journeys.register"}
      }
    },
    bosl: {
      schema_uri: `bos://apps/lead-director/bosl/${"a".repeat(32)}/schema`,
      reference_uri: `bos://apps/lead-director/bosl/${"a".repeat(32)}/reference`,
      examples_uri: `bos://apps/lead-director/bosl/${"a".repeat(32)}/examples`,
      descriptor_etag: "b".repeat(64)
    }
  };
}

export function syntheticOperationDescribe() {
  const inputSchema = schema({
    text: {type: "string", minLength: 1},
    source: {type: ["object", "null"]}
  }, ["text"]);
  const outputSchema = schema({records: {type: "array", maxItems: 5}}, ["records"]);
  const errorContract = {
    schema: "lead-director-public-error/v1",
    codes: [
      "invalid_search_request",
      "provider_authorization_required",
      "source_not_available",
      "source_temporarily_unavailable"
    ]
  };
  return {
    contract_version: "lead-director-describe/v1",
    metadata_version: "synthetic-metadata-v1",
    observed_at: "2026-09-19T18:00:00Z",
    operations: [{
      operation: "search",
      status: "described",
      effect: "read",
      limits: {...limits},
      guarantees: {...guarantees},
      execution: {
        context_header: "X-BOS-Context-Handle",
        method: "POST",
        uri: "/bos/apps/lead-director/api/v1/organizations/{organization}/search"
      },
      input_schema: inputSchema,
      output_schema: outputSchema,
      error_contract: errorContract,
      sources: [{
        source: {...source},
        availability: "ready",
        input_schema: inputSchema,
        output_schema: outputSchema,
        receipt_schema: schema({count: {type: "integer", minimum: 0}}, ["count"]),
        limits: {...limits},
        guarantees: {...guarantees},
        error_contract: errorContract
      }]
    },
    {operation: "create", status: "not_available"},
    {operation: "update", status: "not_available"},
    {operation: "delete", status: "not_available"},
    {operation: "calendar_read_event", status: "not_available"}]
  };
}

export function syntheticApiContract() {
  const inputSchema = schema({
    ended_after: {type: "string", format: "date-time"},
    ended_at_or_before: {type: "string", format: "date-time"},
    limit: {type: "integer", minimum: 1, maximum: 5}
  }, ["ended_after", "ended_at_or_before"]);
  return {
    operation: "calendar.events.search",
    contract_version: "1.0.0",
    source: {...source},
    bosl_server_node: false,
    title: "Search recent events",
    description: "Search a bounded event window through a discovered BOS operation.",
    permission: "calendar.events.read",
    input_schema: inputSchema,
    output_schema: schema({events: {type: "array", maxItems: 5}}, ["events"]),
    allowed_references: Object.fromEntries(
      Object.keys(inputSchema.properties).map((field) => [field, ["journey_input", "literal"]])
    ),
    effect: "read",
    approval: {required: false},
    limits: {...limits, max_targets: 1, maximum_fan_out: 1},
    guarantees: {...guarantees},
    execution: {
      context_header: "X-BOS-Context-Handle",
      method: "POST",
      transport: null,
      uri: "/bos/apps/lead-director/api/v1/organizations/{organization}/calendar/events/search"
    },
    retry_policy: {maximum_attempts: 2},
    receipt_schema: schema({count: {type: "integer", minimum: 0}}, ["count"]),
    public_errors: [{
      code: "invalid_time_window",
      message: "The event window is invalid.",
      retryable: false,
      http_status: 422,
      details_schema: {type: "array", items: {type: "object"}}
    }, {
      code: "provider_authorization_required",
      message: "The configured source requires authorization.",
      retryable: false,
      http_status: 403,
      details_schema: {type: "array", items: {type: "object"}}
    }, {
      code: "source_not_available",
      message: "The configured source is unavailable.",
      retryable: false,
      http_status: 503,
      details_schema: {type: "array", items: {type: "object"}}
    }, {
      code: "source_temporarily_unavailable",
      message: "The configured source is temporarily unavailable.",
      retryable: true,
      http_status: 503,
      details_schema: {type: "array", items: {type: "object"}}
    }],
    recovery: {
      goal: "reconnect_source",
      instruction: "Reconnect the configured source and retry.",
      operation: null,
      requires_user_approval: false,
      approval_scope: []
    },
    provenance: {kind: "installed_plugin"},
    readiness: {status: "ready", requirements: []},
    ttlMs: 0,
    cacheScope: "private"
  };
}

export async function startSyntheticBosDiscoveryService() {
  const routes = new Map([
    ["/discovery/app", syntheticAppDescribe],
    ["/discovery/operations", syntheticOperationDescribe],
    ["/discovery/contracts/calendar.events.search", syntheticApiContract]
  ]);
  const server = createServer((request, response) => {
    const payload = routes.get(new URL(request.url, "http://synthetic.invalid").pathname)?.();
    response.writeHead(payload ? 200 : 404, {"content-type": "application/json"});
    response.end(JSON.stringify(payload ?? {code: "not_found"}));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const {port} = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()))
  };
}

export async function fetchSyntheticDiscovery(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  assertSuccessfulResponse(response, path);
  return response.json();
}

function assertSuccessfulResponse(response, path) {
  if (!response.ok) throw new Error(`synthetic BOS discovery ${path} returned ${response.status}`);
}
