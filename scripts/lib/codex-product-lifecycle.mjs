import { codexConnectorContract, codexRawAppId, materializeMcpUrl } from "./package-model.mjs";

export const CODEX_CONNECTOR_LIFECYCLE = Object.freeze({
  lifecycle_state: "ESTABLISHED",
  identity_policy: "IMMUTABLE",
  metadata_policy: "UPDATE_IN_PLACE",
  missing_record_policy: "REGISTRY_INTEGRITY_FAILURE",
  provisioning_policy: "NEW_PRODUCT_ONLY"
});

export function connectorMetadataFromProduct(product) {
  return {
    name: product.display_name,
    description: product.description,
    mcp_url: materializeMcpUrl(product),
    website_url: product.website_url ?? null,
    logo: product.logo ?? null
  };
}

export function establishedConnectorFromProduct(product) {
  const connector = codexConnectorContract(product);
  return {
    id: connector.id,
    raw_id: codexRawAppId(connector.id),
    required: connector.required,
    ...CODEX_CONNECTOR_LIFECYCLE,
    metadata: connectorMetadataFromProduct(product),
    retired_ids: [...connector.retired_ids]
  };
}

export function planEstablishedConnectorSync(product, registryRecord) {
  const desired = establishedConnectorFromProduct(product);
  if (!registryRecord) {
    return {
      state: "registry_integrity_failure",
      action: "restore_same_record",
      connector_id: desired.id,
      desired
    };
  }
  if (codexRawAppId(registryRecord.id) !== desired.raw_id) {
    return {
      state: "wrong_identity",
      action: "inspect_configured_record",
      connector_id: desired.id,
      observed_connector_id: registryRecord.id,
      desired
    };
  }
  const current = {
    name: registryRecord.name ?? null,
    description: registryRecord.description ?? null,
    mcp_url: registryRecord.base_url ?? registryRecord.mcp_url ?? null,
    website_url: registryRecord.branding?.website ?? registryRecord.website_url ?? null,
    logo: registryRecord.logo ?? null
  };
  const changes = Object.fromEntries(
    Object.entries(desired.metadata)
      .filter(([field, value]) => value !== null && current[field] !== value)
      .map(([field, value]) => [field, { from: current[field], to: value }])
  );
  return {
    state: Object.keys(changes).length ? "metadata_drift" : "current",
    action: Object.keys(changes).length ? "update_in_place" : "none",
    connector_id: desired.id,
    changes,
    desired
  };
}

export function planNewProductProvisioning(product) {
  if (product.codex_connector?.lifecycle_state === "ESTABLISHED") {
    const connector = codexConnectorContract(product);
    return {
      state: "established",
      action: "use_existing_connector",
      connector_id: connector.id
    };
  }
  if (product.codex_connector?.lifecycle_state !== "UNPROVISIONED_NEW" ||
      product.codex_connector.id !== null ||
      product.name === "bos" ||
      product.codex_connector.retired_ids?.length !== 0 ||
      product.release_status !== "disabled" || !product.runtime ||
      !product.clients?.includes("codex")) {
    throw new Error("Connector provisioning requires a different disabled Codex runtime product in explicit UNPROVISIONED_NEW state with no prior IDs");
  }
  return {
    state: "new_product",
    action: "provision_once",
    metadata: connectorMetadataFromProduct(product)
  };
}

export function connectorContractForProvisionedId(remotePluginId) {
  const raw = codexRawAppId(remotePluginId);
  if (!/^asdk_app_[a-z0-9]+$/.test(raw)) {
    throw new Error(`Provisioning returned an invalid connector ID: ${remotePluginId}`);
  }
  return {
    id: `plugin_${raw}`,
    required: true,
    ...CODEX_CONNECTOR_LIFECYCLE,
    retired_ids: []
  };
}
