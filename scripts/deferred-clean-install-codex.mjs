import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  CODEX_CLEAN_CONFIRMATION,
  cleanInstallCodex
} from "./clean-install-codex.mjs";

const execFileAsync = promisify(execFile);

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function parseArgs(argv) {
  const options = { delayMs: 45_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--delay-ms") options.delayMs = Number(argv[++index]);
    else if (argument === "--pid") options.pid = Number(argv[++index]);
    else if (argument === "--home") options.home = resolve(argv[++index]);
    else if (argument === "--source") options.source = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isSafeInteger(options.delayMs) || options.delayMs < 0 || options.delayMs > 300_000) {
    throw new Error("Invalid clean-install delay");
  }
  if (!Number.isSafeInteger(options.pid) || options.pid <= 1) {
    throw new Error("Invalid ChatGPT process ID");
  }
  if (!options.home || !options.source) throw new Error("Home and source are required");
  return options;
}

const options = parseArgs(process.argv.slice(2));
await access(options.source);
await delay(options.delayMs);
try {
  process.kill(options.pid, "SIGKILL");
} catch (error) {
  if (error?.code !== "ESRCH") throw error;
}
await delay(2_000);
try {
  await cleanInstallCodex({
    home: options.home,
    source: options.source,
    confirmation: CODEX_CLEAN_CONFIRMATION,
    deferWhileRunning: false
  });
} finally {
  await execFileAsync("/usr/bin/open", ["-a", "ChatGPT"]);
}
