import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  resolveProductSkills,
  root,
  transformProductSkillGuidance
} from "../scripts/lib/package-model.mjs";

const run = promisify(execFile);

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
  const canonicalCache = await readFile(
    `${mcpClient.sourcePath}/scripts/journey-contract-cache.mjs`,
    "utf8"
  );
  for (const generatedRoot of generatedRoots) {
    assert.equal(
      await readFile(`${generatedRoot}/bos-workflow-orchestrator/SKILL.md`, "utf8"),
      transformProductSkillGuidance(product, "bos-workflow-orchestrator", canonicalOrchestrator)
    );
    assert.equal(
      await readFile(`${generatedRoot}/bos-mcp-client/scripts/journey-contract-cache.mjs`, "utf8"),
      canonicalCache
    );
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
  }
  for (const generatedRoot of educationCenterRoots) {
    await assert.rejects(
      readFile(`${generatedRoot}/bos-external-dependency-adapter/SKILL.md`, "utf8"),
      (error) => error?.code === "ENOENT",
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

test("Lead Director capabilities use one BOS connection in canonical and generated packages", async () => {
  const product = JSON.parse(
    await readFile(`${root}/products/education-center/product.json`, "utf8")
  );
  const capabilities = ["crm-customer-journey", "crm-record-operations"];
  for (const capability of capabilities) {
    const canonical = await readFile(
      `${root}/source/capabilities/${capability}/SKILL.md`,
      "utf8"
    );
    assert.match(canonical, /BOS (?:platform )?connection/i, capability);
    assert.doesNotMatch(
      canonical,
      /active product MCP|product's scoped MCP connection|another product connection|scoped product connection/i,
      capability
    );
    for (const generatedRoot of educationCenterRoots) {
      assert.equal(
        await readFile(`${generatedRoot}/${capability}/SKILL.md`, "utf8"),
        transformProductSkillGuidance(product, capability, canonical),
        `${generatedRoot}/${capability}`
      );
    }
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
  assert.match(orchestrator, /Mermaid flowchart of the automation workflow from the\s+plugin's perspective/i);
  assert.match(orchestrator, /Do not substitute\s+the Lead Director state graph/i);
  assert.match(orchestrator, /Do not author, register, start, or advance BOSL/i);

  const recordJourney = await readFile(
    `${root}/source/capabilities/crm-customer-journey/SKILL.md`,
    "utf8"
  );
  const recordJourneyFrontmatter = recordJourney.match(/^---\n([\s\S]*?)\n---/);
  assert(recordJourneyFrontmatter, "record journey skill has frontmatter");
  assert.doesNotMatch(recordJourneyFrontmatter[1], /automation plugin/i);
  assert.doesNotMatch(recordJourney, /Organization automation explanations/);
});

test("dependent product skills leave identity-v2 transport binding inside BOS", async () => {
  const product = JSON.parse(
    await readFile(`${root}/products/education-center/product.json`, "utf8")
  );
  const canonicalFiles = [
    `${root}/source/capabilities/crm-customer-journey/SKILL.md`,
    `${root}/source/capabilities/crm-customer-journey/references/connected-graph-read.md`,
    `${root}/source/verticals/education-center/education-center-service-routing/SKILL.md`
  ];
  for (const file of canonicalFiles) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /X-BOS-Context-Handle|context_handle/);
    assert.match(content, /BOS\s+dependency adapter/);
  }
  for (const generatedRoot of educationCenterRoots) {
    for (const relative of [
      "crm-customer-journey/SKILL.md",
      "crm-customer-journey/references/connected-graph-read.md",
      "education-center-service-routing/SKILL.md"
    ]) {
      const generated = await readFile(`${generatedRoot}/${relative}`, "utf8");
      assert.doesNotMatch(generated, /X-BOS-Context-Handle|context_handle/);
      assert.match(generated, /BOS\s+dependency adapter/);
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

test("Lead Director presentation derives each organization's entity shape and UI", async () => {
  const journey = await readFile(
    `${root}/source/capabilities/crm-customer-journey/SKILL.md`,
    "utf8"
  );
  const records = await readFile(
    `${root}/source/capabilities/crm-record-operations/SKILL.md`,
    "utf8"
  );
  const graphContract = await readFile(
    `${root}/source/capabilities/crm-customer-journey/references/journey-graph-contract.md`,
    "utf8"
  );
  const connectedGraph = await readFile(
    `${root}/source/capabilities/crm-customer-journey/references/connected-graph-read.md`,
    "utf8"
  );

  assert.match(
    journey,
    /derive the entity's singular and plural display[\s\S]*organization-specific custom values[\s\S]*current node type[\s\S]*complete UI\/rendering instructions/i
  );
  assert.match(
    journey,
    /Every displayed record uses the organization-described format/i
  );
  assert.match(
    records,
    /derive the entity label, fields, organization-specific custom values,[\s\S]*UI\/rendering instructions from current[\s\S]*Describe/i
  );
  assert.doesNotMatch(journey, /Every displayed lead uses|For each displayed lead/i);
  assert.doesNotMatch(records, /create a lead|Whenever a lead is displayed/i);
  assert.doesNotMatch(graphContract, /app MCP contact|product connection/i);

  for (const generatedRoot of educationCenterRoots) {
    assert.equal(
      await readFile(
        `${generatedRoot}/crm-customer-journey/references/journey-graph-contract.md`,
        "utf8"
      ),
      graphContract
    );
    assert.equal(
      await readFile(
        `${generatedRoot}/crm-customer-journey/references/connected-graph-read.md`,
        "utf8"
      ),
      connectedGraph
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
    href: "/read?selection=opaque",
    payload_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }, {}), {
    method: "POST",
    href: "/read?selection=opaque",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  const contextHandle = `bos_ctx_v2_${"c".repeat(64)}`;
  assert.deepEqual(runtime.buildDiscoveredOperationRequest({
    operation: "calendar.events.search",
    status: "described",
    execution: {
      context_header: "X-BOS-Context-Handle",
      method: "POST",
      transport: null,
      uri: "/bos/apps/lead-director/api/v1/organizations/example/calendar/events/search"
    },
    input_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required: ["query"],
      properties: { query: { type: "string" } },
      additionalProperties: false
    }
  }, contextHandle, { query: "recent meeting" }), {
    method: "POST",
    href: "/bos/apps/lead-director/api/v1/organizations/example/calendar/events/search",
    headers: {
      "content-type": "application/json",
      "X-BOS-Context-Handle": contextHandle
    },
    body: JSON.stringify({ query: "recent meeting" })
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
  assert.equal((await adapter.invokeStateAction(lifecycleAction)).status, 200);
  assert.equal(adapterRequests[0].headers["X-BOS-Context-Handle"], contextHandle);
});
