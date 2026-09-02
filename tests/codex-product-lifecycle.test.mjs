import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  connectorContractForProvisionedId,
  establishedConnectorFromProduct,
  planEstablishedConnectorSync,
  planNewProductProvisioning
} from "../scripts/lib/codex-product-lifecycle.mjs";
import { manageCodexProduct } from "../scripts/manage-codex-product.mjs";
import { readJson, root, walkFiles } from "../scripts/lib/package-model.mjs";

const bosProduct = await readJson(join(root, "products", "bos", "product.json"));
const connector = establishedConnectorFromProduct(bosProduct);

test("BOS product.json is the single authored connector identity and resource source", async () => {
  assert.match(connector.id, /^plugin_asdk_app_[a-z0-9]+$/);
  assert.equal(bosProduct.codex_connector.lifecycle_state, "ESTABLISHED");
  assert.equal(connector.identity_policy, "IMMUTABLE");
  assert.equal(connector.metadata_policy, "UPDATE_IN_PLACE");
  assert.equal(connector.missing_record_policy, "REGISTRY_OWNER_RESTORE_SAME_RECORD");
  assert.equal(connector.provisioning_policy, "NEW_PRODUCT_ONLY");
  assert.equal(connector.metadata.mcp_url, bosProduct.mcp_resource_url);

  const generated = await Promise.all([
    "clients/codex/plugins/bos/.app.json",
    "clients/codex/plugins/bos/.bos-product.json",
    "contracts/single-bos-mcp-connection.v1.json",
    "contracts/codex-login-surface.v1.json"
  ].map((path) => readJson(join(root, path))));
  assert.equal(generated[0].apps.bos.id, connector.id);
  assert.equal(generated[1].codex_app_id, connector.id);
  assert.deepEqual(generated[1].oauth, bosProduct.oauth);
  assert.equal(generated[2].codex_app_id, connector.id);
  assert.equal(generated[2].resource_url, bosProduct.mcp_resource_url);
  assert.deepEqual(generated[2].oauth, bosProduct.oauth);
  assert.equal(generated[3].connector_id, connector.id);
  assert.equal(generated[3].resource_url, bosProduct.mcp_resource_url);
  assert.deepEqual(generated[3].oauth, bosProduct.oauth);
});

test("operational source contains no duplicated production connector ID", async () => {
  const knownIds = [connector.id, connector.raw_id, ...connector.retired_ids];
  const files = [
    ...await walkFiles(join(root, "scripts")),
    ...await walkFiles(join(root, "source"))
  ].filter((path) => /\.(?:mjs|js|json|md)$/.test(path));
  const duplicates = [];
  for (const path of files) {
    const content = await readFile(path, "utf8");
    if (knownIds.some((id) => content.includes(id))) duplicates.push(path);
  }
  assert.deepEqual(duplicates, []);
});

test("established connector metadata changes plan an in-place update with the same ID", () => {
  const plan = planEstablishedConnectorSync(bosProduct, {
    id: connector.raw_id,
    name: "Old name",
    description: bosProduct.description,
    base_url: bosProduct.mcp_resource_url,
    branding: { website: bosProduct.website_url },
    logo: bosProduct.logo
  });
  assert.equal(plan.action, "update_in_place");
  assert.equal(plan.connector_id, connector.id);
  assert.deepEqual(plan.changes.name, {
    from: "Old name",
    to: bosProduct.display_name
  });
});

test("a missing established connector is an integrity failure and never provisioning", () => {
  const plan = planEstablishedConnectorSync(bosProduct, null);
  assert.equal(plan.state, "registry_integrity_failure");
  assert.equal(plan.action, bosProduct.codex_connector.missing_record_policy.toLowerCase());
  assert.equal(plan.connector_id, connector.id);
});

test("provisioning is only selected for a disabled new product without an identity", () => {
  const newProduct = {
    ...bosProduct,
    name: "new-product",
    release_status: "disabled",
    codex_connector: {
      ...bosProduct.codex_connector,
      lifecycle_state: "UNPROVISIONED_NEW",
      id: null,
      retired_ids: []
    }
  };
  assert.equal(planNewProductProvisioning(newProduct).action, "provision_once");
  assert.equal(planNewProductProvisioning(bosProduct).action, "use_existing_connector");
  assert.equal(
    connectorContractForProvisionedId(newProduct, "asdk_app_newproduct").id,
    "plugin_asdk_app_newproduct"
  );
  assert.throws(
    () => planNewProductProvisioning({
      ...bosProduct,
      codex_connector: { ...bosProduct.codex_connector, id: null }
    }),
    /immutable Codex connector|different disabled Codex runtime product/
  );
  assert.throws(
    () => planNewProductProvisioning({
      ...newProduct,
      name: "bos"
    }),
    /different disabled Codex runtime product/
  );
  assert.throws(
    () => planNewProductProvisioning({
      ...newProduct,
      codex_connector: {
        ...newProduct.codex_connector,
        retired_ids: ["asdk_app_retired"]
      }
    }),
    /no prior IDs/
  );
  for (const invalid of [
    { ...newProduct, release_status: "active" },
    { ...newProduct, runtime: undefined },
    { ...newProduct, clients: newProduct.clients.filter((client) => client !== "codex") }
  ]) {
    assert.throws(
      () => planNewProductProvisioning(invalid),
      /different disabled Codex runtime product/
    );
  }
});

test("product lifecycle commands reject a requested/source name mismatch", async () => {
  let inspections = 0;
  await assert.rejects(
    manageCodexProduct({
      command: "inspect",
      product: "different-product",
      productManifest: bosProduct,
      client: {
        async inspectConnector() { inspections += 1; }
      }
    }),
    /Product source mismatch/
  );
  assert.equal(inspections, 0);
});

test("metadata synchronization passes the permanent ID and is idempotent", async () => {
  const updateCalls = [];
  let inspections = 0;
  let current = {
    id: connector.raw_id,
    name: "Old name",
    description: bosProduct.description,
    base_url: bosProduct.mcp_resource_url,
    branding: { website: bosProduct.website_url },
    logo: bosProduct.logo
  };
  const client = {
    async inspectConnector() {
      inspections += 1;
      return { ok: true, http_status: 200, body: current };
    },
    async updateEstablishedConnector(appId, changes) {
      updateCalls.push({ appId, changes });
      current = {
        ...current,
        name: bosProduct.display_name
      };
      return { connectorId: connector.id };
    }
  };

  const first = await manageCodexProduct({
    command: "sync",
    productManifest: bosProduct,
    client,
    pluginPath: "/tmp/generated-bos"
  });
  const second = await manageCodexProduct({
    command: "sync",
    productManifest: bosProduct,
    client,
    pluginPath: "/tmp/generated-bos"
  });

  assert.equal(first.action, "updated_in_place");
  assert.equal(second.action, "none");
  assert.deepEqual(updateCalls, [{
    appId: connector.id,
    changes: { name: bosProduct.display_name }
  }]);
  assert.equal(inspections, 3);
});

test("metadata synchronization fails unless the same record post-read is current", async () => {
  const stale = {
    id: connector.raw_id,
    name: "Old name",
    description: bosProduct.description,
    base_url: bosProduct.mcp_resource_url,
    branding: { website: bosProduct.website_url },
    logo: bosProduct.logo
  };
  for (const postRead of [
    { ok: false, http_status: 404, body: null },
    { ok: true, http_status: 200, body: stale }
  ]) {
    let inspections = 0;
    await assert.rejects(
      manageCodexProduct({
        command: "sync",
        productManifest: bosProduct,
        client: {
          async inspectConnector() {
            inspections += 1;
            return inspections === 1
              ? { ok: true, http_status: 200, body: stale }
              : postRead;
          },
          async updateEstablishedConnector() {
            return { connectorId: connector.id };
          }
        }
      }),
      /did not verify the permanent connector record/
    );
    assert.equal(inspections, 2);
  }
});

test("new-product provisioning records one returned ID and reruns use it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-product-provision-"));
  const productPath = join(directory, "product.json");
  const newProduct = {
    ...bosProduct,
    name: "new-product",
    release_status: "disabled",
    codex_connector: {
      ...bosProduct.codex_connector,
      lifecycle_state: "UNPROVISIONED_NEW",
      id: null,
      retired_ids: []
    }
  };
  await writeFile(productPath, `${JSON.stringify(newProduct, null, 2)}\n`);
  const saveCalls = [];
  const client = {
    async inspectSharedPlugins() {
      return { plugins: [] };
    },
    async provisionNewProduct(pluginPath) {
      saveCalls.push(pluginPath);
      return { remotePluginId: "plugin_asdk_app_newproduct" };
    }
  };

  const first = await manageCodexProduct({
    command: "provision",
    product: "new-product",
    productPath,
    client,
    pluginPath: join(directory, "plugin")
  });
  const established = JSON.parse(await readFile(productPath, "utf8"));
  const second = await manageCodexProduct({
    command: "provision",
    product: "new-product",
    productPath,
    client,
    pluginPath: join(directory, "plugin")
  });

  assert.equal(first.connector_id, "plugin_asdk_app_newproduct");
  assert.equal(established.codex_connector.id, first.connector_id);
  assert.equal(second.action, "use_existing_connector");
  assert.equal(saveCalls.length, 1);
});

test("registry HTTP failures remain distinct and never update or provision", async () => {
  for (const [status, state] of [[401, "authentication_required"], [403, "authentication_required"], [503, "registry_unavailable"]]) {
    let mutations = 0;
    const result = await manageCodexProduct({
      command: "sync",
      productManifest: bosProduct,
      client: {
        async inspectConnector() {
          return { ok: false, http_status: status, body: null };
        },
        async updateEstablishedConnector() { mutations += 1; },
        async provisionNewProduct() { mutations += 1; }
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.state, state);
    assert.equal(mutations, 0);
  }
});

test("missing established record requires registry-owner same-ID restoration with zero mutation", async () => {
  let mutations = 0;
  const client = {
    async inspectConnector() {
      return { ok: false, http_status: 404, body: null };
    },
    async updateEstablishedConnector() {
      mutations += 1;
    },
    async provisionNewProduct() {
      mutations += 1;
    }
  };
  const result = await manageCodexProduct({
    command: "sync",
    productManifest: bosProduct,
    client,
    pluginPath: "/tmp/generated-bos"
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, "registry_integrity_failure");
  assert.equal(result.action, bosProduct.codex_connector.missing_record_policy.toLowerCase());
  assert.equal(result.connector_id, connector.id);
  assert.equal(mutations, 0);
});

test("wrong BOS resource requires registry-owner correction with zero mutation", async () => {
  let mutations = 0;
  const result = await manageCodexProduct({
    command: "sync",
    productManifest: bosProduct,
    client: {
      async inspectConnector() {
        return {
          ok: true,
          http_status: 200,
          body: {
            id: connector.raw_id,
            name: bosProduct.display_name,
            description: bosProduct.description,
            base_url: "https://wrong.example/mcp"
          }
        };
      },
      async updateEstablishedConnector() { mutations += 1; },
      async provisionNewProduct() { mutations += 1; }
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, "binding_integrity_failure");
  assert.equal(result.action, "registry_owner_correction_required");
  assert.equal(mutations, 0);
});

test("metadata synchronization rejects missing or changed returned identity", async () => {
  for (const returned of [null, "plugin_asdk_app_wrongidentity"]) {
    let inspections = 0;
    const client = {
      async inspectConnector() {
        inspections += 1;
        return {
          ok: true,
          http_status: 200,
          body: {
            id: connector.raw_id,
            name: "Old name",
            description: bosProduct.description,
            base_url: bosProduct.mcp_resource_url,
            branding: { website: bosProduct.website_url },
            logo: bosProduct.logo
          }
        };
      },
      async updateEstablishedConnector() {
        return returned ? { connectorId: returned } : {};
      }
    };
    await assert.rejects(
      manageCodexProduct({ command: "sync", productManifest: bosProduct, client }),
      returned ? /changed connector identity/ : /returned no connector identity/
    );
    assert.equal(inspections, 1);
  }
});

test("an interrupted new-product creation is reconciled without creating another ID", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-product-reconcile-"));
  const productPath = join(directory, "product.json");
  const newProduct = {
    ...bosProduct,
    name: "new-product",
    display_name: "New Product",
    release_status: "disabled",
    codex_connector: {
      ...bosProduct.codex_connector,
      lifecycle_state: "UNPROVISIONED_NEW",
      id: null,
      retired_ids: []
    }
  };
  await writeFile(productPath, `${JSON.stringify(newProduct, null, 2)}\n`);
  let provisions = 0;
  const result = await manageCodexProduct({
    command: "provision",
    product: "new-product",
    productPath,
    pluginPath: join(directory, "plugin"),
    client: {
      async inspectSharedPlugins() {
        return { plugins: [{
          name: newProduct.display_name,
          description: newProduct.description,
          mcp_url: newProduct.mcp_resource_url,
          website_url: newProduct.website_url,
          logo: newProduct.logo,
          remotePluginId: "plugin_asdk_app_reconciled"
        }] };
      },
      async provisionNewProduct() { provisions += 1; }
    }
  });
  assert.equal(result.connector_id, "plugin_asdk_app_reconciled");
  assert.equal(provisions, 0);
});

test("new-product reconciliation rejects incomplete, mismatched, or duplicate fingerprints", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-product-ambiguous-"));
  const productPath = join(directory, "product.json");
  const newProduct = {
    ...bosProduct,
    name: "new-product",
    display_name: "New Product",
    release_status: "disabled",
    codex_connector: {
      ...bosProduct.codex_connector,
      lifecycle_state: "UNPROVISIONED_NEW",
      id: null,
      retired_ids: []
    }
  };
  await writeFile(productPath, `${JSON.stringify(newProduct, null, 2)}\n`);
  const exact = {
    name: newProduct.display_name,
    description: newProduct.description,
    mcp_url: newProduct.mcp_resource_url,
    website_url: newProduct.website_url,
    logo: newProduct.logo,
    remotePluginId: "plugin_asdk_app_existing"
  };
  for (const plugins of [
    [{ ...exact, description: undefined }],
    [{ ...exact, description: "Different product" }],
    [exact, { ...exact, remotePluginId: "plugin_asdk_app_duplicate" }],
    [{ ...exact, remotePluginId: undefined }]
  ]) {
    let provisions = 0;
    await assert.rejects(
      manageCodexProduct({
        command: "provision",
        product: "new-product",
        productPath,
        pluginPath: join(directory, "plugin"),
        client: {
          async inspectSharedPlugins() { return { plugins }; },
          async provisionNewProduct() { provisions += 1; }
        }
      }),
      /ambiguous prior registry state/
    );
    assert.equal(provisions, 0);
  }
});
