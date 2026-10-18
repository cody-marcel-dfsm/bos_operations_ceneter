import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {
  validateDiscoveryRefresh, validatePluginsList, validateServiceJourneyDescription
} from "../source/platform/bos-app-discovery/scripts/validate-discovery.mjs";
import {syntheticAppDescribe} from "./helpers/synthetic-bos-discovery-service.mjs";

// Consumer-owned public fixtures; catalog visibility never supplies an operation.
function observation({enabled = true, configuration = "not_reported", presentation = "catalog_only"} = {}) {
  const reference = {platform: "bos", application: "lead-director", plugin: "synthetic-mail"};
  const catalog = {enabled, configuration, presentation};
  const plugin = {
    reference, name: "Synthetic Mail", purpose: "Inspect the installed mail plugin.", catalog,
    describe: {capability: "service.describe", input: {service: reference}},
    descriptor_etag: "synthetic-catalog-state-1", readiness: {status: "not_reported", requirements: []}
  };
  const description = {
    reference, name: plugin.name, purpose: plugin.purpose, catalog: structuredClone(catalog),
    descriptor_etag: plugin.descriptor_etag, readiness: structuredClone(plugin.readiness),
    queries: [], ttlMs: 0, cacheScope: "private"
  };
  if (presentation !== "catalog_only") {
    plugin.journey = {
      title: "Inspect mail setup", inputs: [], success: "Setup status reported",
      steps: [{code: "reported", type: "server", description: "Report setup status"}]
    };
    if (presentation === "behavior") {
      plugin.journey.success = "Report setup status";
      description.behavior = {
        title: plugin.journey.title, entry: "reported", outcomes: {reported: plugin.journey.success},
        steps: [{code: "reported", title: "Report setup status", kind: "outcome",
          description: "Report setup status", interfaces: ["Setup status"], next: [], terminal: true}]
      };
    } else {
      description.journey = {
        title: plugin.journey.title, entry: "reported", inputs: {}, limits: {}, required_authority: {},
        steps: [{code: "reported", title: "Report setup status", type: "server", inputs: {}, outputs: {}, terminal: true}],
        outcomes: {reported: plugin.journey.success}, public_errors: {}
      };
    }
  }
  const list = {application: {platform: "bos", application: "lead-director"}, plugins: [plugin], ttlMs: 0, cacheScope: "private"};
  return {plugin, description, list};
}

function validatePair(o) {
  const before = structuredClone(o);
  assert.equal(validatePluginsList(o.list), o.list);
  const refresh = {...o.list, bosl: syntheticAppDescribe().bosl};
  assert.equal(validateDiscoveryRefresh(refresh), refresh);
  assert.equal(validateServiceJourneyDescription(o.description, o.plugin), o.description);
  assert.deepEqual(o, before, "validation preserves the literal observation");
}

for (const [label, options] of [
  ["disabled", {enabled: false}],
  ["unconfigured", {configuration: "unconfigured"}],
  ["configured without a published graph", {configuration: "configured"}],
  ["configuration unreported", {}]
]) {
  test(`catalog keeps ${label} plugin visible without inventing execution`, () => {
    const o = observation(options);
    validatePair(o);
    assert(!Object.hasOwn(o.plugin, "journey"));
    assert(!Object.hasOwn(o.description, "journey"));
    assert(!Object.hasOwn(o.description, "behavior"));
    assert.deepEqual(o.description.queries, []);
    assert.equal(o.plugin.readiness.status, "not_reported");
    assert.deepEqual(o.plugin.describe.input.service, o.plugin.reference);
  });
}

for (const presentation of ["journey", "behavior"]) {
  test(`catalog ${presentation} preserves existing compact/detailed graph validation`, () => {
    const o = observation({presentation, configuration: "configured"});
    validatePair(o);
    const missing = structuredClone(o);
    delete missing.description[presentation];
    assert.throws(() => validatePair(missing), /journey|behavior|presentation/);
    const wrong = structuredClone(o);
    wrong.description[presentation === "journey" ? "behavior" : "journey"] = wrong.description[presentation];
    delete wrong.description[presentation];
    assert.throws(() => validatePair(wrong), /journey|behavior|presentation/);
    const noCompact = structuredClone(o);
    delete noCompact.plugin.journey;
    assert.throws(() => validatePair(noCompact), /journey/);
  });

  test(`legacy v1 ${presentation} pair remains compatible only with both catalog fields absent`, () => {
    const o = observation({presentation});
    delete o.plugin.catalog;
    delete o.description.catalog;
    validatePair(o);
    for (const side of ["plugin", "description"]) {
      const mixed = observation({presentation});
      delete mixed[side].catalog;
      assert.throws(() => validatePair(mixed), /catalog|match|agree/);
    }
  });
}

test("a graphless legacy observation cannot masquerade as a catalog-only plugin", () => {
  const o = observation();
  delete o.plugin.catalog;
  delete o.description.catalog;
  assert.throws(() => validatePair(o), /journey|behavior/);
});

for (const [label, catalog] of [
  ["null", null], ["missing enabled", {configuration: "not_reported", presentation: "catalog_only"}],
  ["untyped enablement", {enabled: "false", configuration: "not_reported", presentation: "catalog_only"}],
  ["unknown configuration", {enabled: true, configuration: "ready", presentation: "catalog_only"}],
  ["unknown presentation", {enabled: true, configuration: "configured", presentation: "executable"}],
  ["extra execution flag", {enabled: true, configuration: "configured", presentation: "catalog_only", executable: true}]
]) {
  test(`malformed ${label} catalog is rejected on each surface`, () => {
    const o = observation();
    o.plugin.catalog = structuredClone(catalog);
    assert.throws(() => validatePluginsList(o.list));
    const detail = observation();
    detail.description.catalog = structuredClone(catalog);
    assert.throws(() => validateServiceJourneyDescription(detail.description, detail.plugin));
  });
}

test("catalog-only description rejects graphs, queries and undeclared action links", () => {
  for (const field of ["journey", "behavior"]) {
    for (const value of [null, {}, observation({presentation: field}).description[field]]) {
      const o = observation();
      o.description[field] = value;
      assert.throws(() => validatePair(o), /catalog|journey|behavior/);
    }
  }
  const compact = observation();
  compact.plugin.journey = observation({presentation: "journey"}).plugin.journey;
  assert.throws(() => validatePair(compact), /catalog|journey/);
  const query = observation();
  query.description.queries = [{operation: "synthetic.inspect", purpose: "Read setup.",
    contract: {capability: "api.contract.get", input: {operation: "synthetic.inspect"}}}];
  assert.throws(() => validatePair(query), /catalog|queries/);
  const action = observation();
  action.description.action = {method: "POST", uri: "/synthetic/action"};
  assert.throws(() => validatePair(action), /undeclared/);
});

test("disabled catalog entries cannot claim journey or behavior presentation", () => {
  for (const presentation of ["journey", "behavior"]) {
    assert.throws(() => validatePair(observation({enabled: false, presentation})), /catalog|enabled|presentation/);
  }
});

test("list and Describe agree on every catalog field and the current descriptor token", () => {
  for (const [field, value] of [["enabled", false], ["configuration", "configured"], ["presentation", "behavior"]]) {
    const o = observation();
    o.description.catalog[field] = value;
    assert.throws(() => validatePair(o), /catalog|match|agree/);
  }
  const stale = observation();
  stale.description.descriptor_etag = "synthetic-catalog-stale";
  assert.throws(() => validatePair(stale), /match|descriptor/);
});

test("catalog Describe links select only the declared read-only discovery capability", () => {
  for (const presentation of ["catalog_only", "journey", "behavior"]) {
    const o = observation({presentation});
    o.plugin.describe.capability = "operation.execute";
    assert.throws(() => validatePluginsList(o.list), /capability must be service.describe/);
    assert.throws(() => validateServiceJourneyDescription(o.description, o.plugin), /capability must be service.describe/);
  }
});

test("catalog visibility preserves current private scope and independent readiness", () => {
  const o = observation({enabled: false, configuration: "configured"});
  o.plugin.readiness = o.description.readiness = {status: "ready", requirements: []};
  validatePair(o);
  assert.equal(o.plugin.catalog.enabled, false);
  assert.equal(o.plugin.catalog.presentation, "catalog_only");
  const publicCache = observation();
  publicCache.description.cacheScope = "public";
  assert.throws(() => validatePair(publicCache), /private/);
  const foreign = observation();
  foreign.list.application.application = "another-application";
  assert.throws(() => validatePair(foreign), /same application/);
  const authority = observation();
  authority.plugin.catalog.org_id = "synthetic-organization";
  assert.throws(() => validatePair(authority), /undeclared|authority|org_id/);
});

test("discovery and workflow guidance retain catalog-only entries without inventing a graph", async () => {
  const discovery = await readFile(new URL("../source/platform/bos-app-discovery/SKILL.md", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../source/platform/bos-workflow-orchestrator/SKILL.md", import.meta.url), "utf8");
  assert.match(discovery, /Retain every returned installed plugin[\s\S]*catalog_only/);
  assert.match(discovery, /Catalog\s+visibility supplies no operation, execution permission or provider readiness/);
  assert.match(workflow, /validated `catalog_only` plugin[\s\S]*Keep the plugin visible/);
});
