import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, {after} from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  resolveProductSkills,
  root,
  transformProductSkillGuidance
} from "../scripts/lib/package-model.mjs";
import {
  fetchSyntheticDiscovery,
  startSyntheticBosDiscoveryService
} from "./helpers/synthetic-bos-discovery-service.mjs";

const run = promisify(execFile);
const syntheticBos = await startSyntheticBosDiscoveryService();
after(() => syntheticBos.close());

const generatedRoots = [
  `${root}/clients/codex/plugins/bos/skills`,
  `${root}/clients/claude/plugins/bos/skills`,
  `${root}/clients/copilot/products/bos/skills`,
  `${root}/clients/gemini/extensions/bos/skills`
];

const educationCenterRoots = [
  `${root}/clients/codex/plugins/education-center/skills`,
  `${root}/clients/claude/plugins/education-center/skills`,
  `${root}/clients/copilot/products/education-center/skills`,
  `${root}/clients/copilot/skills`,
  `${root}/clients/gemini/extensions/education-center/skills`
];

test("generated Codex adapter invokes the bounded Gmail attachment contract", async () => {
  const generatedAdapter = await import(pathToFileURL(join(
    generatedRoots[0],
    "bos-external-dependency-adapter",
    "scripts",
    "external-dependency-adapter.mjs"
  )));
  const requests = [];
  const contextHandle = `bos_ctx_v2_${"d".repeat(64)}`;
  const contact = {
    operation: "gmail_read_attachment",
    status: "described",
    effect: "read",
    limits: {
      max_targets: 1,
      max_results_per_source: 1,
      pagination_supported: false,
      bulk_supported: false,
      streaming_supported: true,
      maximum_attachment_bytes: 25 * 1024 * 1024,
      maximum_duration_seconds: 30,
      maximum_fan_out: 1
    },
    guarantees: {
      read_consistency: "provider_current",
      per_source_atomicity: "source_published",
      cross_source_atomicity: "not_applicable",
      convergence: "not_applicable",
      idempotency: "service_owned"
    },
    execution: {
      method: "POST",
      uri: "/bos/apps/lead-director/api/v1/organizations/current/gmail/attachments/read",
      context_header: "X-BOS-Context-Handle",
      response: {
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
      }
    },
    input_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["thread_id", "message_id", "attachment_id"],
      properties: {
        thread_id: {type: "string", minLength: 1},
        message_id: {type: "string", minLength: 1},
        attachment_id: {type: "string", minLength: 1}
      },
      "x-bos-fields": []
    },
    output_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      "x-bos-fields": []
    },
    error_contract: {
      schema: "lead-director-public-error/v1",
      codes: ["INVALID_REQUEST", "ATTACHMENT_TOO_LARGE"]
    },
    sources: [{
      source: {platform: "bos", application: "lead-director", plugin: "gmail"},
      availability: "ready"
    }]
  };
  const payload = {
    thread_id: "thread-1",
    message_id: "message-1",
    attachment_id: "attachment-1"
  };
  const adapter = generatedAdapter.createBosExternalDependencyAdapter({
    hostTransport: {
      captureExecutionScope: async () => async () => true,
      verifyExecutionIntent: async () => true,
      getProtectedResource: async () => "https://dfsm.ai/mcp/apps/bos/platform",
      request: async (request) => {
        requests.push(structuredClone(request));
        return {
          status: 200,
          headers: {
            "Content-Disposition": 'attachment; filename="quote.pdf"',
            "Content-Length": "4",
            "Content-Type": "application/pdf",
            Digest: "sha-256=synthetic-digest",
            "X-Content-SHA256": "synthetic-sha256",
            "X-Correlation-ID": "corr-attachment-1"
          },
          body: new Uint8Array([37, 80, 68, 70])
        };
      },
      recoverAuthentication: async () => ({status: "READY"})
    },
    contextProvider: {
      getExecutionContextHeader: async () => "X-BOS-Context-Handle",
      getCurrentContext: async () => ({
        contract_version: "bos-identity-mcp/v2",
        context: {
          context_handle: contextHandle,
          organization_name: "Example Organization",
          application_name: "Lead Director",
          installation_name: "Primary",
          role_label: "Operator",
          is_default: true
        }
      })
    }
  });
  const response = await adapter.invokeDiscoveredOperation(contact, payload);
  assert.equal(response.status, 200);
  assert.deepEqual([...response.body], [37, 80, 68, 70]);
  assert.deepEqual(response.headers, {
    "content-disposition": 'attachment; filename="quote.pdf"',
    "content-length": "4",
    "content-type": "application/pdf",
    digest: "sha-256=synthetic-digest",
    "x-content-sha256": "synthetic-sha256",
    "x-correlation-id": "corr-attachment-1"
  });
  assert.deepEqual(requests, [{
    method: "POST",
    href: contact.execution.uri,
    headers: {
      "content-type": "application/json",
      "X-BOS-Context-Handle": contextHandle
    },
    body: JSON.stringify(payload)
  }]);
});

test("BOS composes journey orchestration, discovery, cache maintenance, and visual output", async () => {
  const product = JSON.parse(await readFile(`${root}/products/bos/product.json`, "utf8"));
  for (const include of [
    "platform/bos-workflow-orchestrator",
    "platform/bos-external-dependency-adapter",
    "platform/bos-app-discovery",
    "platform/bos-mcp-client",
    "platform/bos-cache-maintenance",
    "platform/bos-visual-output"
  ]) {
    assert(product.includes.includes(include), include);
  }
  const skills = await resolveProductSkills(product);
  const orchestrator = skills.find(({ name }) => name === "bos-workflow-orchestrator");
  const mcpClient = skills.find(({ name }) => name === "bos-mcp-client");
  assert(orchestrator);
  assert(mcpClient);

  const canonicalOrchestrator = await readFile(`${orchestrator.sourcePath}/SKILL.md`, "utf8");
  for (const generatedRoot of generatedRoots) {
    assert.equal(
      await readFile(`${generatedRoot}/bos-workflow-orchestrator/SKILL.md`, "utf8"),
      transformProductSkillGuidance(product, "bos-workflow-orchestrator", canonicalOrchestrator)
    );
    for (const privateScript of ["document-cache.mjs", "journey-contract-cache.mjs"]) {
      await assert.rejects(
        readFile(`${generatedRoot}/bos-mcp-client/scripts/${privateScript}`, "utf8"),
        (error) => error?.code === "ENOENT",
        `${generatedRoot}/${privateScript}`
      );
    }
    for (const script of [
      "bosl-authoring.mjs",
      "journey-presentation.mjs",
      "journey-runtime-client.mjs"
    ]) {
      assert.equal(
        await readFile(`${generatedRoot}/bos-workflow-orchestrator/scripts/${script}`, "utf8"),
        await readFile(`${orchestrator.sourcePath}/scripts/${script}`, "utf8")
      );
    }
    for (const reference of [
      "bosl-authoring.md",
      "journey-lifecycle.md",
      "client-instructions.md",
      "canonical-walkthrough.md"
    ]) {
      assert.equal(
        await readFile(`${generatedRoot}/bos-workflow-orchestrator/references/${reference}`, "utf8"),
        await readFile(`${orchestrator.sourcePath}/references/${reference}`, "utf8")
      );
    }
  }
});

test("BOS alone packages the external dependency adapter seam", async () => {
  const canonicalRoot = `${root}/source/platform/bos-external-dependency-adapter`;
  const canonicalSkill = await readFile(`${canonicalRoot}/SKILL.md`, "utf8");
  const canonicalScript = await readFile(
    `${canonicalRoot}/scripts/external-dependency-adapter.mjs`,
    "utf8"
  );
  const canonicalDiscoveredOperationSchema = await readFile(
    `${canonicalRoot}/scripts/discovered-operation-request.schema.mjs`,
    "utf8"
  );
  for (const generatedRoot of generatedRoots) {
    assert.equal(
      await readFile(`${generatedRoot}/bos-external-dependency-adapter/SKILL.md`, "utf8"),
      transformProductSkillGuidance(
        JSON.parse(await readFile(`${root}/products/bos/product.json`, "utf8")),
        "bos-external-dependency-adapter",
        canonicalSkill
      )
    );
    assert.equal(
      await readFile(
        `${generatedRoot}/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs`,
        "utf8"
      ),
      canonicalScript
    );
    assert.equal(
      await readFile(
        `${generatedRoot}/bos-external-dependency-adapter/scripts/discovered-operation-request.schema.mjs`,
        "utf8"
      ),
      canonicalDiscoveredOperationSchema
    );
  }
  for (const generatedRoot of educationCenterRoots) {
    await assert.rejects(
      readFile(`${generatedRoot}/bos-external-dependency-adapter/SKILL.md`, "utf8"),
      (error) => error?.code === "ENOENT",
      generatedRoot
    );
  }
});

test("every generated dependency adapter preserves null errors and rejects incomplete composed errors", async () => {
  const stateAction = {
    verb: "state",
    method: "GET",
    href: "/bos/api/v1/journeys/generated-parity",
    payload_schema: null
  };
  const successful = {
    status: 201,
    body: {
      id: "contact-synthetic-1",
      created: true,
      error: null,
      source_results: [{source: "crm", error: null}]
    }
  };

  for (const generatedRoot of generatedRoots) {
    const moduleUrl = pathToFileURL(
      `${generatedRoot}/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs`
    );
    const {createBosExternalDependencyAdapter} = await import(moduleUrl);
    const createAdapter = (request) => createBosExternalDependencyAdapter({
      hostTransport: {
      captureExecutionScope: async () => async () => true,
      verifyExecutionIntent: async () => true,
        request,
        recoverAuthentication: async () => {
          throw new Error("recovery must not run");
        },
        getProtectedResource: async () => "https://dfsm.ai/mcp/apps/bos/platform"
      },
      contextProvider: {
        getCurrentContext: async () => ({contract_version: "bos-identity-mcp/v1"}),
        getExecutionContextHeader: async () => "X-BOS-Context-Handle"
      }
    });
    assert.deepEqual(
      await createAdapter(async () => structuredClone(successful))
        .invokeStateAction(stateAction),
      successful,
      generatedRoot
    );
    await assert.rejects(
      createAdapter(async () => ({
        status: 207,
        body: {
          outcomes: [{error: {code: "invalid_request", message: "incomplete"}}]
        }
      })).invokeStateAction(stateAction),
      /BOS public error/,
      generatedRoot
    );
  }
});

test("generated journey guidance creates no second connection or client-owned state", async () => {
  for (const generatedRoot of generatedRoots) {
    const guidance = await readFile(
      `${generatedRoot}/bos-workflow-orchestrator/references/journey-lifecycle.md`,
      "utf8"
    );
    assert.match(guidance, /sole exact returned `state` action/i);
    assert.match(guidance, /never sends or stores an execution/i);
    assert.doesNotMatch(guidance, /client[_ -]id|retry[_ -]key|construct.*journeys\//i);
  }
});

test("Education Center routes generic Lead Director work to independent My CRM on the BOS connection", async () => {
  const product = JSON.parse(
    await readFile(`${root}/products/education-center/product.json`, "utf8")
  );
  assert.deepEqual(product.dependencies, ["bos"]);
  assert.deepEqual(
    product.independent_product_dependencies.map(({ name }) => name),
    ["my-crm"]
  );
  for (const generatedRoot of educationCenterRoots) {
    for (const retired of ["crm-customer-journey", "crm-record-operations"]) {
      await assert.rejects(readFile(`${generatedRoot}/${retired}/SKILL.md`, "utf8"), {
        code: "ENOENT"
      });
    }
    const routing = await readFile(
      `${generatedRoot}/education-center-service-routing/SKILL.md`, "utf8"
    );
    assert.match(routing, /my-crm-record-operations/);
    assert.match(routing, /my-crm-customer-journey/);
    assert.match(routing, /independently distributed required product/i);
    assert.doesNotMatch(routing, /education_center_(?:search_leads|get_customer_journey)/);
  }
});

test("organization automation explanations use plugin Describe and the explain plan", async () => {
  const orchestrator = await readFile(
    `${root}/source/platform/bos-workflow-orchestrator/SKILL.md`,
    "utf8"
  );
  const orchestratorFrontmatter = orchestrator.match(/^---\n([\s\S]*?)\n---/);
  assert(orchestratorFrontmatter, "workflow orchestrator has frontmatter");
  assert.match(orchestratorFrontmatter[1], /explain an organization's automation plugin/i);
  assert.match(orchestrator, /fresh `app\.describe`/);
  assert.match(orchestrator, /`plugins\.list`/);
  assert.match(orchestrator, /exact\s+`service\.describe` input/);
  assert.match(orchestrator, /explain plan from the detailed Describe response/i);
  assert.match(orchestrator, /When Describe\s+returns `behavior`/i);
  assert.match(orchestrator, /top-level\s+plugin whose descriptor identifies the requested automation behavior/i);
  assert.match(orchestrator, /do not replace them with the implementation\s+details of one delivery provider/i);
  assert.match(orchestrator, /Mermaid flowchart of the automation workflow from the\s+plugin's perspective/i);
  assert.match(orchestrator, /Do not substitute\s+the Lead Director state graph/i);
  assert.match(orchestrator, /Do not author, register, start, or advance BOSL/i);

});

test("dependent product skills leave identity-v2 transport binding inside BOS", async () => {
  const product = JSON.parse(
    await readFile(`${root}/products/education-center/product.json`, "utf8")
  );
  const canonicalFiles = [
    `${root}/source/verticals/education-center/education-center-service-routing/SKILL.md`,
    `${root}/source/verticals/education-center/education-center-student-operations/SKILL.md`,
    `${root}/source/capabilities/agent-call-operations/SKILL.md`
  ];
  for (const file of canonicalFiles) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /X-BOS-Context-Handle|context_handle/);
    assert.match(content, /BOS/i);
  }
  for (const generatedRoot of educationCenterRoots) {
    for (const relative of [
      "education-center-service-routing/SKILL.md",
      "education-center-student-operations/SKILL.md",
      "agent-call-operations/SKILL.md"
    ]) {
      const generated = await readFile(`${generatedRoot}/${relative}`, "utf8");
      assert.doesNotMatch(generated, /X-BOS-Context-Handle|context_handle/);
      assert.match(generated, /BOS/i);
    }
  }
  assert.equal(product.connection_owner, "bos");
});

test("generated BOS clients preserve identity-v2 public context and discovered-header execution", async () => {
  const canonicalContextSelection = await readFile(
    `${root}/source/platform/bos-mcp-client/scripts/context-selection.mjs`,
    "utf8"
  );
  const canonicalRuntime = await readFile(
    `${root}/source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs`,
    "utf8"
  );
  for (const generatedRoot of generatedRoots) {
    assert.equal(
      await readFile(`${generatedRoot}/bos-mcp-client/scripts/context-selection.mjs`, "utf8"),
      canonicalContextSelection
    );
    assert.equal(
      await readFile(
        `${generatedRoot}/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs`,
        "utf8"
      ),
      canonicalRuntime
    );
  }
});

test("extracted BOS archive executes Draft 2020-12 journey helpers without repository dependencies", async (context) => {
  const extracted = await mkdtemp(join(tmpdir(), "bos-journey-archive-"));
  context.after(() => rm(extracted, { recursive: true, force: true }));
  await run("unzip", [
    "-q",
    `${root}/products/bos/openai/bos-skills.zip`,
    "-d",
    extracted
  ]);
  for (const privateScript of ["document-cache.mjs", "journey-contract-cache.mjs"]) {
    await assert.rejects(
      readFile(join(extracted, "bos-mcp-client", "scripts", privateScript)),
      (error) => error?.code === "ENOENT",
      `${privateScript} must remain host-owned and absent from the public archive`
    );
  }
  const scripts = join(extracted, "bos-workflow-orchestrator", "scripts");
  const ajvLicense = await readFile(join(scripts, "vendor", "AJV-LICENSE.txt"), "utf8");
  assert.match(ajvLicense, /Copyright \(c\) 2015-2021 Evgeny Poberezkin/);
  assert.match(ajvLicense, /The MIT License \(MIT\)/);
  const authoring = await import(pathToFileURL(join(scripts, "bosl-authoring.mjs")));
  const runtime = await import(pathToFileURL(join(scripts, "journey-runtime-client.mjs")));
  const adapterScripts = join(extracted, "bos-external-dependency-adapter", "scripts");
  const dependencyAdapter = await import(pathToFileURL(join(adapterScripts, "external-dependency-adapter.mjs")));
  const adapterLicense = await readFile(join(adapterScripts, "vendor", "AJV-LICENSE.txt"), "utf8");
  assert.match(adapterLicense, /Copyright \(c\) 2015-2021 Evgeny Poberezkin/);
  const document = {
    identity: "archive-self-contained",
    name: "Archive self-contained",
    inputs: {},
    entry: "done",
    nodes: [{
      code: "done",
      type: "server",
      terminal: true,
      inputs: {},
      outputs: {}
    }]
  };
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required: ["identity", "name", "inputs", "entry", "nodes"]
  };
  assert.deepEqual(
    authoring.validateBoslDocument(document, { publishedSchema: schema }).findings,
    []
  );
  assert.deepEqual(runtime.buildActionRequest({
    verb: "read",
    method: "POST",
    href: "/bos/read?selection=opaque",
    payload_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }, {}), {
    method: "POST",
    href: "/bos/read?selection=opaque",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  const contextHandle = `bos_ctx_v2_${"c".repeat(64)}`;
  const authoritativeDescribe = await fetchSyntheticDiscovery(
    syntheticBos.baseUrl,
    "/discovery/operations"
  );
  const describedOperation = authoritativeDescribe.operations.find(
    ({operation, status}) => operation === "search" && status === "described"
  );
  assert.deepEqual(runtime.buildDiscoveredOperationRequest(describedOperation, contextHandle, { text: "Synthetic Contact 7F3A91" }), {
    method: "POST",
    href: describedOperation.execution.uri,
    headers: {
      "content-type": "application/json",
      "X-BOS-Context-Handle": contextHandle
    },
    body: JSON.stringify({ text: "Synthetic Contact 7F3A91" })
  });
  const lifecycleAction = {
    verb: "state",
    method: "GET",
    href: "/bos/apps/lead-director/api/v1/organizations/current/journeys/meeting-follow-up?capability=opaque",
    payload_schema: null
  };
  assert.deepEqual(
    runtime.buildIdentityV2JourneyActionRequest(lifecycleAction, contextHandle),
    {
      method: "GET",
      href: lifecycleAction.href,
      headers: { "X-BOS-Context-Handle": contextHandle },
      body: undefined
    }
  );
  assert.deepEqual(runtime.buildActionRequest(lifecycleAction), {
    method: "GET",
    href: lifecycleAction.href,
    headers: {},
    body: undefined
  });
  const adapterRequests = [];
  const adapter = dependencyAdapter.createBosExternalDependencyAdapter({
    hostTransport: {
      captureExecutionScope: async () => async () => true,
      verifyExecutionIntent: async () => true,
      getProtectedResource: async () => "https://dfsm.ai/mcp/apps/bos/platform",
      request: async (request) => {
        adapterRequests.push(structuredClone(request));
        return { status: 200, body: { status: "in_progress" } };
      },
      recoverAuthentication: async () => ({
        schema_version: "bos.authentication-handoff/v1",
        message_type: "result",
        protected_resource: "https://dfsm.ai/mcp/apps/bos/platform",
        status: "READY"
      })
    },
    contextProvider: {
      getExecutionContextHeader: async () => "X-BOS-Context-Handle",
      getCurrentContext: async () => ({
        contract_version: "bos-identity-mcp/v2",
        context: {
          context_handle: contextHandle,
          organization_name: "Example Organization",
          application_name: "Lead Director",
          installation_name: "Primary",
          role_label: "Operator",
          is_default: true
        }
      })
    }
  });
  assert.equal((await adapter.invokeDiscoveredOperation(
    describedOperation,
    { text: "Synthetic Contact 7F3A91" }
  )).status, 200);
  assert.equal((await adapter.invokeStateAction(lifecycleAction)).status, 200);
  assert.equal(adapterRequests[0].headers["X-BOS-Context-Handle"], contextHandle);
  assert.equal(adapterRequests[0].href, describedOperation.execution.uri);
  assert.equal(adapterRequests[1].headers["X-BOS-Context-Handle"], contextHandle);
});
