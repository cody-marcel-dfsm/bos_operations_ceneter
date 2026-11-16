import {resolve} from "node:path";
import {exportRuntimeSkill, runtimeRepository} from "./lib/runtime-skill-export.mjs";

export function parseRuntimeExportArguments(args) {
  const values = {}; let preview = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--preview" && !preview) {preview = true; continue;}
    if (!["--commit", "--release", "--skill"].includes(key) || values[key] || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Invalid runtime export arguments");
    values[key] = args[++i];
  }
  const match = /^(ada)@(.+)$/.exec(values["--skill"] ?? "");
  if (!match) throw new Error("Supply --commit FULL_SHA --release EXACT_RELEASE --skill ada@EXACT_VERSION; preview requires --preview");
  return {pin: {repository: runtimeRepository, commit: values["--commit"], release: values["--release"], skill: match[1], version: match[2]}, preview};
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {process.stdout.write(JSON.stringify(await exportRuntimeSkill(parseRuntimeExportArguments(process.argv.slice(2))), null, 2) + "\n");}
  catch {process.stderr.write("Ada runtime export rejected: exact pins, complete content and published native provenance are required.\n"); process.exitCode = 1;}
}
