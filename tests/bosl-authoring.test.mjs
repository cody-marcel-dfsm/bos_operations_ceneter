import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExplainPlan,
  createRegistrationDocument,
  validateBoslDocument
} from "../source/platform/bos-workflow-orchestrator/scripts/bosl-authoring.mjs";
import {syntheticIdentity} from "../scripts/lib/synthetic-fixtures.mjs";

const syntheticAttendee = syntheticIdentity("journey-acceptance");

const publishedSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["identity", "name", "inputs", "entry", "nodes"],
  properties: {
    identity: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    inputs: { type: "object" },
    entry: { type: "string", minLength: 1 },
    nodes: { type: "array", minItems: 1 }
  },
  additionalProperties: false
};

const operationContracts = [
  {
    operation: "audience.materialize",
    bosl_server_node: true,
    node_type: "server",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    effect: "prepare",
    approval: { required: false },
    limits: { maximum_duration_seconds: 30, maximum_fan_out: 5 }
  },
  {
    operation: "campaign.send",
    bosl_server_node: true,
    node_type: "server",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    effect: "send_message",
    approval: { required: true },
    limits: { maximum_duration_seconds: 120, maximum_fan_out: 10 }
  }
];

const graph = {
  identity: "approved-fixture",
  name: "Approved fixture",
  inputs: {
    recipients: [{ email: syntheticAttendee.email }]
  },
  entry: "materialize",
  nodes: [
    {
      code: "materialize",
      type: "server",
      operation: "audience.materialize",
      max_visits: 2,
      inputs: { recipients: { from: "$journey.inputs.recipients" } },
      outputs: { audience: { type: "reference" } },
      next: "review"
    },
    {
      code: "review",
      type: "client",
      instruction: { goal: "review_campaign", message: "Review the campaign." },
      inputs: { audience: { from: "$nodes.materialize.outputs.audience" } },
      outputs: {
        approval: {
          type: "object",
          required: ["confirmed"],
          properties: { confirmed: { const: true } },
          additionalProperties: false
        }
      },
      next: "send"
    },
    {
      code: "send",
      type: "server",
      operation: "campaign.send",
      max_visits: 2,
      inputs: { approval: { from: "$nodes.review.outputs.approval" } },
      outputs: { successful_sends: { type: "integer", minimum: 0 } },
      transitions: {
        cases: [{
          when: {
            left: { from: "$outputs.successful_sends" },
            op: "gt",
            right: { value: 0 }
          },
          next: "done"
        }],
        default: "repair"
      },
      catch: {
        cases: [{
          when: {
            left: { from: "$error.code" },
            op: "eq",
            right: { value: "CAMPAIGN_RECIPIENTS_INVALID" }
          },
          next: "repair"
        }],
        default: "failed"
      }
    },
    {
      code: "repair",
      type: "client",
      max_visits: 1,
      instruction: { goal: "repair_audience", message: "Repair the audience." },
      inputs: {},
      outputs: {},
      next: "materialize"
    },
    {
      code: "done",
      type: "server",
      terminal: true,
      inputs: {},
      outputs: {}
    },
    {
      code: "failed",
      type: "server",
      terminal: true,
      inputs: {},
      outputs: {}
    }
  ]
};

test("published schema plus local graph checks accept bounded discovered BOSL", () => {
  const result = validateBoslDocument(graph, { publishedSchema, operationContracts });
  assert.equal(result.valid, true);
  assert.deepEqual(result.findings, []);
});

test("registration sends the raw document without client protocol metadata", () => {
  const registration = createRegistrationDocument(graph, {
    publishedSchema,
    operationContracts
  });
  assert.deepEqual(registration, graph);
  for (const key of [
    "language_version",
    "descriptor_etag",
    "idempotency_key",
    "execution_id",
    "revision",
    "digest"
  ]) {
    assert.equal(Object.hasOwn(registration, key), false);
  }
});

test("mixed ownership, undeclared operations, invalid transitions, and unbounded cycles fail", () => {
  const clientOperation = structuredClone(graph);
  clientOperation.nodes[1].operation = "campaign.send";
  assert.equal(validateBoslDocument(clientOperation, {
    publishedSchema,
    operationContracts
  }).valid, false);

  const serverInstruction = structuredClone(graph);
  serverInstruction.nodes[0].instruction = { goal: "unsafe", message: "unsafe" };
  assert.equal(validateBoslDocument(serverInstruction, {
    publishedSchema,
    operationContracts
  }).valid, false);

  const unknownOperation = structuredClone(graph);
  unknownOperation.nodes[0].operation = "invented.operation";
  assert.match(
    validateBoslDocument(unknownOperation, {
      publishedSchema,
      operationContracts
    }).findings.map(({ message }) => message).join("\n"),
    /not present in current discovery/
  );

  const missingDefault = structuredClone(graph);
  delete missingDefault.nodes[2].transitions.default;
  assert.match(
    validateBoslDocument(missingDefault, {
      publishedSchema,
      operationContracts
    }).findings.map(({ message }) => message).join("\n"),
    /default/
  );

  const unboundedCycle = structuredClone(graph);
  delete unboundedCycle.nodes[0].max_visits;
  delete unboundedCycle.nodes[2].max_visits;
  delete unboundedCycle.nodes[3].max_visits;
  assert.match(
    validateBoslDocument(unboundedCycle, {
      publishedSchema,
      operationContracts
    }).findings.map(({ message }) => message).join("\n"),
    /cycle.*max_visits/i
  );
});

test("every cycle crosses a bounded node while unbounded subcycles fail", () => {
  const bounded = structuredClone(graph);
  bounded.entry = "review";
  delete bounded.nodes[2].max_visits;
  delete bounded.nodes[3].max_visits;
  assert.equal(validateBoslDocument(bounded, {
    publishedSchema,
    operationContracts
  }).valid, true);

  const unboundedSubcycle = structuredClone(bounded);
  delete unboundedSubcycle.nodes[0].max_visits;
  unboundedSubcycle.nodes[3].next = "review";
  assert.match(
    validateBoslDocument(unboundedSubcycle, {
      publishedSchema,
      operationContracts
    }).findings.map(({ message }) => message).join("\n"),
    /cycle.*max_visits/i
  );
});

test("normalized caller authority selectors fail local validation", () => {
  for (const key of [
    "authority_context",
    "authorityContext",
    "authority-context",
    "organization.selector",
    "roleSelector"
  ]) {
    const document = structuredClone(graph);
    document.inputs[key] = { caller: "selected" };
    assert.match(
      validateBoslDocument(document, {
        publishedSchema,
        operationContracts
      }).findings.map(({ code }) => code).join("\n"),
      /BOSL_AUTHORITY_FIELD_FORBIDDEN/
    );
  }
});

test("operation contracts require the published duration and fan-out limits", () => {
  for (const limits of [
    { maximum_duration_seconds: 0, maximum_fan_out: 1 },
    { maximum_duration_seconds: 901, maximum_fan_out: 1 },
    { maximum_duration_seconds: 30, maximum_fan_out: 0 },
    { maximum_duration_seconds: 30, maximum_fan_out: 101 },
    { maximum_duration_seconds: 30 }
  ]) {
    const contracts = structuredClone(operationContracts);
    contracts[0].limits = limits;
    assert.match(
      validateBoslDocument(graph, {
        publishedSchema,
        operationContracts: contracts
      }).findings.map(({ code }) => code).join("\n"),
      /BOSL_OPERATION_LIMITS_INVALID/
    );
  }
  const duplicates = [
    ...operationContracts,
    structuredClone(operationContracts[0])
  ];
  assert.match(
    validateBoslDocument(graph, {
      publishedSchema,
      operationContracts: duplicates
    }).findings.map(({ code }) => code).join("\n"),
    /BOSL_OPERATION_DUPLICATE/
  );
  assert.throws(
    () => buildExplainPlan({
      objective: "Prepare and send a follow-up.",
      document: graph,
      operationContracts: [{
        ...operationContracts[0],
        limits: { maximum_duration_seconds: 0, maximum_fan_out: 5 }
      }]
    }),
    /published duration and fan-out limits/
  );
});

test("only explicitly sanctioned BOSL server-node operations may back server nodes", () => {
  for (const classification of [
    { bosl_server_node: false },
    { bosl_server_node: true },
    { bosl_server_node: true, node_type: "client" }
  ]) {
    const contracts = structuredClone(operationContracts);
    delete contracts[0].bosl_server_node;
    delete contracts[0].node_type;
    Object.assign(contracts[0], classification);
    const result = validateBoslDocument(graph, {
      publishedSchema,
      operationContracts: contracts
    });
    assert.equal(result.valid, false);
    assert.match(
      result.findings.map(({ code }) => code).join("\n"),
      /BOSL_OPERATION_NOT_SERVER_EXECUTABLE/
    );
    assert.throws(
      () => buildExplainPlan({
        objective: "Prepare and send a follow-up.",
        document: graph,
        operationContracts: contracts
      }),
      /sanctioned BOSL server-node classification/
    );
  }
});

test("explain plan reports ownership, effects, approvals, and recovery without chain of thought", () => {
  const plan = buildExplainPlan({
    objective: "Prepare and send a follow-up.",
    document: graph,
    operationContracts
  });
  assert.equal(plan.objective, "Prepare and send a follow-up.");
  assert.equal(plan.steps[0].owner, "server");
  assert.equal(plan.steps[1].owner, "client");
  assert.equal(plan.steps[2].approval_required, true);
  assert.deepEqual(plan.steps[2].limits, {
    maximum_duration_seconds: 120,
    maximum_fan_out: 10
  });
  assert.deepEqual(plan.steps[2].failure_targets, ["repair", "failed"]);
  assert.equal(Object.hasOwn(plan, "reasoning"), false);
});
