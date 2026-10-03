import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, {after} from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateApiContractResponse,
  validateAppDescribe,
  validateDiscoveryRefresh,
  validateOperationDescription,
  validatePluginsList,
  validateServiceJourneyDescription
} from "../source/platform/bos-app-discovery/scripts/validate-discovery.mjs";
import {
  fetchSyntheticDiscovery,
  startSyntheticBosDiscoveryService
} from "./helpers/synthetic-bos-discovery-service.mjs";

const syntheticBos = await startSyntheticBosDiscoveryService();
after(() => syntheticBos.close());
const appDescribe = await fetchSyntheticDiscovery(syntheticBos.baseUrl, "/discovery/app");
const describeResponse = await fetchSyntheticDiscovery(syntheticBos.baseUrl, "/discovery/operations");
const apiContractResponse = await fetchSyntheticDiscovery(
  syntheticBos.baseUrl,
  "/discovery/contracts/calendar.events.search"
);

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
      uri: "/bos/apps/lead-director/api/v1/organizations/synthetic/calendar/events/read"
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
      codes: ["invalid_request"]
    },
    sources: [{ source: plugin.reference, availability: "ready" }]
  }]
};

test("app.describe accepts authenticated BOSL resource links without authority data", () => {
  assert.equal(validateAppDescribe(appDescribe), appDescribe);
  const {journey_registration: _journeyRegistration, ...ordinaryDescribe} = appDescribe;
  assert.equal(validateAppDescribe(ordinaryDescribe), ordinaryDescribe);
  assert.deepEqual(appDescribe.journey_registration, {
    contract: {
      capability: "api.contract.get",
      input: {operation: "lead-director.journeys.register"}
    }
  });
  for (const journey_registration of [
    {contract: {capability: "other", input: {operation: "lead-director.journeys.register"}}},
    {contract: {capability: "api.contract.get", input: {operation: "other"}}},
    {contract: {capability: "api.contract.get", input: {operation: "lead-director.journeys.register", extra: true}}}
  ]) {
    assert.throws(
      () => validateAppDescribe({...appDescribe, journey_registration}),
      /journey_registration/
    );
  }
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

test("URL-backed synthetic BOS discovery satisfies every BOC consumer contract", () => {
  assert.equal(validateAppDescribe(appDescribe), appDescribe);
  assert.deepEqual(appDescribe.describe.operations, [
    "search",
    "create",
    "update",
    "delete",
    "calendar_read_event"
  ]);

  assert.equal(validateOperationDescription(describeResponse), describeResponse);
  assert.deepEqual(
    describeResponse.operations.map(({ operation }) => operation),
    appDescribe.describe.operations
  );
  assert.equal(
    validateApiContractResponse(apiContractResponse, {
      operation: "calendar.events.search",
      source: apiContractResponse.source
    }),
    apiContractResponse
  );

  const uppercaseDescription = structuredClone(describeResponse);
  uppercaseDescription.operations[0].error_contract.codes = ["INVALID_REQUEST"];
  assert.equal(
    validateOperationDescription(uppercaseDescription),
    uppercaseDescription
  );
  const uppercaseContract = structuredClone(apiContractResponse);
  uppercaseContract.public_errors[0].code = "INVALID_REQUEST";
  assert.equal(
    validateApiContractResponse(uppercaseContract, {
      operation: "calendar.events.search",
      source: uppercaseContract.source
    }),
    uppercaseContract
  );

  const invalidPublicCode = structuredClone(describeResponse);
  invalidPublicCode.operations[0].error_contract.codes = [`a${"a".repeat(128)}`];
  assert.throws(
    () => validateOperationDescription(invalidPublicCode),
    /error_contract|public error code/
  );
});

test("attachment discovery preserves bounded binary response contracts end to end", () => {
  const binaryResponse = {
    body: "binary",
    content_type: "provider",
    headers: [
      "Content-Disposition",
      "Content-Length",
      "Content-Type",
      "Digest",
      "X-Content-SHA256",
      "X-Correlation-ID"
    ]
  };
  const attachmentDescription = structuredClone(operationDescription);
  attachmentDescription.operations[0] = {
    ...attachmentDescription.operations[0],
    operation: "gmail_read_attachment",
    limits: {
      ...attachmentDescription.operations[0].limits,
      maximum_attachment_bytes: 25 * 1024 * 1024
    },
    execution: {
      ...attachmentDescription.operations[0].execution,
      response: binaryResponse
    },
    sources: [{
      ...describeResponse.operations[0].sources[0],
      limits: {
        ...describeResponse.operations[0].sources[0].limits,
        maximum_attachment_bytes: 25 * 1024 * 1024
      }
    }]
  };
  assert.equal(
    validateOperationDescription(attachmentDescription),
    attachmentDescription
  );

  const attachmentContract = structuredClone(apiContractResponse);
  Object.assign(attachmentContract, {
    operation: "gmail.attachments.read",
    permission: "gmail.threads.read",
    limits: {
      ...attachmentContract.limits,
      maximum_attachment_bytes: 25 * 1024 * 1024
    },
    execution: {
      ...attachmentContract.execution,
      uri: "/bos/apps/lead-director/api/v1/organizations/synthetic/gmail/attachments/read",
      response: binaryResponse
    },
    output_schema: {
      ...attachmentContract.output_schema,
      "x-bos-http-response": {
        body: "binary",
        content_type: "provider",
        headers: {
          filename: "Content-Disposition",
          mime_type: "Content-Type",
          size_bytes: "Content-Length",
          sha256: "X-Content-SHA256",
          digest: "Digest",
          correlation_id: "X-Correlation-ID"
        }
      }
    }
  });
  assert.equal(
    validateApiContractResponse(attachmentContract, {
      operation: "gmail.attachments.read",
      source: attachmentContract.source
    }),
    attachmentContract
  );

  const oversized = structuredClone(attachmentDescription);
  oversized.operations[0].limits.maximum_attachment_bytes = 25 * 1024 * 1024 + 1;
  assert.throws(
    () => validateOperationDescription(oversized),
    /maximum_attachment_bytes/
  );
  const incomplete = structuredClone(attachmentContract);
  incomplete.execution.response.headers.pop();
  assert.throws(
    () => validateApiContractResponse(incomplete, {
      operation: "gmail.attachments.read",
      source: incomplete.source
    }),
    /exact binary download headers/
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
  for (const link of contractLinks) {
    assert.match(link.input.operation, /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/u);
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
      status: "source_not_available",
      requirements: [{
        operation: serverContract.operation,
        status: "source_not_available",
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

test("identity-v2 HTTP execution requires the discovered static context header", () => {
  const expanded = {
    ...apiContractResponse,
    execution: {
      ...apiContractResponse.execution,
      context_header: "X-BOS-Context-Handle",
      transport: null
    }
  };
  assert.doesNotThrow(() => validateApiContractResponse(expanded, {
    operation: expanded.operation,
    source: expanded.source
  }));
  assert.throws(
    () => validateApiContractResponse({
      ...expanded,
      execution: { ...expanded.execution, context_header: "X-Authority" }
    }, {
      operation: expanded.operation,
      source: expanded.source
    }),
    /context_header must be X-BOS-Context-Handle/
  );
  assert.throws(
    () => validateApiContractResponse({
      ...expanded,
      execution: { ...expanded.execution, transport: "journey_runtime" }
    }, {
      operation: expanded.operation,
      source: expanded.source
    }),
    /exactly one HTTP or journey_runtime transport/
  );
});

test("api.contract.get rejects drift, private data, and contradictory node classification", () => {
  const withNodeType = { ...apiContractResponse, node_type: "server" };
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

test("service.describe accepts an event-driven automation behavior graph", () => {
  const behaviorPlugin = {
    ...plugin,
    reference: {
      ...plugin.reference,
      plugin: ["i", "code", "automated", "outreach"].join("-")
    },
    name: "Automated Outreach",
    purpose: "Respond to customer inquiry emails through automated outreach.",
    journey: {
      title: "Customer email to automated outreach",
      inputs: [],
      steps: [
        { code: "customer_email", type: "server", description: "A customer email arrives." },
        { code: "agent_call", type: "server", description: "The automated agent calls." },
        { code: "text_outreach", type: "server", description: "The customer receives a text." },
        { code: "email_outreach", type: "server", description: "The customer receives an email." }
      ],
      success: "Automated agent call; Automated text outreach; Automated email outreach"
    }
  };
  behaviorPlugin.describe = {
    capability: "service.describe",
    input: { service: behaviorPlugin.reference }
  };
  const behaviorDescription = {
    reference: behaviorPlugin.reference,
    name: behaviorPlugin.name,
    purpose: behaviorPlugin.purpose,
    descriptor_etag: behaviorPlugin.descriptor_etag,
    behavior: {
      title: behaviorPlugin.journey.title,
      entry: "customer_email",
      steps: [
        { code: "customer_email", title: "Customer email received", kind: "trigger", description: "A customer email arrives.", interfaces: ["Gmail"], next: ["agent_call", "text_outreach", "email_outreach"], terminal: false },
        { code: "agent_call", title: "Automated agent call", kind: "outreach", description: "The automated agent calls.", interfaces: ["Retell"], next: [], terminal: true },
        { code: "text_outreach", title: "Automated text outreach", kind: "outreach", description: "The customer receives a text.", interfaces: ["Twilio"], next: [], terminal: true },
        { code: "email_outreach", title: "Automated email outreach", kind: "outreach", description: "The customer receives an email.", interfaces: ["SendGrid"], next: [], terminal: true }
      ],
      outcomes: { completed: "Enabled channels contact the customer." }
    },
    queries: [],
    readiness: behaviorPlugin.readiness,
    ttlMs: 0,
    cacheScope: "private"
  };

  assert.equal(
    validateServiceJourneyDescription(behaviorDescription, behaviorPlugin),
    behaviorDescription
  );
  assert.throws(
    () => validateServiceJourneyDescription({
      ...behaviorDescription,
      journey: serviceDescription.journey
    }, behaviorPlugin),
    /exactly one journey or behavior/
  );
  assert.throws(
    () => validateServiceJourneyDescription(behaviorDescription, {
      ...behaviorPlugin,
      journey: {
        ...behaviorPlugin.journey,
        steps: behaviorPlugin.journey.steps.map((step, index) => (
          index === 0 ? { ...step, type: "client" } : step
        ))
      }
    }),
    /compact behavior steps must be server-owned/
  );
  assert.throws(
    () => validateServiceJourneyDescription({
      ...behaviorDescription,
      behavior: {
        ...behaviorDescription.behavior,
        steps: behaviorDescription.behavior.steps.map((step) => (
          step.code === "customer_email"
            ? { ...step, next: ["unknown_outcome"] }
            : step
        ))
      }
    }, behaviorPlugin),
    /unknown successor/
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
  assert.throws(
    () => validateOperationDescription({
      ...operationDescription,
      operations: [{
        ...operationDescription.operations[0],
        sources: [{
          source: operationDescription.operations[0].sources[0].source,
          availability: "ready",
          input_schema: operationDescription.operations[0].sources[0].input_schema
        }]
      }]
    }),
    /all source-specific contract fields together/
  );
  assert.throws(
    () => validateOperationDescription({
      ...operationDescription,
      operations: [{
        ...operationDescription.operations[0],
        sources: [{
          ...describeResponse.operations[0].sources[0],
          limits: {
            ...describeResponse.operations[0].sources[0].limits,
            maximum_fan_out: 0
          }
        }]
      }]
    }),
    /maximum_fan_out/
  );
});

test('advertised operation catalog can exceed unchanged Describe batch size',()=>{
 const response=structuredClone(appDescribe);
 response.describe.operations=['search','create','update','calendar_search_events','calendar_read_event','google-drive-context.files.search','google-drive-context.files.read','gmail.attachments.read'];
 assert.equal(response.describe.max_operations,5);
 assert.doesNotThrow(()=>validateAppDescribe(response));
 assert.throws(()=>validateAppDescribe({...response,describe:{...response.describe,operations:[...response.describe.operations,'search']}}),/unique/);
 assert.throws(()=>validateAppDescribe({...response,describe:{...response.describe,max_operations:8}}),/max_operations must be 5/);
 const oversized=structuredClone(describeResponse);oversized.operations=Array.from({length:6},()=>structuredClone(describeResponse.operations[0]));
 assert.throws(()=>validateOperationDescription(oversized));
});


test("complete returned contacts reject unresolved organization templates", () => {
  for (const coordinate of ["{organization}", "%7Borganization%7D"]) {
    const app=structuredClone(appDescribe);
    app.describe.uri=app.describe.uri.replace("/synthetic/",`/${coordinate}/`);
    assert.throws(() => validateAppDescribe(app), /describe.uri/);
    const response=structuredClone(describeResponse);
    response.operations[0].execution.uri=response.operations[0].execution.uri.replace("/synthetic/",`/${coordinate}/`);
    assert.throws(() => validateOperationDescription(response), /origin-relative URI/);
  }
});


test("operation source availability preserves current and archived states", () => {
  for (const availability of ["ready", "authorization_required", "configuration_required", "temporarily_unavailable", "provider_authorization_required", "source_not_available", "source_temporarily_unavailable"]) {
    const response = structuredClone(describeResponse);
    response.operations[0].sources[0].availability = availability;
    assert.equal(validateOperationDescription(response).operations[0].sources[0].availability, availability);
  }
  for (const availability of ["unknown", "Ready", "AUTHORIZATION_REQUIRED"]) {
    const response = structuredClone(describeResponse);
    response.operations[0].sources[0].availability = availability;
    assert.throws(() => validateOperationDescription(response), /availability is invalid/);
  }
});
