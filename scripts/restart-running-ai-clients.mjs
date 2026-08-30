import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const allowedClients = new Set(["ChatGPT"]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const args = process.argv.slice(2);
const delayIndex = args.indexOf("--delay-ms");
const delayMs = delayIndex >= 0 ? Number(args[delayIndex + 1]) : 45_000;
const pidIndex = args.indexOf("--pid");
const pid = pidIndex >= 0 ? Number(args[pidIndex + 1]) : null;
const clients = args.filter((value, index) =>
  index !== delayIndex && index !== delayIndex + 1 &&
  index !== pidIndex && index !== pidIndex + 1 && allowedClients.has(value)
);

if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 300_000) {
  throw new Error("Invalid client restart delay");
}
if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("Invalid client process ID");

await delay(delayMs);
try {
  process.kill(pid, "SIGKILL");
} catch (error) {
  if (error?.code !== "ESRCH") throw error;
}
await delay(2_000);
for (const client of clients) {
  await execFileAsync("/usr/bin/open", ["-a", client]);
}
