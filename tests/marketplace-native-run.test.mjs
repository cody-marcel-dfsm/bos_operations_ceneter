import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedErrorObservation,
  requiredSkillInvocationObserved,
  caseCompletionStatus,
  reviewerInstructionsForCase,
  reviewerToolsForCase,
  reviewerResponses
} from "../scripts/marketplace-native-run.mjs";

const item = {
  id: "positive-3",
  product: "education-center",
  kind: "positive",
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
  tool: "bos.execute",
  input: { tool_name: "education_center_get_camp_roster_report" },
  transport: "mcp_business",
  is_error: true,
  scope_verified: true,
  secure_configuration_action_validated: true,
  response: {
    body: {
      result: {
        error: {
          provider_error_code: "provider_authorization_required",
          status: "authorization_required",
          required_authorizations: [{
            authorization_kind: "api_key",
            status: "configuration_required",
            authorization_url: "https://dfsm.ai/api/v1/mcp/provider-recovery?[query redacted]"
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

test("Education positive-3 overrides HTTPS-only routing for its approved exact MCP call", () => {
  const base = JSON.stringify({
    product: "education-center",
    skills_index: [{ product: "education-center", name: item.required_skill_invocation, path: `skills/${item.required_skill_invocation}/SKILL.md` }],
    instructions: "Execute business operations only with bos_https_operation and an advertised contact_id."
  });
  const instructions = JSON.parse(reviewerInstructionsForCase(base, { ...item, id: "positive-3" })).instructions;
  assert.match(instructions, /positive-3 only/);
  assert.match(instructions, /education_center_get_camp_roster_report/);
  assert.match(instructions, /start_date:"2026-09-14",end_date:"2026-09-18"/);
  assert.match(instructions, /expected Calimatic API-key configuration-required response completes this request/);
  assert.match(instructions, /exact advertised app\.describe URI/);
  assert.match(instructions, /require successful published app-describe validation/);
  assert.doesNotMatch(instructions, /Execute business operations only with bos_https_operation/);
  assert.equal(requiredSkillInvocationObserved({ ...item, id: "positive-3" }, [skillRead, keyResponse], "education-center", "https://dfsm.ai/mcp/apps/leaddirector/education-center"), true);
  const names=['acceptance_guard_probe','acceptance_guard_status','acceptance_read_installed','bos_get_context','bos_list_context_tools','bos_control_discover','bos_list_resources','bos_read_resource','acceptance_validate_installed','bos_https_operation'];
  const limited=reviewerToolsForCase({...item,id:'positive-3'},{definitions:names.map(name=>({name}))});
  assert.deepEqual(limited.definitions.map(row=>row.name),names.slice(0,9));
  const response=reviewerResponses([{tool:'bos.execute',input:{tool_name:'education_center_get_camp_roster_report'},transport:'mcp_business',is_error:true,scope_verified:true,secure_configuration_action_validated:true,response:{result:{error:{provider_error_code:'provider_authorization_required',status:'authorization_required',required_authorizations:[{authorization_kind:'api_key',status:'configuration_required'}]}}}}],'https://dfsm.ai/mcp/apps/bos/platform','education-center','positive-3')[0];
  assert.equal(response.secure_configuration_action_validated,true);
  assert.equal(response.body.result.error.secure_configuration_action_validated,true);
  assert.doesNotMatch(JSON.stringify(response),/authorization_url|recovery_token|family|student/);
  const bosCase={...item,product:'bos'};
  const unrestricted=reviewerToolsForCase(bosCase,{definitions:names.map(name=>({name}))});
  assert.deepEqual(unrestricted.definitions.map(row=>row.name),names);
  const bosBase=JSON.stringify({...JSON.parse(base),product:'bos',skills_index:[]});
  assert.doesNotMatch(JSON.parse(reviewerInstructionsForCase(bosBase,{...bosCase,required_skill_invocation:undefined})).instructions,/For Education Center positive-3 only/);
  const rawResponse={tool:'bos.execute',input:{tool_name:'education_center_get_camp_roster_report'},transport:'mcp_business',is_error:true,scope_verified:true,secure_configuration_action_validated:true,response:{result:{error:{provider_error_code:'provider_authorization_required',status:'authorization_required',required_authorizations:[{authorization_kind:'api_key',status:'configuration_required'}]}}}};
  assert.equal(reviewerResponses([rawResponse],'https://dfsm.ai/mcp/apps/bos/platform','bos','positive-3')[0].secure_configuration_action_validated,false);
  assert.equal(reviewerResponses([rawResponse],'https://dfsm.ai/mcp/apps/bos/platform','education-center','positive-2')[0].secure_configuration_action_validated,false);
  assert.equal(expectedErrorObservation(bosCase,keyResponse,'https://dfsm.ai/mcp/apps/bos/platform'),false);
});

test("Education positive-3 completes only on its required skill and exact configuration response", () => {
  const resource="https://dfsm.ai/mcp/apps/bos/platform";
  const responses=reviewerResponses([keyResponse],resource,'education-center','positive-3');
  assert.equal(caseCompletionStatus(item,"blocked",responses,{status:"matched"},[skillRead,keyResponse],"education-center",resource),"completed");
  assert.equal(caseCompletionStatus(item,"blocked",responses,{status:"unmatched"},[skillRead,keyResponse],"education-center",resource),"blocked");
  assert.equal(caseCompletionStatus(item,"blocked",responses,{status:"matched"},[keyResponse],"education-center",resource),"blocked");
});

test('Education metadata-only case exposes only identity and tool-catalog discovery',()=>{
 const metadataItem={id:'positive-4',product:'education-center',kind:'positive',metadata_only:true,metadata_tool_name:'education_center_get_camp_roster_report'};
 const names=['acceptance_guard_probe','acceptance_guard_status','bos_get_context','bos_list_context_tools','bos_read_resource','bos_execute'];
 const limited=reviewerToolsForCase(metadataItem,{definitions:names.map(name=>({name}))});
 assert.deepEqual(limited.definitions.map(row=>row.name),['acceptance_guard_probe','acceptance_guard_status','bos_get_context','bos_list_context_tools']);
 const instructions=JSON.parse(reviewerInstructionsForCase(JSON.stringify({instructions:'original'}),metadataItem)).instructions;
 assert.match(instructions,/bos_list_context_tools/);
 assert.match(instructions,/Do not call app\.describe, API operations, or business operations/);
 assert.match(instructions,/inputSchema/);
 const studentItem={...metadataItem,id:'positive-5',metadata_tool_name:'education_center_search_students'};
 const studentInstructions=JSON.parse(reviewerInstructionsForCase(JSON.stringify({instructions:'original'}),studentItem)).instructions;
 assert.match(studentInstructions,/find education_center_search_students/);
 assert.doesNotMatch(studentInstructions,/education_center_get_camp_roster_report/);
 assert.throws(()=>reviewerInstructionsForCase(JSON.stringify({instructions:'original'}),{...studentItem,metadata_tool_name:'bos_execute'}),/education_metadata_tool_invalid/);
 const capabilityItem={...studentItem,id:'positive-6',metadata_fact:'capability'};
 const capabilityInstructions=JSON.parse(reviewerInstructionsForCase(JSON.stringify({instructions:'original'}),capabilityItem)).instructions;
 assert.match(capabilityInstructions,/exact capability declared in the tool's _meta\.bos\/capability field/);
 assert.throws(()=>reviewerInstructionsForCase(JSON.stringify({instructions:'original'}),{...capabilityItem,metadata_fact:'unsupported'}),/education_metadata_fact_invalid/);
});

test("required skill passes only when its exact published read precedes the configured API-key response", () => {
  assert.equal(requiredSkillInvocationObserved(item, [skillRead, keyResponse], "education-center", "https://dfsm.ai/mcp"), true);
  assert.equal(requiredSkillInvocationObserved(item, [keyResponse, skillRead], "education-center", "https://dfsm.ai/mcp"), false);
  assert.equal(requiredSkillInvocationObserved(item, [{...skillRead, input: {...skillRead.input, path: "skills/education-center-student-operations/SKILL.md"}}, keyResponse], "education-center", "https://dfsm.ai/mcp"), false);
  assert.equal(requiredSkillInvocationObserved(item, [skillRead], "education-center", "https://dfsm.ai/mcp"), false);
});
