import assert from "node:assert/strict";
import test from "node:test";

import {
  requiredSkillInvocationObserved,
  reviewerInstructionsForCase
} from "../scripts/marketplace-native-run.mjs";

const item = {
  required_skill_invocation: "education-center-class-operations",
  expected_error_operations: ["education_center_get_camp_roster_report"]
};
const skillRead = {
  tool: "read.installed",
  input: {
    product: "education-center",
    path: "skills/education-center-class-operations/SKILL.md"
  },
  is_error: false
};
const keyResponse = {
  tool: "education_center_get_camp_roster_report",
  transport: "https",
  is_error: true,
  scope_verified: true,
  response: {
    body: {
      result: {
        error: {
          status: "authorization_required",
          required_authorizations: [{
            authorization_kind: "api_key",
            status: "configuration_required",
            authorization_url: "https://dfsm.ai/configure/calimatic"
          }]
        }
      }
    }
  }
};

test("explicit skill case instructions name its exact published skill", () => {
  const base = JSON.stringify({
    product: "education-center",
    skills_index: [{
      product: "education-center",
      name: item.required_skill_invocation,
      path: `skills/${item.required_skill_invocation}/SKILL.md`
    }],
    instructions: "Use verified installed skills."
  });
  const result = JSON.parse(reviewerInstructionsForCase(base, item));
  assert.match(result.instructions, /explicit skill-guided test/);
  assert.match(result.instructions, /education-center-class-operations/);
});

test("required skill passes only when its exact published read precedes the configured API-key response", () => {
  assert.equal(requiredSkillInvocationObserved(item, [skillRead, keyResponse], "education-center", "https://dfsm.ai/mcp"), true);
  assert.equal(requiredSkillInvocationObserved(item, [keyResponse, skillRead], "education-center", "https://dfsm.ai/mcp"), false);
  assert.equal(requiredSkillInvocationObserved(item, [{...skillRead, input: {...skillRead.input, path: "skills/education-center-student-operations/SKILL.md"}}, keyResponse], "education-center", "https://dfsm.ai/mcp"), false);
  assert.equal(requiredSkillInvocationObserved(item, [skillRead], "education-center", "https://dfsm.ai/mcp"), false);
});
