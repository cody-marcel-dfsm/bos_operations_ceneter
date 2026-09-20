#!/usr/bin/env node

import Ajv from "ajv";

const predicateOperators = new Set([
  "eq",
  "neq",
  "exists",
  "not_exists",
  "gt",
  "gte",
  "lt",
  "lte"
]);
const authorityContainers = new Set([
  "auth",
  "authentication",
  "authorization",
  "authority"
]);
const authorityDomains = new Set([
  "app",
  "application",
  "auth",
  "authentication",
  "authorization",
  "authority",
  "execution",
  "grant",
  "installation",
  "organization",
  "org",
  "principal",
  "role",
  "user"
]);
const authorityQualifiers = new Set([
  "context",
  "epoch",
  "id",
  "key",
  "scope",
  "selector",
  "token"
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finding(code, path, message) {
  return { code, path, message };
}

function asPath(instancePath) {
  return instancePath ? `$${instancePath.replaceAll("/", ".")}` : "$";
}

function validateWithPublishedSchema(document, publishedSchema, findings) {
  if (!isObject(publishedSchema)) {
    findings.push(finding(
      "BOSL_SCHEMA_MISSING",
      "$",
      "The authenticated BOSL schema is required before local validation."
    ));
    return;
  }
  try {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(publishedSchema);
    if (!validate(document)) {
      for (const error of validate.errors ?? []) {
        findings.push(finding(
          "BOSL_SCHEMA_INVALID",
          asPath(error.instancePath),
          `Published BOSL schema: ${error.message}.`
        ));
      }
    }
  } catch (error) {
    findings.push(finding(
      "BOSL_SCHEMA_INVALID",
      "$",
      `The authenticated BOSL schema could not be evaluated: ${error.message}`
    ));
  }
}

function collectEdges(node) {
  const edges = [];
  if (typeof node.next === "string") edges.push(node.next);
  for (const branch of [node.transitions, node.catch]) {
    if (!isObject(branch)) continue;
    for (const item of branch.cases ?? []) {
      if (typeof item?.next === "string") edges.push(item.next);
    }
    if (typeof branch.default === "string") edges.push(branch.default);
  }
  return edges;
}

function normalizedSecurityKey(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function validateSecurity(value, findings, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSecurity(item, findings, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [rawKey, child] of Object.entries(value)) {
    const key = normalizedSecurityKey(rawKey);
    const tokens = new Set(key.split("_"));
    const authoritySelector = [...tokens].some((token) => authorityDomains.has(token)) &&
      [...tokens].some((token) => authorityQualifiers.has(token));
    if (authorityContainers.has(key) || authoritySelector) {
      findings.push(finding(
        "BOSL_AUTHORITY_FIELD_FORBIDDEN",
        `${path}.${rawKey}`,
        "BOSL cannot carry caller-selected authority or execution context."
      ));
    }
    validateSecurity(child, findings, `${path}.${rawKey}`);
  }
}

function validatePredicate(predicate, path, allowedPrefix, findings, depth = 0) {
  if (!isObject(predicate)) {
    findings.push(finding("BOSL_PREDICATE_INVALID", path, "Predicate must be an object."));
    return;
  }
  const groups = ["all", "any"].filter((key) => Object.hasOwn(predicate, key));
  if (groups.length) {
    if (depth > 0 || groups.length !== 1 || Object.keys(predicate).length !== 1) {
      findings.push(finding(
        "BOSL_PREDICATE_NESTED",
        path,
        "Predicates permit one non-nested all or any group."
      ));
      return;
    }
    const children = predicate[groups[0]];
    if (!Array.isArray(children) || children.length === 0) {
      findings.push(finding(
        "BOSL_PREDICATE_INVALID",
        `${path}.${groups[0]}`,
        "Predicate group must contain at least one simple predicate."
      ));
      return;
    }
    children.forEach((child, index) => validatePredicate(
      child,
      `${path}.${groups[0]}[${index}]`,
      allowedPrefix,
      findings,
      depth + 1
    ));
    return;
  }
  if (!predicateOperators.has(predicate.op)) {
    findings.push(finding(
      "BOSL_PREDICATE_OPERATOR_INVALID",
      `${path}.op`,
      "Predicate operator is outside the published bounded set."
    ));
  }
  if (!isObject(predicate.left) ||
      typeof predicate.left.from !== "string" ||
      !predicate.left.from.startsWith(allowedPrefix)) {
    findings.push(finding(
      "BOSL_PREDICATE_REFERENCE_INVALID",
      `${path}.left`,
      `Predicate left reference must begin with ${allowedPrefix}.`
    ));
  }
  const unary = ["exists", "not_exists"].includes(predicate.op);
  if (unary && Object.hasOwn(predicate, "right")) {
    findings.push(finding(
      "BOSL_PREDICATE_RIGHT_INVALID",
      `${path}.right`,
      `${predicate.op} must omit right.`
    ));
  }
  if (!unary && !isObject(predicate.right)) {
    findings.push(finding(
      "BOSL_PREDICATE_RIGHT_REQUIRED",
      `${path}.right`,
      `${predicate.op ?? "This operator"} requires right.`
    ));
  }
}

function validateBranch(branch, path, allowedPrefix, nodeCodes, findings) {
  if (!isObject(branch)) {
    findings.push(finding("BOSL_BRANCH_INVALID", path, "Branch must be an object."));
    return;
  }
  if (!Array.isArray(branch.cases)) {
    findings.push(finding("BOSL_BRANCH_CASES_REQUIRED", `${path}.cases`, "cases must be an array."));
  } else {
    branch.cases.forEach((item, index) => {
      const casePath = `${path}.cases[${index}]`;
      if (!isObject(item)) {
        findings.push(finding("BOSL_BRANCH_CASE_INVALID", casePath, "Case must be an object."));
        return;
      }
      validatePredicate(item.when, `${casePath}.when`, allowedPrefix, findings);
      if (typeof item.next !== "string" || !nodeCodes.has(item.next)) {
        findings.push(finding(
          "BOSL_TARGET_UNKNOWN",
          `${casePath}.next`,
          "Case next must reference a declared node."
        ));
      }
    });
  }
  if (typeof branch.default !== "string" || !nodeCodes.has(branch.default)) {
    findings.push(finding(
      "BOSL_BRANCH_DEFAULT_REQUIRED",
      `${path}.default`,
      "A branch default referencing a declared node is required."
    ));
  }
}

function validateInputReference(value, path, document, nodesByCode, findings) {
  if (!isObject(value)) {
    findings.push(finding("BOSL_INPUT_INVALID", path, "Input binding must be an object."));
    return;
  }
  const hasFrom = Object.hasOwn(value, "from");
  const hasValue = Object.hasOwn(value, "value");
  if (hasFrom === hasValue) {
    findings.push(finding(
      "BOSL_INPUT_SOURCE_INVALID",
      path,
      "Input binding must declare exactly one of from or value."
    ));
    return;
  }
  if (Object.hasOwn(value, "optional") && typeof value.optional !== "boolean") {
    findings.push(finding("BOSL_OPTIONAL_INVALID", `${path}.optional`, "optional must be boolean."));
  }
  if (!hasFrom) return;
  if (typeof value.from !== "string") {
    findings.push(finding("BOSL_REFERENCE_INVALID", `${path}.from`, "Reference must be a string."));
    return;
  }
  const journey = value.from.match(/^\$journey\.inputs\.([A-Za-z0-9_-]+)$/);
  if (journey) {
    if (!Object.hasOwn(document.inputs ?? {}, journey[1])) {
      findings.push(finding(
        "BOSL_REFERENCE_UNKNOWN",
        `${path}.from`,
        `Journey input ${journey[1]} is not declared.`
      ));
    }
    return;
  }
  const output = value.from.match(/^\$nodes\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+)$/);
  if (output) {
    const producer = nodesByCode.get(output[1]);
    if (!producer || !Object.hasOwn(producer.outputs ?? {}, output[2])) {
      findings.push(finding(
        "BOSL_REFERENCE_UNKNOWN",
        `${path}.from`,
        `Node output ${output[1]}.${output[2]} is not declared.`
      ));
    }
    return;
  }
  const error = value.from.match(/^\$nodes\.([A-Za-z0-9_-]+)\.error$/);
  if (error) {
    if (!nodesByCode.has(error[1])) {
      findings.push(finding(
        "BOSL_REFERENCE_UNKNOWN",
        `${path}.from`,
        `Node ${error[1]} is not declared.`
      ));
    }
    return;
  }
  findings.push(finding(
    "BOSL_REFERENCE_INVALID",
    `${path}.from`,
    "Reference is outside the published journey input, node output, and node error forms."
  ));
}

function validateBoundedCycles(nodesByCode, findings) {
  const unbounded = new Set(
    [...nodesByCode]
      .filter(([, node]) => !Number.isInteger(node.max_visits))
      .map(([code]) => code)
  );
  const visiting = new Set();
  const visited = new Set();
  const visit = (code) => {
    if (visiting.has(code)) return true;
    if (visited.has(code)) return false;
    visiting.add(code);
    const node = nodesByCode.get(code);
    for (const target of collectEdges(node ?? {})) {
      if (unbounded.has(target) && visit(target)) return true;
    }
    visiting.delete(code);
    visited.add(code);
    return false;
  };
  for (const code of unbounded) {
    if (visit(code)) {
      findings.push(finding(
        "BOSL_CYCLE_UNBOUNDED",
        "$.nodes",
        "Every graph cycle must pass through a node with max_visits."
      ));
      return;
    }
  }
}

function validOperationLimits(operation) {
  return isObject(operation?.limits) &&
    Number.isInteger(operation.limits.maximum_duration_seconds) &&
    operation.limits.maximum_duration_seconds >= 1 &&
    operation.limits.maximum_duration_seconds <= 900 &&
    Number.isInteger(operation.limits.maximum_fan_out) &&
    operation.limits.maximum_fan_out >= 1 &&
    operation.limits.maximum_fan_out <= 100;
}

function operationIdentifier(operation) {
  if (!isObject(operation)) return null;
  const semantic = operation.semantic_operation_id;
  const described = operation.operation;
  if (typeof semantic === "string" && typeof described === "string" &&
      semantic !== described) return null;
  if (typeof semantic === "string" && semantic) return semantic;
  if (typeof described === "string" && described) return described;
  return null;
}

export function validateBoslDocument(document, {
  publishedSchema,
  operationContracts = []
} = {}) {
  const findings = [];
  validateWithPublishedSchema(document, publishedSchema, findings);
  validateSecurity(document, findings);
  if (!isObject(document) || !Array.isArray(document.nodes)) {
    return { valid: false, findings };
  }
  const operations = new Map();
  for (const operation of operationContracts) {
    const operationId = operationIdentifier(operation);
    if (operationId) {
      if (operations.has(operationId)) {
        findings.push(finding(
          "BOSL_OPERATION_DUPLICATE",
          `$.operations.${operationId}`,
          `Discovered operation ${operationId} is duplicated.`
        ));
        continue;
      }
      if (validOperationLimits(operation)) {
        operations.set(operationId, operation);
      } else {
        findings.push(finding(
          "BOSL_OPERATION_LIMITS_INVALID",
          `$.operations.${operationId}.limits`,
          "Discovered operation limits require maximum_duration_seconds 1..900 and maximum_fan_out 1..100."
        ));
      }
    }
  }
  const nodesByCode = new Map();
  document.nodes.forEach((node, index) => {
    const path = `$.nodes[${index}]`;
    if (!isObject(node) || typeof node.code !== "string" || !node.code) {
      findings.push(finding("BOSL_NODE_CODE_INVALID", `${path}.code`, "Node code is required."));
      return;
    }
    if (nodesByCode.has(node.code)) {
      findings.push(finding("BOSL_NODE_DUPLICATE", `${path}.code`, `Node ${node.code} is duplicated.`));
      return;
    }
    nodesByCode.set(node.code, node);
  });
  if (typeof document.entry !== "string" || !nodesByCode.has(document.entry)) {
    findings.push(finding("BOSL_ENTRY_UNKNOWN", "$.entry", "entry must reference a declared node."));
  }
  const nodeCodes = new Set(nodesByCode.keys());
  document.nodes.forEach((node, index) => {
    if (!isObject(node) || typeof node.code !== "string") return;
    const path = `$.nodes[${index}]`;
    if (!["client", "server"].includes(node.type)) {
      findings.push(finding("BOSL_NODE_TYPE_INVALID", `${path}.type`, "Node type must be client or server."));
    }
    if (node.type === "client") {
      if (Object.hasOwn(node, "operation")) {
        findings.push(finding(
          "BOSL_NODE_OWNERSHIP_MIXED",
          `${path}.operation`,
          "Client nodes cannot declare a server operation."
        ));
      }
      if (!isObject(node.instruction)) {
        findings.push(finding(
          "BOSL_CLIENT_INSTRUCTION_REQUIRED",
          `${path}.instruction`,
          "Client nodes require a structured instruction."
        ));
      }
    }
    if (node.type === "server") {
      if (Object.hasOwn(node, "instruction")) {
        findings.push(finding(
          "BOSL_NODE_OWNERSHIP_MIXED",
          `${path}.instruction`,
          "Server nodes cannot declare a client instruction."
        ));
      }
      if (node.terminal !== true) {
        if (typeof node.operation !== "string" || !node.operation) {
          findings.push(finding(
            "BOSL_SERVER_OPERATION_REQUIRED",
            `${path}.operation`,
            "Nonterminal server nodes require a semantic operation."
          ));
        } else if (!operations.has(node.operation)) {
          findings.push(finding(
            "BOSL_OPERATION_UNDISCOVERED",
            `${path}.operation`,
            `Operation ${node.operation} is not present in current discovery.`
          ));
        }
      }
    }
    if (node.max_visits !== undefined &&
        (!Number.isInteger(node.max_visits) || node.max_visits < 1)) {
      findings.push(finding(
        "BOSL_MAX_VISITS_INVALID",
        `${path}.max_visits`,
        "max_visits must be a positive integer."
      ));
    }
    if (!isObject(node.inputs)) {
      findings.push(finding("BOSL_INPUTS_INVALID", `${path}.inputs`, "inputs must be an object."));
    } else {
      for (const [name, value] of Object.entries(node.inputs)) {
        validateInputReference(value, `${path}.inputs.${name}`, document, nodesByCode, findings);
      }
    }
    if (!isObject(node.outputs)) {
      findings.push(finding("BOSL_OUTPUTS_INVALID", `${path}.outputs`, "outputs must be an object."));
    }
    const hasNext = Object.hasOwn(node, "next");
    const hasTransitions = Object.hasOwn(node, "transitions");
    if (node.terminal === true) {
      if (hasNext || hasTransitions) {
        findings.push(finding(
          "BOSL_TERMINAL_ROUTE_INVALID",
          path,
          "Terminal nodes cannot declare next or transitions."
        ));
      }
    } else if (hasNext === hasTransitions) {
      findings.push(finding(
        "BOSL_SUCCESS_ROUTE_INVALID",
        path,
        "Each nonterminal node must declare exactly one of next or transitions."
      ));
    }
    if (hasNext && (typeof node.next !== "string" || !nodeCodes.has(node.next))) {
      findings.push(finding(
        "BOSL_TARGET_UNKNOWN",
        `${path}.next`,
        "next must reference a declared node."
      ));
    }
    if (hasTransitions) {
      validateBranch(node.transitions, `${path}.transitions`, "$outputs.", nodeCodes, findings);
    }
    if (Object.hasOwn(node, "catch")) {
      validateBranch(node.catch, `${path}.catch`, "$error.", nodeCodes, findings);
    }
  });

  if (nodesByCode.has(document.entry)) {
    const reachable = new Set();
    const pending = [document.entry];
    while (pending.length) {
      const code = pending.pop();
      if (reachable.has(code)) continue;
      reachable.add(code);
      for (const target of collectEdges(nodesByCode.get(code))) pending.push(target);
    }
    for (const code of nodeCodes) {
      if (!reachable.has(code)) {
        findings.push(finding(
          "BOSL_NODE_UNREACHABLE",
          `$.nodes.${code}`,
          `Node ${code} is unreachable from entry.`
        ));
      }
    }
  }
  validateBoundedCycles(nodesByCode, findings);
  return { valid: findings.length === 0, findings };
}

export function createRegistrationDocument(document, options) {
  const validation = validateBoslDocument(document, options);
  if (!validation.valid) {
    const error = new Error("BOSL document failed local structural validation");
    error.findings = validation.findings;
    throw error;
  }
  return structuredClone(document);
}

export function buildExplainPlan({ objective, document, operationContracts = [] }) {
  if (typeof objective !== "string" || !objective.trim()) {
    throw new Error("objective must be a non-empty string");
  }
  const operations = new Map();
  for (const operation of operationContracts) {
    const operationId = operationIdentifier(operation);
    if (!operationId || !validOperationLimits(operation)) {
      throw new Error("explain plan operations require the published duration and fan-out limits");
    }
    if (operations.has(operationId)) {
      throw new Error(`explain plan operation ${operationId} is duplicated`);
    }
    operations.set(operationId, operation);
  }
  return {
    objective: objective.trim(),
    steps: document.nodes.map((node) => {
      const operation = node.operation ? operations.get(node.operation) : undefined;
      const failureTargets = [];
      for (const item of node.catch?.cases ?? []) failureTargets.push(item.next);
      if (node.catch?.default) failureTargets.push(node.catch.default);
      return {
        code: node.code,
        owner: node.type,
        semantic_operation: node.operation ?? null,
        inputs: Object.keys(node.inputs ?? {}),
        outputs: Object.keys(node.outputs ?? {}),
        effect: operation?.effect ?? null,
        approval_required: operation?.approval?.required === true,
        limits: operation?.limits ? structuredClone(operation.limits) : null,
        success_targets: collectEdges({
          next: node.next,
          transitions: node.transitions
        }),
        failure_targets: [...new Set(failureTargets)],
        recovery_bounded_by: node.max_visits ?? null
      };
    })
  };
}
