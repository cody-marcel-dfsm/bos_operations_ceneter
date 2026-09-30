#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const directory = join(root, "contracts", "bos-client-dependency.v1");
const manifestPath = join(directory, "manifest.json");
const discoveredOperationSchemaPath = join(
  directory,
  "discovered-operation.request.schema.json"
);
const discoveredOperationRuntimeSchemaPath = join(
  root,
  "source/platform/bos-external-dependency-adapter/scripts/discovered-operation-request.schema.mjs"
);
const check = process.argv.includes("--check");
const executableDefinitions = [
  {
    id: "external_dependency_adapter",
    source_path: "source/platform/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs",
    path: "skills/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs"
  },
  {
    id: "external_dependency_schema_runtime",
    source_path: "source/platform/bos-external-dependency-adapter/scripts/vendor/ajv2020.bundle.mjs",
    path: "skills/bos-external-dependency-adapter/scripts/vendor/ajv2020.bundle.mjs"
  },
  {
    id: "external_dependency_discovered_operation_schema",
    source_path: "source/platform/bos-external-dependency-adapter/scripts/discovered-operation-request.schema.mjs",
    path: "skills/bos-external-dependency-adapter/scripts/discovered-operation-request.schema.mjs"
  },
  {
    id: "external_dependency_safe_execution_uri",
    source_path: "source/platform/bos-external-dependency-adapter/scripts/safe-execution-uri.mjs",
    path: "skills/bos-external-dependency-adapter/scripts/safe-execution-uri.mjs"
  },
  {
    id: "shared_cache_consumer",
    source_path: "source/platform/bos-mcp-client/scripts/shared-cache-consumer.mjs",
    path: "skills/bos-mcp-client/scripts/shared-cache-consumer.mjs"
  }
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const operationId = {type: "string", pattern: "^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$"};
const sourceReference = {
  type: "object",
  additionalProperties: false,
  required: ["platform", "application", "plugin"],
  properties: {
    platform: {type: "string", minLength: 1},
    application: {type: "string", minLength: 1},
    plugin: {type: "string", minLength: 1}
  }
};
const operationSchema = {
  type: "object",
  required: ["$schema", "type", "x-bos-fields"],
  properties: {
    $schema: {const: "https://json-schema.org/draft/2020-12/schema"},
    type: {const: "object"},
    "x-bos-fields": {type: "array"}
  }
};
const limits = {
  type: "object",
  additionalProperties: false,
  required: [
    "max_targets", "max_results_per_source", "pagination_supported",
    "bulk_supported", "streaming_supported", "maximum_duration_seconds",
    "maximum_fan_out"
  ],
  properties: {
    max_targets: {type: ["integer", "null"], minimum: 1},
    max_results_per_source: {type: ["integer", "null"], minimum: 1},
    pagination_supported: {type: "boolean"},
    bulk_supported: {type: "boolean"},
    streaming_supported: {type: "boolean"},
    maximum_attachment_bytes: {
      type: "integer",
      minimum: 1,
      maximum: 25 * 1024 * 1024
    },
    maximum_duration_seconds: {type: "integer", minimum: 1},
    maximum_fan_out: {type: "integer", minimum: 1}
  }
};
const guarantees = {
  type: "object",
  additionalProperties: false,
  required: [
    "read_consistency", "per_source_atomicity", "cross_source_atomicity",
    "convergence", "idempotency"
  ],
  properties: {
    read_consistency: {type: "string", minLength: 1},
    per_source_atomicity: {type: "string", minLength: 1},
    cross_source_atomicity: {type: "string", minLength: 1},
    convergence: {type: "string", minLength: 1},
    idempotency: {const: "service_owned"}
  }
};
const errorContract = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "codes"],
  properties: {
    schema: {const: "lead-director-public-error/v1"},
    codes: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: {
        type: "string",
        pattern: "^(?:[a-z][a-z0-9_]{0,127}|[A-Z][A-Z0-9_]{0,127})$"
      }
    }
  }
};
const describedOperation = {
  type: "object",
  additionalProperties: false,
  required: [
    "operation", "status", "effect", "limits", "guarantees", "execution",
    "input_schema", "output_schema", "error_contract", "sources"
  ],
  properties: {
    operation: operationId,
    status: {const: "described"},
    effect: {type: "string", minLength: 1},
    limits,
    guarantees,
    execution: {
      type: "object",
      additionalProperties: false,
      required: ["method", "uri", "context_header"],
      properties: {
        method: {enum: ["GET", "POST", "PUT", "PATCH", "DELETE"]},
        uri: {
          type: "string",
          maxLength: 4096,
          pattern: "^/bos/(?!/)(?!.*//)(?!(?:[^/?]+/)*\\.{1,2}(?:/|\\?|$))(?!.*[#\\\\\\u0000-\\u001F\\u007F])(?:[A-Za-z0-9._~!$&'()*+,;=:@{}/?-]|%[0-9A-F]{2})+$"
        },
        context_header: {const: "X-BOS-Context-Handle"},
        transport: {type: "null"},
        response: {
          type: "object",
          additionalProperties: false,
          required: ["body", "content_type", "headers"],
          properties: {
            body: {const: "binary"},
            content_type: {const: "provider"},
            headers: {
              type: "array",
              minItems: 6,
              maxItems: 6,
              uniqueItems: true,
              items: {enum: [
                "Content-Disposition", "Content-Length", "Content-Type",
                "Digest", "X-Content-SHA256", "X-Correlation-ID"
              ]},
              allOf: [
                {contains: {const: "Content-Disposition"}},
                {contains: {const: "Content-Length"}},
                {contains: {const: "Content-Type"}},
                {contains: {const: "Digest"}},
                {contains: {const: "X-Content-SHA256"}},
                {contains: {const: "X-Correlation-ID"}}
              ]
            }
          }
        }
      }
    },
    input_schema: operationSchema,
    output_schema: operationSchema,
    error_contract: errorContract,
    sources: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["source", "availability"],
        properties: {
          source: sourceReference,
          availability: {enum: [
            "ready", "provider_authorization_required", "source_not_available",
            "source_temporarily_unavailable"
          ]}
        }
      }
    }
  }
};
const discoveredOperationSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "bos://contracts/client-dependency/v1/discovered-operation-request",
  type: "object",
  additionalProperties: false,
  required: ["contact"],
  properties: {
    contact: {$ref: "#/$defs/described_operation"},
    payload: true
  },
  allOf: [{
    properties: {
      contact: {
        properties: {
          execution: {
            properties: {
              method: {enum: ["GET", "POST", "PUT", "PATCH", "DELETE"]},
              uri: {type: "string"},
              context_header: {const: "X-BOS-Context-Handle"},
              transport: {type: "null"},
              response: {$ref: "#/$defs/described_operation/properties/execution/properties/response"}
            },
            required: ["method", "uri", "context_header"]
          }
        },
        required: ["execution"]
      }
    },
    required: ["contact"]
  }, {
    if: {
      properties: {
        contact: {
          properties: {
            execution: {
              properties: {method: {const: "GET"}},
              required: ["method"]
            }
          },
          required: ["execution"]
        }
      },
      required: ["contact"]
    },
    then: {not: {required: ["payload"]}},
    else: {required: ["payload"]}
  }],
  $defs: {described_operation: describedOperation}
};
const discoveredOperationSerialized = `${JSON.stringify(discoveredOperationSchema, null, 2)}\n`;
const discoveredOperationRuntimeSerialized =
  `// Generated by scripts/build-bos-client-dependency-contract.mjs. Do not edit.\n` +
  `export default ${JSON.stringify(discoveredOperationSchema, null, 2)};\n`;
if (check) {
  let current;
  try { current = await readFile(discoveredOperationSchemaPath, "utf8"); } catch { current = ""; }
  if (current !== discoveredOperationSerialized) {
    process.stderr.write("Discovered operation request schema is stale\n");
    process.exitCode = 1;
  }
  let runtimeCurrent;
  try { runtimeCurrent = await readFile(discoveredOperationRuntimeSchemaPath, "utf8"); } catch { runtimeCurrent = ""; }
  if (runtimeCurrent !== discoveredOperationRuntimeSerialized) {
    process.stderr.write("Discovered operation runtime schema is stale\n");
    process.exitCode = 1;
  }
} else {
  await writeFile(discoveredOperationSchemaPath, discoveredOperationSerialized);
  await writeFile(discoveredOperationRuntimeSchemaPath, discoveredOperationRuntimeSerialized);
}

const names = (await readdir(directory))
  .filter((name) => name !== "manifest.json" && !name.startsWith("."))
  .sort();
const files = [];
for (const path of names) {
  const content = await readFile(join(directory, path));
  files.push({
    path,
    media_type: path.endsWith(".schema.json")
      ? "application/schema+json"
      : path.endsWith(".json") ? "application/json" : "text/markdown",
    sha256: sha256(content)
  });
}
const executable_files = [];
for (const definition of executableDefinitions) {
  executable_files.push({
    id: definition.id,
    path: definition.path,
    sha256: sha256(await readFile(join(root, definition.source_path)))
  });
}
const bundleSha256 = sha256([
  ...files.map(({ path, sha256: digest }) => `contract\u0000${path}\u0000${digest}`),
  ...executable_files.map(({ path, sha256: digest }) =>
    `executable\u0000${path}\u0000${digest}`)
].join("\n"));
const manifest = {
  contract: "bos-client-dependency-release/v1",
  contract_id: "bos-client-dependency",
  contract_version: "bos-client-dependency/v1",
  owner: "bos-operations-center",
  authentication_impact: "preserves-single-bos-connection",
  compatibility: "package-versioned-public-seam",
  executable_files,
  files,
  bundle_sha256: bundleSha256
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (check) {
  let current;
  try { current = await readFile(manifestPath, "utf8"); } catch { current = ""; }
  if (current !== serialized) {
    process.stderr.write("BOS client dependency contract manifest is stale\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(`${JSON.stringify({ valid: true, bundle_sha256: bundleSha256 })}\n`);
  }
} else {
  await writeFile(manifestPath, serialized);
  process.stdout.write(`${JSON.stringify({ written: true, bundle_sha256: bundleSha256 })}\n`);
}
