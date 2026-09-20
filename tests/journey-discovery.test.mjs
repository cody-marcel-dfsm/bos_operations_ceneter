import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import {
  validateApiContractResponse,
  validateAppDescribe,
  validateDiscoveryRefresh,
  validateOperationDescription,
  validatePluginsList,
  validateServiceJourneyDescription
} from "../source/platform/bos-app-discovery/scripts/validate-discovery.mjs";

const publicContractRoot = new URL(
  "./fixtures/public-contracts/lead-director/v1/",
  import.meta.url
);

async function readPublicContractFile(name, encoding = "utf8") {
  return readFile(new URL(name, publicContractRoot), encoding);
}

async function readPublicContractJson(name) {
  return JSON.parse(await readPublicContractFile(name));
}

function compilePublicSchema(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addFormat("date-time", {
    type: "string",
    validate: (value) => !Number.isNaN(Date.parse(value))
  });
  return ajv.compile(schema);
}

const appDescribe = await readPublicContractJson("app.describe.example.json");
const appDescribeSchema = await readPublicContractJson("app.describe.schema.json");
const apiContractRequest = await readPublicContractJson("api.contract.request.example.json");
const apiContractRequestSchema = await readPublicContractJson("api.contract.request.schema.json");
const apiContractResponse = await readPublicContractJson("api.contract.response.example.json");
const apiContractResponseSchema = await readPublicContractJson("api.contract.response.schema.json");
const describeRequest = await readPublicContractJson("describe.request.example.json");
const describeResponse = await readPublicContractJson("describe.response.example.json");
const describeResponseSchema = await readPublicContractJson("describe.response.schema.json");
const operationExamples = await readPublicContractJson("operation.examples.json");
const publicContractManifest = await readPublicContractJson("manifest.json");

const plugin = {
  reference: {
    platform: "bos",
    application: "lead-director",
    plugin: "message-service"
  },
  name: "Message Service",
  purpose: "Prepare, review, send, and report a message campaign.",
  journey: {
    title: "Send an approved campaign",
    inputs: ["audience", "template", "category"],
    steps: [
      { code: "prepare", type: "server", description: "Prepare the campaign" },
      { code: "review", type: "client", description: "Review the campaign" },
      { code: "send", type: "server", description: "Send the campaign" },
      { code: "show_result", type: "client", description: "Show the result" },
      { code: "completed", type: "server", description: "Complete the journey" }
    ],
    success: "At least one message was sent."
  },
  describe: {
    capability: "service.describe",
    input: {
      service: {
        platform: "bos",
        application: "lead-director",
        plugin: "message-service"
      }
    }
  },
  descriptor_etag: "plugin-current-1",
  readiness: {
    status: "ready",
    requirements: []
  }
};

const serviceDescription = {
  reference: plugin.reference,
  name: plugin.name,
  purpose: plugin.purpose,
  descriptor_etag: plugin.descriptor_etag,
  journey: {
    title: plugin.journey.title,
    entry: "prepare",
    inputs: {
      audience: { type: "reference", required: true },
      template: { type: "reference", required: true },
      category: { type: "string", required: true }
    },
    limits: { maximum_recipients: 10 },
    required_authority: {
      plugin_enabled: true,
      authenticated_user_access: true
    },
    steps: [
      {
        code: "prepare",
        title: "Prepare the campaign",
        type: "server",
        operation: "message-service.campaign.prepare",
        effect: "prepare_external_send",
        inputs: { category: { type: "string" } },
        outputs: { campaign: { type: "reference" } },
        contract: {
          capability: "api.contract.get",
          input: { operation: "message-service.campaign.prepare" }
        },
        approval: { required: false },
        limits: { maximum_duration_seconds: 30, maximum_fan_out: 5 },
        public_errors: [],
        next: "review"
      },
      {
        code: "review",
        title: "Review the campaign",
        type: "client",
        instruction: { goal: "review_campaign", message: "Review the campaign." },
        inputs: { campaign: { type: "reference" } },
        outputs: { approval: { type: "object" } },
        next: "send"
      },
      {
        code: "send",
        title: "Send the campaign",
        type: "server",
        operation: "message-service.campaign.send",
        effect: "send_external_message",
        inputs: { approval: { type: "object" } },
        outputs: { successful_sends: { type: "integer" } },
        contract: {
          capability: "api.contract.get",
          input: { operation: "message-service.campaign.send" }
        },
        approval: { required: true },
        limits: { maximum_duration_seconds: 120, maximum_fan_out: 10 },
        public_errors: [],
        next: "show_result"
      },
      {
        code: "show_result",
        title: "Show the result",
        type: "client",
        instruction: { goal: "show_result", message: "Show the result." },
        inputs: { successful_sends: { type: "integer" } },
        outputs: {},
        next: "completed"
      },
      {
        code: "completed",
        title: "Complete the journey",
        type: "server",
        inputs: {},
        outputs: {},
        terminal: true
      }
    ],
    outcomes: { completed: "At least one message was sent." },
    public_errors: {}
  },
  queries: [
    {
      operation: "message-service.campaign.status",
      purpose: "Read campaign status.",
      contract: {
        capability: "api.contract.get",
        input: { operation: "message-service.campaign.status" }
      }
    }
  ],
  readiness: { status: "ready", requirements: [] }
};

const operationDescription = {
  contract_version: "lead-director-describe/v1",
  metadata_version: "fixture-v1",
  observed_at: "2026-09-19T18:00:00Z",
  operations: [{
    operation: "calendar_read_event",
    status: "described",
    effect: "read",
    limits: {
      max_targets: 1,
      max_results_per_source: 1,
      pagination_supported: false,
      bulk_supported: false,
      streaming_supported: false,
      maximum_duration_seconds: 30,
      maximum_fan_out: 1
    },
    guarantees: {
      read_consistency: "point_in_time",
      per_source_atomicity: "source_published",
      cross_source_atomicity: "not_applicable",
      convergence: "not_applicable",
      idempotency: "service_owned"
    },
    execution: {
      method: "POST",
      uri: "/bos/apps/lead-director/api/v1/organizations/{organization}/calendar/events/read"
    },
    input_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      "x-bos-fields": []
    },
    output_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      "x-bos-fields": []
    },
    error_contract: {
      schema: "lead-director-public-error/v1",
      codes: ["INVALID_REQUEST"]
    },
    sources: [{ source: plugin.reference, availability: "ready" }]
  }]
};

test("app.describe accepts authenticated BOSL resource links without authority data", () => {
  assert.equal(validateAppDescribe(appDescribe), appDescribe);
  assert.throws(
    () => validateAppDescribe({
      ...appDescribe,
      bosl: { ...appDescribe.bosl, schema_uri: "file:///tmp/schema.json" }
    }),
    /partitioned Lead Director BOSL schema URI/
  );
  assert.throws(
    () => validateAppDescribe({ ...appDescribe, organization_id: "org-private" }),
    /raw authority/
  );
  assert.throws(
    () => validateAppDescribe({ ...appDescribe, organizationId: "org-private" }),
    /raw authority/
  );
  assert.throws(
    () => validateAppDescribe({
      ...appDescribe,
      bosl: {
        ...appDescribe.bosl,
        reference_uri: "bos://apps/lead-director/bosl/cccccccccccccccccccccccccccccccc/reference"
      }
    }),
    /shared partition/
  );
  assert.throws(
    () => validateAppDescribe({
      ...appDescribe,
      bosl: { ...appDescribe.bosl, descriptor_etag: "opaque-current-bosl-token" }
    }),
    /64-hex digest/
  );
});

test("archived BOS public release is byte-intact and every advertised operation conforms", async () => {
  assert.equal(publicContractManifest.bundle_sha256, "96b222b222aa2e71e359f9e0427cfbb5567be77152afdfc82d131277c75c45de");
  assert.equal(publicContractManifest.auth_impact, "none");
  assert.deepEqual(
    publicContractManifest.files.map(({ path }) => path),
    [
      "api.contract.request.example.json",
      "api.contract.request.schema.json",
      "api.contract.response.example.json",
      "api.contract.response.schema.json",
      "app.describe.example.json",
      "app.describe.schema.json",
      "describe.request.example.json",
      "describe.response.example.json",
      "describe.response.schema.json",
      "operation.examples.json"
    ]
  );

  const bundleParts = [];
  for (const entry of publicContractManifest.files) {
    const payload = await readPublicContractFile(entry.path, null);
    const digest = createHash("sha256").update(payload).digest("hex");
    assert.equal(digest, entry.sha256, entry.path);
    bundleParts.push(Buffer.from(`${entry.path}\0`, "utf8"), Buffer.from(entry.sha256, "hex"));
  }
  assert.equal(
    createHash("sha256").update(Buffer.concat(bundleParts)).digest("hex"),
    publicContractManifest.bundle_sha256
  );

  const validateAppDescribeSchema = compilePublicSchema(appDescribeSchema);
  assert.equal(validateAppDescribeSchema(appDescribe), true, JSON.stringify(validateAppDescribeSchema.errors));
  assert.equal(validateAppDescribe(appDescribe), appDescribe);
  assert.deepEqual(describeRequest.operations, appDescribe.describe.operations);
  assert.deepEqual(describeRequest.operations, [
    "search",
    "create",
    "update",
    "delete",
    "calendar_read_event"
  ]);

  const validateDescribeResponse = compilePublicSchema(describeResponseSchema);
  assert.equal(validateDescribeResponse(describeResponse), true, JSON.stringify(validateDescribeResponse.errors));
  assert.equal(validateOperationDescription(describeResponse), describeResponse);
  assert.deepEqual(
    describeResponse.operations.map(({ operation }) => operation),
    describeRequest.operations
  );

  for (const operation of describeResponse.operations) {
    if (operation.status === "not_available") {
      assert.equal(operationExamples[operation.operation], undefined);
      continue;
    }
    const example = operationExamples[operation.operation];
    assert.ok(example, `missing example for ${operation.operation}`);
    assert.equal(operationExamples.routes[operation.operation], operation.execution.uri);
    const validateInput = compilePublicSchema(operation.input_schema);
    const validateOutput = compilePublicSchema(operation.output_schema);
    assert.equal(validateInput(example.request), true, JSON.stringify(validateInput.errors));
    assert.equal(validateOutput(example.response), true, JSON.stringify(validateOutput.errors));
  }

  const validateApiContractRequest = compilePublicSchema(apiContractRequestSchema);
  const validateApiContractResponseSchema = compilePublicSchema(apiContractResponseSchema);
  assert.equal(
    validateApiContractRequest(apiContractRequest),
    true,
    JSON.stringify(validateApiContractRequest.errors)
  );
  assert.equal(
    validateApiContractResponseSchema(apiContractResponse),
    true,
    JSON.stringify(validateApiContractResponseSchema.errors)
  );
  assert.equal(
    validateApiContractResponse(apiContractResponse, {
      operation: apiContractRequest.operation,
      source: apiContractResponse.source
    }),
    apiContractResponse
  );
});

test("api.contract.get response preserves current contract and BOSL classification", () => {
  const serverContract = {
    ...apiContractResponse,
    operation: "message-service.campaign.prepare",
    source: plugin.reference,
    bosl_server_node: true,
    node_type: "server"
  };
  assert.equal(
    validateApiContractResponse(serverContract, {
      operation: "message-service.campaign.prepare",
      source: plugin.reference
    }),
    serverContract
  );

  const contractLinks = [
    ...serviceDescription.journey.steps
      .filter(({ contract }) => contract)
      .map(({ contract }) => contract),
    ...serviceDescription.queries.map(({ contract }) => contract)
  ];
  const validateApiContractRequest = compilePublicSchema(apiContractRequestSchema);
  for (const link of contractLinks) {
    assert.equal(validateApiContractRequest(link.input), true);
    const response = {
      ...serverContract,
      operation: link.input.operation
    };
    assert.equal(
      validateApiContractResponse(response, {
        operation: link.input.operation,
        source: plugin.reference
      }),
      response
    );
  }

  const unready = {
    ...serverContract,
    readiness: {
      status: "configuration_required",
      requirements: [{
        operation: serverContract.operation,
        status: "configuration_required",
        requirements: { category: "required" },
        recovery: {
          goal: "configure_campaign",
          instruction: "Configure the campaign and request the contract again.",
          operation: null,
          requires_user_approval: false,
          approval_scope: []
        }
      }]
    }
  };
  assert.equal(
    validateApiContractResponse(unready, {
      operation: unready.operation,
      source: plugin.reference
    }),
    unready
  );
});

test("api.contract.get rejects drift, private data, and contradictory node classification", () => {
  const validateApiContractResponseSchema = compilePublicSchema(apiContractResponseSchema);
  const withNodeType = { ...apiContractResponse, node_type: "server" };
  assert.equal(validateApiContractResponseSchema(withNodeType), false);
  assert.throws(
    () => validateApiContractResponse(withNodeType, {
      operation: apiContractResponse.operation
    }),
    /node_type must be absent/
  );

  const missingNodeType = {
    ...apiContractResponse,
    bosl_server_node: true
  };
  assert.equal(validateApiContractResponseSchema(missingNodeType), false);
  assert.throws(
    () => validateApiContractResponse(missingNodeType, {
      operation: apiContractResponse.operation
    }),
    /node_type must be server/
  );
  assert.throws(
    () => validateApiContractResponse(apiContractResponse, {
      operation: "calendar.events.read"
    }),
    /must match the requested contract link/
  );
  assert.throws(
    () => validateApiContractResponse({
      ...apiContractResponse,
      provenance: {
        ...apiContractResponse.provenance,
        installed_app_id: "private-installation"
      }
    }),
    /raw authority|credential identifier/
  );
  assert.throws(
    () => validateApiContractResponse({
      ...apiContractResponse,
      allowed_references: {
        ...apiContractResponse.allowed_references,
        extra: ["literal"]
      }
    }),
    /cover every input property exactly/
  );
  assert.throws(
    () => validateApiContractResponse({
      ...apiContractResponse,
      ttlMs: 1000
    }),
    /fresh private MCP data/
  );
  for (const invalidInputSchema of [
    {
      ...apiContractResponse.input_schema,
      required: "not-an-array"
    },
    {
      ...apiContractResponse.input_schema,
      properties: {
        ...apiContractResponse.input_schema.properties,
        limit: { type: 7 }
      }
    }
  ]) {
    assert.throws(
      () => validateApiContractResponse({
        ...apiContractResponse,
        input_schema: invalidInputSchema
      }),
      /valid Draft 2020-12 JSON Schema/
    );
  }
  assert.throws(
    () => validateApiContractResponse({
      ...apiContractResponse,
      public_errors: [{
        ...apiContractResponse.public_errors[0],
        details_schema: {
          type: "array",
          items: { type: 7 }
        }
      }]
    }),
    /valid Draft 2020-12 JSON Schema/
  );
  for (const unsafeProvenance of [
    { provider: { error: "raw upstream diagnostic" } },
    { provider: { nested: { message: "raw upstream message" } } },
    { providerError: "raw upstream diagnostic" },
    { provider_error: "raw upstream diagnostic" },
    { "provider-error": "raw upstream diagnostic" },
    { "provider.error": "raw upstream diagnostic" }
  ]) {
    assert.throws(
      () => validateApiContractResponse({
        ...apiContractResponse,
        provenance: {
          ...apiContractResponse.provenance,
          ...unsafeProvenance
        }
      }),
      /raw authority|credential identifier/
    );
  }
});

test("published BOS ZIP runs api.contract.get validation without repository dependencies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-api-contract-package-"));
  try {
    const archive = fileURLToPath(
      new URL("../products/bos/openai/bos-skills.zip", import.meta.url)
    );
    const extracted = spawnSync("unzip", ["-q", archive, "-d", directory], {
      encoding: "utf8"
    });
    assert.equal(extracted.status, 0, extracted.stderr);

    const validator = join(
      directory,
      "bos-app-discovery/scripts/validate-discovery.mjs"
    );
    const invoke = (response) => spawnSync(
      process.execPath,
      [validator, "api-contract"],
      {
        cwd: directory,
        encoding: "utf8",
        input: JSON.stringify({
          response,
          operation: response.operation,
          source: response.source
        })
      }
    );

    const accepted = invoke(apiContractResponse);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.deepEqual(JSON.parse(accepted.stdout), {
      valid: true,
      kind: "api-contract"
    });

    const rejected = invoke({
      ...apiContractResponse,
      input_schema: {
        ...apiContractResponse.input_schema,
        required: "not-an-array"
      }
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /valid Draft 2020-12 JSON Schema/);
    assert.doesNotMatch(rejected.stderr, /ERR_MODULE_NOT_FOUND|Cannot find package/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("plugins.list keeps accessibility separate from readiness and copies Describe input", () => {
  const result = validatePluginsList({
    application: appDescribe.application,
    plugins: [plugin]
  });
  assert.equal(result.plugins[0], plugin);
  assert.deepEqual(plugin.describe.input.service, plugin.reference);

  assert.throws(
    () => validatePluginsList({
      application: appDescribe.application,
      plugins: [{
        ...plugin,
        describe: {
          ...plugin.describe,
          input: { service: { ...plugin.reference, plugin: "another-service" } }
        }
      }]
    }),
    /exact plugin reference/
  );
  assert.throws(
    () => validatePluginsList({
      application: appDescribe.application,
      plugins: [{ ...plugin, provider: "sendgrid" }]
    }),
    /undeclared field|provider/i
  );
  assert.throws(
    () => validatePluginsList({
      application: appDescribe.application,
      plugins: [{
        ...plugin,
        reference: { ...plugin.reference, application: "another-app" },
        describe: {
          ...plugin.describe,
          input: {
            service: { ...plugin.reference, application: "another-app" }
          }
        }
      }]
    }),
    /same application/
  );
});

test("discovery.refresh reissues one coherent private app snapshot", () => {
  const refresh = {
    application: appDescribe.application,
    bosl: appDescribe.bosl,
    plugins: [plugin],
    ttlMs: 0,
    cacheScope: "private"
  };
  assert.equal(validateDiscoveryRefresh(refresh), refresh);
  assert.throws(
    () => validateDiscoveryRefresh({ ...refresh, cacheScope: "public" }),
    /cacheScope must be private/
  );
});

test("service.describe agrees with the compact journey and declares each server operation", () => {
  assert.equal(
    validateServiceJourneyDescription(serviceDescription, plugin),
    serviceDescription
  );
  assert.throws(
    () => validateServiceJourneyDescription({
      ...serviceDescription,
      journey: {
        ...serviceDescription.journey,
        steps: serviceDescription.journey.steps.slice(0, 4)
      }
    }, plugin),
    /compact journey steps/
  );
  assert.throws(
    () => validateServiceJourneyDescription({
      ...serviceDescription,
      journey: {
        ...serviceDescription.journey,
        steps: serviceDescription.journey.steps.map((step) => (
          step.code === "send"
            ? { ...step, contract: { ...step.contract, input: { operation: "wrong.operation" } } }
            : step
        ))
      }
    }, plugin),
    /must match the semantic operation/
  );
  assert.throws(
    () => validateServiceJourneyDescription({
      ...serviceDescription,
      journey: { ...serviceDescription.journey, title: "Different journey" }
    }, plugin),
    /compact journey title/
  );
  assert.throws(
    () => validateServiceJourneyDescription({
      ...serviceDescription,
      journey: {
        ...serviceDescription.journey,
        inputs: { unexpected: { type: "string" } }
      }
    }, plugin),
    /compact journey inputs/
  );
  assert.throws(
    () => validateServiceJourneyDescription({
      ...serviceDescription,
      journey: {
        ...serviceDescription.journey,
        steps: serviceDescription.journey.steps.map((step) => (
          step.code === "prepare"
            ? { ...step, limits: { maximum_duration_seconds: 0, maximum_fan_out: 5 } }
            : step
        ))
      }
    }, plugin),
    /maximum_duration_seconds/
  );
  assert.throws(
    () => validateServiceJourneyDescription({
      ...serviceDescription,
      queries: [{
        ...serviceDescription.queries[0],
        contract: {
          ...serviceDescription.queries[0].contract,
          input: { operation: "wrong.operation" }
        }
      }]
    }, plugin),
    /must match the semantic operation/
  );
});

test("operation Describe validates exact execution contracts and bounded runtime limits", () => {
  assert.equal(validateOperationDescription(operationDescription), operationDescription);
  assert.throws(
    () => validateOperationDescription({
      ...operationDescription,
      operations: operationDescription.operations.map((operation) => ({
        ...operation,
        limits: { ...operation.limits, maximum_fan_out: 0 }
      }))
    }),
    /maximum_fan_out/
  );
  assert.throws(
    () => validateOperationDescription({
      ...operationDescription,
      operations: operationDescription.operations.map((operation) => ({
        ...operation,
        execution: { ...operation.execution, uri: "https://provider.example/read" }
      }))
    }),
    /origin-relative URI/
  );
  assert.throws(
    () => validateOperationDescription({
      ...operationDescription,
      operations: operationDescription.operations.map((operation) => ({
        ...operation,
        sources: [{
          ...operation.sources[0],
          providerId: "private-provider"
        }]
      }))
    }),
    /raw authority|credential identifier/
  );
  for (const limits of [
    { ...operationDescription.operations[0].limits, max_targets: 0 },
    { ...operationDescription.operations[0].limits, bulk_supported: "false" }
  ]) {
    assert.throws(
      () => validateOperationDescription({
        ...operationDescription,
        operations: [{ ...operationDescription.operations[0], limits }]
      }),
      /limits/
    );
  }
  assert.throws(
    () => validateOperationDescription({
      ...operationDescription,
      operations: [{
        ...operationDescription.operations[0],
        guarantees: {
          ...operationDescription.operations[0].guarantees,
          idempotency: "client_owned"
        }
      }]
    }),
    /idempotency/
  );
  assert.throws(
    () => validateOperationDescription({
      ...operationDescription,
      operations: [{
        ...operationDescription.operations[0],
        input_schema: { type: "object" }
      }]
    }),
    /draft 2020-12/
  );
  assert.throws(
    () => validateOperationDescription({
      ...operationDescription,
      operations: [{
        ...operationDescription.operations[0],
        sources: [{ ...operationDescription.operations[0].sources[0], availability: "unknown" }]
      }]
    }),
    /availability/
  );
});
