import test from "node:test";
import assert from "node:assert/strict";

import {
  validateAppContact,
  validateGraphDescription,
  validateServiceDescriptor
} from "../source/platform/bos-app-discovery/scripts/validate-discovery.mjs";

const contact = {
  app_code: "lead-director",
  display_name: "Lead Director",
  description: "Lead and sales journey operations",
  mcp_resource: "https://apps.example.test/mcp/opaque-contact",
  context_id: "ctx_opaque",
  contract_version: "2026-09-03",
  discovery_epoch: "epoch_42",
  capability_families: ["lead.search", "lead.journey", "graph.path.plan"],
  required_scopes: ["lead:read"]
};

test("app contact accepts current app-directory context and rejects cross-context reuse", () => {
  assert.equal(validateAppContact(contact, "ctx_opaque"), contact);
  assert.throws(
    () => validateAppContact(contact, "ctx_other"),
    /does not match the current BOS app-directory contact/
  );
});

test("app contact rejects raw authority identifiers and unsafe transport", () => {
  assert.throws(
    () => validateAppContact({ ...contact, organization_id: "org_1" }, "ctx_opaque"),
    /raw authority/
  );
  assert.throws(
    () => validateAppContact({ ...contact, plugin_id: "plugin_1" }, "ctx_opaque"),
    /raw authority/
  );
  assert.throws(
    () => validateAppContact({ ...contact, mcp_resource: "http://example.test/mcp" }, "ctx_opaque"),
    /credential-free HTTPS URL/
  );
});

test("service descriptor requires deterministic HTTPS contracts and side effects", () => {
  const service = {
    service_id: "lead-journey",
    summary: "Read lead journey state",
    entity_types: ["lead", "journey"],
    owner_kind: "application",
    api_base_url: "https://api.example.test/lead-director",
    contract_uri: "https://api.example.test/contracts/lead-director.json",
    version: "3",
    auth_scheme: { scheme: "oauth2", audience: "lead-director-api" },
    required_scopes: ["lead:read"],
    provenance: { required: true },
    failure_contract: { typed: true },
    operations: [{ operation_id: "getLeadJourney", side_effect_class: "read" }]
  };
  assert.equal(validateServiceDescriptor(service), service);
  assert.throws(
    () => validateServiceDescriptor({ ...service, operations: [{ operation_id: "x", side_effect_class: "unknown" }] }),
    /side_effect_class is invalid/
  );
  assert.throws(
    () => validateServiceDescriptor({ ...service, api_base_url: "http://api.example.test" }),
    /must be HTTPS or an opaque base reference/
  );
  assert.equal(
    validateServiceDescriptor({ ...service, api_base_url: "api-base-ref:opaque-42" }).api_base_url,
    "api-base-ref:opaque-42"
  );
});

test("graph validator preserves exact topology and canonical goal semantics", () => {
  const graph = {
    graph_id: "sales-flow",
    schema_version: "2",
    content_digest: "sha256:abc",
    discovery_epoch: "epoch_42",
    nodes: [
      { node_id: "lead", label: "Lead created", goal_class: "non_terminal" },
      { node_id: "trial", label: "Trial scheduled", goal_class: "non_terminal" },
      { node_id: "enrolled", label: "Enrollment", goal_class: "positive" }
    ],
    transitions: [
      { from_node_id: "lead", to_node_id: "trial", label: "Schedule trial" },
      { from_node_id: "trial", to_node_id: "enrolled", label: "Enroll" }
    ]
  };
  assert.equal(validateGraphDescription(graph), graph);
  assert.throws(
    () => validateGraphDescription({ ...graph, nodes: [...graph.nodes, { node_id: "trial", label: "Duplicate" }] }),
    /duplicate graph node/
  );
  assert.throws(
    () => validateGraphDescription({ ...graph, nodes: [{ node_id: "lead", label: "Lead", is_goal: true }] }),
    /legacy goal metadata/
  );
});
