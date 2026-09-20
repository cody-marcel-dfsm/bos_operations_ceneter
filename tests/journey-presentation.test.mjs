import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCampaignMetricsRequest,
  buildCampaignStatusRequest,
  buildJourneyGraphView,
  presentCampaignMetrics,
  presentCampaignStatus,
  presentClientInstruction,
  presentClientResolution
} from "../source/platform/bos-workflow-orchestrator/scripts/journey-presentation.mjs";

const contextHandle = `bos_ctx_v2_${"b".repeat(64)}`;

const statusContract = {
  operation: "sendgrid-email.campaign.status",
  status: "described",
  execution: {
    context_header: "X-BOS-Context-Handle",
    method: "POST",
    transport: null,
    uri: "/bos/apps/lead-director/api/v1/organizations/{organization}/campaign/status"
  },
  input_schema: {
    type: "object",
    required: ["category"],
    properties: { category: { type: "string", minLength: 1 } },
    additionalProperties: false
  }
};

const metricsContract = {
  operation: "sendgrid-email.campaign.metrics",
  status: "described",
  execution: {
    context_header: "X-BOS-Context-Handle",
    method: "POST",
    transport: null,
    uri: "/bos/apps/lead-director/api/v1/organizations/{organization}/campaign/metrics"
  },
  input_schema: {
    type: "object",
    required: ["category"],
    properties: {
      category: { type: "string", minLength: 1 },
      observation_window: {
        type: "object",
        required: ["from", "through"],
        properties: {
          from: { type: "string", format: "date-time" },
          through: { type: "string", format: "date-time" }
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  }
};

test("campaign requests use only the discovered contract and category", () => {
  const status = buildCampaignStatusRequest(
    statusContract,
    "fall-follow-up",
    contextHandle
  );
  assert.deepEqual(JSON.parse(status.body), { category: "fall-follow-up" });
  assert.equal(status.href, statusContract.execution.uri);
  assert.equal(status.headers["X-BOS-Context-Handle"], contextHandle);

  const general = buildCampaignMetricsRequest(
    metricsContract,
    "fall-follow-up",
    contextHandle
  );
  assert.deepEqual(JSON.parse(general.body), { category: "fall-follow-up" });
  const explicit = buildCampaignMetricsRequest(
    metricsContract,
    "fall-follow-up",
    contextHandle,
    {
      from: "2026-09-16T14:45:00-06:00",
      through: "2026-09-18T12:00:00-06:00"
    }
  );
  assert.deepEqual(JSON.parse(explicit.body), {
    category: "fall-follow-up",
    observation_window: {
      from: "2026-09-16T14:45:00-06:00",
      through: "2026-09-18T12:00:00-06:00"
    }
  });
  assert.throws(
    () => buildCampaignStatusRequest({
      ...statusContract,
      operation: "calendar.events.read"
    }, "fall-follow-up", contextHandle),
    /exact discovered sendgrid-email\.campaign\.status contract/
  );
  assert.throws(
    () => buildCampaignMetricsRequest({
      ...metricsContract,
      execution: { ...metricsContract.execution, uri: "https://provider.example/metrics" }
    }, "fall-follow-up", contextHandle),
    /origin-relative URI/
  );
});

test("status and metrics readback allowlist public fields and hide internal/provider identities", () => {
  const status = presentCampaignStatus({
    category: "fall-follow-up",
    state: "completed",
    terminal: true,
    send_outcome: "success",
    lifecycle_timestamps: { sent_at: "2026-09-16T15:00:00Z" },
    send_summary: { successful_sends: 1, failed_sends: 0 },
    issues: [{
      code: "DELIVERY_DELAYED",
      message: "One delivery is delayed.",
      provider_id: "provider-private",
      credentialToken: "credential-private"
    }],
    available_actions: [{ semantic_operation: "discovered.next" }],
    observed_at: "2026-09-16T15:01:00Z",
    campaign_id: "private-campaign",
    provider_payload: { id: "private-provider" }
  });
  assert.equal(status.state, "completed");
  assert.equal(Object.hasOwn(status, "campaign_id"), false);
  assert.equal(Object.hasOwn(status, "provider_payload"), false);
  assert.equal(JSON.stringify(status).includes("provider-private"), false);
  assert.equal(JSON.stringify(status).includes("credential-private"), false);

  const metrics = presentCampaignMetrics({
    category: "fall-follow-up",
    effective_window: {
      from: "2026-09-16T15:00:00Z",
      through: "2026-09-18T12:00:00Z"
    },
    successful_sends: 1,
    failed_sends: 0,
    delivery: { delivered: 1 },
    engagement: { opens: 1 },
    observed_at: "2026-09-18T12:00:00Z",
    audience_id: "private-audience"
  });
  assert.equal(metrics.delivery.delivered, 1);
  assert.equal(Object.hasOwn(metrics, "audience_id"), false);
});

test("client instructions render exact review values while attendee and provider data stay hidden", () => {
  const output = presentClientInstruction({
    goal: "review_and_approve_campaign",
    message: "Review this campaign and approve sending it.",
    campaign_review: {
      category: "fall-follow-up",
      recipient_count: 1,
      subject: "Meeting follow-up",
      text: "Thank you for attending."
    }
  });
  assert.equal(output.data.campaign_review.text, "Thank you for attending.");
  assert.throws(
    () => presentClientInstruction({
      goal: "review_and_approve_campaign",
      message: "Review this campaign.",
      campaign_review: {
        recipient_count: 1,
        recipients: [{ email: "nested@example.test" }]
      }
    }),
    /internal journey state/
  );
});

test("client recovery resolution presents bounded intent without executable action material", () => {
  const output = presentClientResolution({
    goal: "reconnect_calendar",
    instruction: "Reconnect through the discovered BOS capability.",
    operation: "calendar.authorization.reconnect",
    requires_user_approval: true,
    approval_scope: ["calendar.connection"],
    after_success: {
      verb: "step",
      method: "POST",
      href: "/step?capability=opaque-private-action",
      payload_schema: null
    }
  });
  assert.deepEqual(output, {
    goal: "reconnect_calendar",
    instruction: "Reconnect through the discovered BOS capability.",
    operation: "calendar.authorization.reconnect",
    requires_user_approval: true,
    approval_scope: ["calendar.connection"]
  });
  assert.equal(JSON.stringify(output).includes("opaque-private-action"), false);
});

test("journey graph view distinguishes ownership and current position without business data", () => {
  const view = buildJourneyGraphView({
    nodes: [
      { code: "prepare", type: "server", next: "review" },
      { code: "review", type: "client", next: "done" },
      { code: "done", type: "server", terminal: true }
    ]
  }, {
    current_step: { code: "review", type: "client" },
    completed_path: ["prepare"],
    attendees: [{ email: "private@example.test" }]
  });
  assert.match(view.mermaid, /prepare.*server/);
  assert.match(view.mermaid, /review.*client.*CURRENT/);
  assert.match(view.accessible_text, /prepare \[server, completed\]/);
  assert.equal(view.mermaid.includes("private@example.test"), false);
});
