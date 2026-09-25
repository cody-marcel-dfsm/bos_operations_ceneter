#!/usr/bin/env node

import {readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {root, stableJson} from "./lib/package-model.mjs";
import {syntheticIdentity} from "./lib/synthetic-fixtures.mjs";

const identity = syntheticIdentity("journey-acceptance");
const acceptancePath = join(root, "acceptance", "fixtures", "recent-meeting-follow-up.bosl.json");
const transcriptPath = join(root, "tests", "fixtures", "agent-driven-custom-journey.json");

const acceptance = JSON.parse(await readFile(acceptancePath, "utf8"));
acceptance.inputs.attendees = [{
  email: identity.email,
  display_name: identity.display_name,
  response_status: "accepted"
}];
await writeFile(acceptancePath, stableJson(acceptance));

const transcript = JSON.parse(await readFile(transcriptPath, "utf8"));
transcript.controlled_attendee = identity.email;
await writeFile(transcriptPath, stableJson(transcript));

console.log(`Generated tenant-neutral fixtures for ${identity.token}.`);
