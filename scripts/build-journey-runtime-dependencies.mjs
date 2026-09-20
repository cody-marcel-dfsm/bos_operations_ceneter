#!/usr/bin/env node

import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { root } from "./lib/package-model.mjs";

const outputPaths = [
  join(
    root,
    "source",
    "platform",
    "bos-workflow-orchestrator",
    "scripts",
    "vendor",
    "ajv2020.bundle.mjs"
  ),
  join(
    root,
    "source",
    "platform",
    "bos-external-dependency-adapter",
    "scripts",
    "vendor",
    "ajv2020.bundle.mjs"
  )
];
const entryPoint = join(root, "scripts", "entries", "ajv2020-runtime.mjs");
const check = process.argv.slice(2).includes("--check");

if (process.argv.slice(2).some((argument) => argument !== "--check")) {
  throw new Error("Usage: node scripts/build-journey-runtime-dependencies.mjs [--check]");
}

const result = await build({
  entryPoints: [entryPoint],
  bundle: true,
  write: false,
  platform: "node",
  target: "node20",
  format: "esm",
  legalComments: "none",
  minify: true,
  charset: "utf8",
  logLevel: "silent"
});
const generated = Buffer.from(result.outputFiles[0].contents);

if (check) {
  for (const outputPath of outputPaths) {
    const committed = await readFile(outputPath).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!committed || !committed.equals(generated)) {
      throw new Error(
        "Journey runtime dependency bundle is stale; run npm run build:journey-runtime"
      );
    }
  }
} else {
  for (const outputPath of outputPaths) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, generated);
  }
}

console.log(`Journey runtime dependency bundle ${check ? "is current" : "generated"}.`);
