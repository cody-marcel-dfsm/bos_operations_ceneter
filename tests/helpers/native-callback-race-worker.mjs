// Owned adversarial subprocess for queue publication/crash tests. No host APIs,
// real identity, connection, credentials or scheduler are used.
import fs, {readFile, writeFile, open, rename} from "node:fs/promises";
import {syncBuiltinESMExports} from "node:module";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {createNativeContinuationStore} from "../../source/platform/bos-workflow-orchestrator/scripts/native-callback-store.mjs";

const input = JSON.parse(process.argv[2]);
async function hold() {
  await writeFile(input.entered, "ready", {mode: 0o600});
  for (let attempt = 0; attempt < 1000; attempt++) {
    try { await readFile(input.release); return; } catch (error) { if (error.code !== "ENOENT") throw error; }
    await delay(10);
  }
  throw new Error("Owned queue publication barrier expired");
}
try {
  if (input.method === "legacy-write") {
    // Exercise the prior implementation's final publication mechanism while its
    // state snapshot and temporary descriptor predate a directory migration.
    const directory = join(input.root, input.registration), target = join(directory, "state.json");
    const value = JSON.parse(await readFile(target, "utf8")); value.status = "OPEN";
    const temporary = join(directory, ".legacy-publication.tmp");
    const file = await open(temporary, "wx", 0o600);
    await file.writeFile(JSON.stringify(value)); await file.sync(); await file.close();
    await hold(); await rename(temporary, target);
    console.log(JSON.stringify({legacyPublished: true}));
  } else {
    const store = await createNativeContinuationStore({root: input.root, taskIdentity: "synthetic_current_task",
      sourceKey: "a".repeat(64), clock: () => input.now});
    if (input.hold) {
      const original = fs.rename;
      fs.rename = async (from, to) => {
        if (to === join(input.root, `queue-${input.registration}`, "state.json")) await hold();
        return original(from, to);
      };
      syncBuiltinESMExports();
    }
    if (!["plan", "cancel"].includes(input.method)) throw new Error("Unknown owned test method");
    console.log(JSON.stringify(await store[input.method](input.registration)));
  }
} catch (error) { console.error(error.code ?? error.message); process.exitCode = 1; }
