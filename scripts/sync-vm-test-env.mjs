#!/usr/bin/env node

import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(
  process.argv[2] ?? `${root}/../lead_director/.env.staging`
);
const destination = resolve(process.argv[3] ?? `${root}/.env`);
const allowed = new Set(["CALIMATIC_API_TOKEN", "BOS_TEST_API_KEY"]);

function parse(content) {
  const values = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

const sourceValues = parse(await readFile(source, "utf8"));
let destinationValues = new Map();
try {
  destinationValues = parse(await readFile(destination, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const copied = [];
for (const name of allowed) {
  const value = sourceValues.get(name);
  if (value) {
    destinationValues.set(name, value);
    copied.push(name);
  }
}
if (!copied.includes("CALIMATIC_API_TOKEN")) {
  throw new Error("CALIMATIC_API_TOKEN is absent from the Lead Director environment");
}

const output = [...destinationValues]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, value]) => `${name}=${value}`)
  .join("\n");
await writeFile(destination, `${output}\n`, { mode: 0o600 });
await chmod(destination, 0o600);
process.stdout.write(`Copied secret names only: ${copied.join(", ")}\n`);
