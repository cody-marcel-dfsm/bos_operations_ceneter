import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateAppDescribe,
  validatePluginsList
} from "../source/platform/bos-app-discovery/scripts/validate-discovery.mjs";
import {
  buildActionRequest,
  interpretJourneyResponse,
  validateRegistrationResponse
} from "../source/platform/bos-workflow-orchestrator/scripts/journey-runtime-client.mjs";

const fixture = JSON.parse(await readFile(
  new URL("./fixtures/agent-driven-custom-journey.json", import.meta.url),
  "utf8"
));
const publicAppDescribe = JSON.parse(await readFile(
  new URL(
    "./fixtures/public-contracts/lead-director/v1/app.describe.example.json",
    import.meta.url
  ),
  "utf8"
));

test("approved journey transcript validates and follows only returned actions", () => {
  assert.deepEqual(fixture.app_describe, publicAppDescribe);
  validateAppDescribe(fixture.app_describe);
  validatePluginsList(fixture.plugins_list);
  const registration = validateRegistrationResponse(fixture.registration);
  assert.equal(buildActionRequest(registration.action).href, registration.action.href);

  const start = interpretJourneyResponse(fixture.start);
  assert.equal(start.next, "client_instruction");
  const completeAction = start.instruction.after_success;
  assert.deepEqual(JSON.parse(buildActionRequest(
    completeAction,
    { approval: { confirmed: true } }
  ).body), { approval: { confirmed: true } });

  const completedStep = interpretJourneyResponse(fixture.complete);
  assert.equal(completedStep.next, "invoke_action");
  assert.equal(buildActionRequest(completedStep.action).href, completedStep.action.href);

  const progress = interpretJourneyResponse(fixture.in_progress);
  assert.equal(progress.next, "poll_state");
  assert.equal(progress.retry_after_seconds, 5);
  assert.equal(
    fixture.in_progress.body.current_node.operation,
    "sendgrid-email.campaign.send"
  );
  assert.equal(buildActionRequest(progress.action).method, "GET");

  const terminal = interpretJourneyResponse(fixture.completed);
  assert.equal(terminal.next, "terminal");
  assert.equal(terminal.body.outcome.campaign_outcome.successful_sends, 1);
});

test("approved executable fixture contains only the controlled attendee", () => {
  const serialized = JSON.stringify(fixture);
  const addresses = serialized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  assert.deepEqual([...new Set(addresses)], ["cody.marcel@dfsm.ai"]);
});

test("fixture has no client-generated or server-internal journey fields", () => {
  const serialized = JSON.stringify(fixture);
  for (const forbidden of [
    "execution_id",
    "journey_id",
    "revision",
    "occurrence",
    "idempotency_key",
    "retry_count",
    "provider_id",
    "database_id"
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, forbidden);
  }
});
