#!/usr/bin/env node
import {open} from "node:fs/promises";
import {createStandaloneBosTransport} from "../source/platform/bos-mcp-client/scripts/standalone-device-auth.mjs";
import {verifyStandaloneDeviceSession} from "./lib/standalone-device-acceptance.mjs";

// Explicit human-run acceptance; challenge bypasses redirected stdout/stderr logs.
if (process.argv.slice(2).join(" ") !== "--user-verification") {
  console.error("Explicit user verification required: --user-verification. No browser is launched.");
  process.exitCode = 2;
} else {
  let tty;
  try {
    if (!process.stdin.isTTY) throw new Error();
    tty = await open("/dev/tty", "w");
    let record = null;
    const transport = createStandaloneBosTransport({
      credentialStore: {async load() {return record;}, async save(_key, value) {record = structuredClone(value);}, async delete() {record = null;}},
      presentVerification: async ({verification_uri, user_code, expires_in}) => {
        await tty.write(`Open ${verification_uri} in your own browser. Enter ${user_code}. Confirm the displayed client, BOS resource and account before approving. Expires in ${expires_in} seconds.\n`);
        return true;
      }
    });
    const result = await verifyStandaloneDeviceSession({transport});
    record = null; // Ephemeral process-private acceptance store; no persistence or logs.
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "passed") process.exitCode = 1;
  } catch {
    console.error("A direct-user terminal verification surface is required; live acceptance was not run.");
    process.exitCode = 2;
  } finally { await tty?.close(); }
}
