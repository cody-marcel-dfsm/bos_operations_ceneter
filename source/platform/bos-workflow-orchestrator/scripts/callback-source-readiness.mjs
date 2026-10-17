import Ajv2020 from "./vendor/ajv2020.bundle.mjs";
import {validateApiContractResponse} from "../../bos-app-discovery/scripts/validate-discovery.mjs";
import {validatePublicError} from "./journey-runtime-client.mjs";

// A source-status read never receives or replaces the pending registration.
// Authentication, context binding and provider consent stay with the BOS host.
export async function checkCallbackSourceReadiness({adapter, sourceContract, contact}) {
  const contract = structuredClone(sourceContract);
  const described = structuredClone(contact);
  validateApiContractResponse(contract);
  const descriptor = contract.input_schema["x-bos-callback-source"];
  if (!descriptor || contract.bosl_server_node !== false || contract.effect !== "read" ||
      contract.execution.method !== "GET" || contract.readiness.status !== "ready") {
    throw new Error("Discover an available read-only callback source status contract.");
  }
  if (described?.status !== "described" || described.operation !== contract.operation ||
      described.effect !== "read" || described.execution?.method !== "GET" ||
      described.execution.uri !== contract.execution.uri ||
      described.execution.context_header !== contract.execution.context_header ||
      described.sources?.length !== 1 ||
      described.sources[0].availability !== "ready" ||
      ["platform", "application", "plugin"].some(key =>
        described.sources[0].source?.[key] !== contract.source[key])) {
    throw new Error("Callback source status must match its fresh discovered contact.");
  }
  if (typeof adapter?.invokeDiscoveredOperation !== "function") {
    throw new TypeError("The existing BOS dependency adapter is required.");
  }
  const response = await adapter.invokeDiscoveredOperation(described);
  if (response.status === 200) {
    const valid = new Ajv2020({strict: false}).compile(contract.output_schema);
    const body = response.body;
    if (!valid(body) || !body || Object.keys(body).length !== 1 ||
        typeof body.ready !== "boolean") {
      throw new Error("Callback source returned an invalid readiness response.");
    }
    return {
      ready: body.ready,
      next: body.ready ? "author_journey" :
        contract.recovery?.action === "configure_source" ? "configure_source" : "source_unavailable",
      source: structuredClone(contract.source),
      ...(body.ready ? {} : {recovery: structuredClone(contract.recovery ?? {})})
    };
  }
  // Use the existing canonical error/privacy checks before exposing a failure.
  const error = validatePublicError(response.body?.error);
  const accessLost = response.status === 403 && error.code === "FORBIDDEN";
  const unavailable = response.status === 503 && error.code === "OPERATION_NOT_AVAILABLE";
  if (!accessLost && !unavailable && !contract.public_errors.some(item =>
    item.code === error.code && item.http_status === response.status && item.retryable === error.retryable)) {
    throw new Error("Callback source returned an undeclared readiness failure; refresh discovery.");
  }
  return {ready: false, next: accessLost ? "access_lost" : "source_unavailable", source: structuredClone(contract.source),
    error, recovery: structuredClone(contract.recovery ?? {})};
}
