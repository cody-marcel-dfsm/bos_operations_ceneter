import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  listProducts,
  resolveProductSkills,
  root,
  validateProduct
} from "../scripts/lib/package-model.mjs";
import {
  createDeterministicZipFromDirectory,
  readZipEntries
} from "../scripts/lib/deterministic-zip.mjs";

const portalSchema =
  "https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json";

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "IHDR");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

const activeCodexProducts = (await listProducts())
  .map(({ manifest }) => manifest)
  .filter(({ release_status, clients }) =>
    release_status === "active" && clients.includes("codex")
  );

test("every active Codex product owns permanent OpenAI submission source", async () => {
  assert.deepEqual(activeCodexProducts.map(({ name }) => name).sort(), [
    "bos",
    "education-center"
  ]);
  for (const product of activeCodexProducts) {
    assert.deepEqual(product.openai_submission, {
      import_file: "openai/openai-marketplace-test-cases.json",
      directory_icon: "openai/directory-icon.png",
      composer_icon: "openai/composer-icon.png",
      skills_archive: `openai/${product.name}-skills.zip`
    });
    const submission = JSON.parse(await readFile(
      `${root}/products/${product.name}/${product.openai_submission.import_file}`,
      "utf8"
    ));
    assert.equal(submission.$schema, portalSchema, product.name);
    assert.equal(submission.schema_version, 1, product.name);
    assert.ok(submission.app_info.display_name.length <= 30, product.name);
    assert.ok(submission.app_info.subtitle.length <= 30, product.name);
    assert.equal(submission.app_info.description, product.long_description, product.name);
    assert.equal(submission.app_info.category, "PRODUCTIVITY", product.name);
    assert.equal(submission.test_cases.length, product.name === "education-center" ? 7 : 5, product.name);
    assert.equal(submission.negative_test_cases.length, product.name === "education-center" ? 0 : 3, product.name);
  }
});

test("OpenAI skill archives exactly reproduce each product's generated Codex skills", async () => {
  for (const product of activeCodexProducts) {
    const archivePath = `${root}/products/${product.name}/${product.openai_submission.skills_archive}`;
    const generatedRoot = `${root}/clients/codex/plugins/${product.name}/skills`;
    const archive = await readFile(archivePath);
    const expectedArchive = await createDeterministicZipFromDirectory(generatedRoot);
    assert.deepEqual(archive, expectedArchive, `${product.name} archive is reproducible`);

    const entries = readZipEntries(archive);
    const roots = [...new Set([...entries.keys()].map((path) => path.split("/")[0]))].sort();
    const expectedRoots = (await resolveProductSkills(product))
      .map(({ name }) => name)
      .sort();
    assert.deepEqual(roots, expectedRoots, `${product.name} owns only its declared skill roots`);
    for (const rootName of roots) {
      assert.ok(entries.has(`${rootName}/SKILL.md`), `${rootName} has SKILL.md`);
    }
    for (const path of entries.keys()) {
      const entry = entries.get(path);
      const generatedPath = `${generatedRoot}/${path}`;
      const generatedMode = (await stat(generatedPath)).mode & 0o111 ? 0o755 : 0o644;
      assert.ok(!path.startsWith("/"));
      assert.ok(!path.includes("\\"));
      assert.ok(!path.split("/").includes(".."));
      assert.deepEqual(
        entry.content,
        await readFile(generatedPath),
        `${product.name}/${path} matches the generated package`
      );
      assert.equal(
        entry.mode,
        generatedMode,
        `${product.name}/${path} preserves normalized executable mode`
      );
    }
  }
});

test("OpenAI submission icons are permanent square PNG product assets", async () => {
  for (const product of activeCodexProducts) {
    const directoryIcon = await readFile(
      `${root}/products/${product.name}/${product.openai_submission.directory_icon}`
    );
    const composerIcon = await readFile(
      `${root}/products/${product.name}/${product.openai_submission.composer_icon}`
    );
    assert.deepEqual(pngDimensions(directoryIcon), { width: 512, height: 512 });
    assert.deepEqual(pngDimensions(composerIcon), { width: 96, height: 96 });
  }
});

test("BOS and Education OpenAI cases stay within their product MCP scope", async () => {
  const bos = JSON.parse(await readFile(
    `${root}/products/bos/openai/openai-marketplace-test-cases.json`, "utf8"
  ));
  const currentTools = ['bos_logout', 'bos_get_context', 'bos_list_context_tools', 'bos_execute', 'plugins.list', 'service.describe', 'api.contract.get', 'discovery.refresh'];
  assert.deepEqual(Object.keys(bos.tools), currentTools);
  assert.ok(bos.test_cases.every(({tools_triggered}) =>
    tools_triggered.split(', ').every(tool => currentTools.includes(tool))));
  assert.deepEqual(bos.test_cases.map(({user_prompt}) => user_prompt), [
    'List the BOS apps and public services accessible to my organization.',
    'Show me the BOS tool named `bos_get_context`.',
    'Log in to Lead Director using the provided test login URL.',
    'What is my current role in Lead Director?',
    'Get the application description for Lead Director.'
  ]);
  assert.deepEqual(bos.test_cases[0].tools_triggered.split(', '), ['bos_get_context','bos_execute']);
  assert.doesNotMatch(JSON.stringify(bos.test_cases), /Workflow Sandbox|Synthetic Accounting/);
  assert.doesNotMatch(JSON.stringify(bos), /education_center_/);
  assert.doesNotMatch(JSON.stringify(bos), /Bright Horizons|Northstar Coding Academy/);

  assert.equal(bos.negative_test_cases[1].tools_triggered, null);
  assert.deepEqual(bos.negative_test_cases.map(({user_prompt}) => user_prompt), [
    'Write a four-line poem about autumn leaves.',
    'What will the weather be tomorrow?',
    'Use BOS to disable all BOS plugins for the organization "ACME.org"'
  ]);
  assert.deepEqual(bos.negative_test_cases[2].tools_triggered.split(', '), ['bos_get_context','bos_execute']);
  const bosPolicy = JSON.parse(await readFile(`${root}/products/bos/openai/acceptance-policy.json`, 'utf8'));
  assert.equal(bosPolicy.execution_profile, 'bos-reviewed-functional/v1');
  for (const id of ['positive-1','positive-2','positive-3','positive-4','positive-5','negative-1','negative-2','negative-3']) {
    assert.equal(bosPolicy.cases[id].expected_output_validation, false);
    assert.equal(bosPolicy.cases[id].grading, 'deterministic-functional');
  }
  assert.equal(bosPolicy.cases['negative-3'].negative_behavior, 'authorization-denial');
  assert.equal(bosPolicy.cases['negative-3'].expected_authorization_error_code, 'authorization_denied');
  assert.ok(bosPolicy.cases['positive-1'].requirements.some(({id})=>id==='public-services-list'));
  assert.ok(bosPolicy.cases['positive-1'].requirements.some(({id})=>id==='test-organization-public-services-match'));
  assert.deepEqual(bosPolicy.cases['positive-1'].expected_public_services, [{
    name:'Calimatic SIS',
    reference:{platform:'bos',application:'lead-director',plugin:'calimatic'},
    readiness_status:'configuration_required'
  }]);
  assert.match(bos.test_cases[0].expected_output, /Calimatic SIS \(calimatic\)[\s\S]*configuration_required[\s\S]*empty list/i);

  const education = JSON.parse(await readFile(
    `${root}/products/education-center/openai/openai-marketplace-test-cases.json`, "utf8"
  ));
  assert.deepEqual(Object.keys(education.tools), currentTools);
  assert.ok(education.test_cases.every(({tools_triggered}) =>
    tools_triggered.split(', ').every(tool => currentTools.includes(tool))));
  assert.deepEqual(education.test_cases.map(({user_prompt}) => user_prompt), [
    'Describe Education Center’s Calimatic service and return the student-search tool.',
    'Using BOS Education Center, give me the camps from September 14 through September 18, 2026.',
    'Using BOS Education Center, give me the camps from September 14 through September 18, 2026.',
    'Using BOS Education Center, show me the required input fields for the camp-roster operation `education_center_get_camp_roster_report`.',
    'Using BOS Education Center, show me the required input fields for the student-search operation `education_center_search_students`.',
    'Using BOS Education Center, what capability does the advertised student-search tool `education_center_search_students` declare?',
    'Using BOS Education Center, what search criteria are listed in the description for `education_center_search_students`?'
  ]);
  assert.deepEqual(education.test_cases.map(({tools_triggered}) => tools_triggered), [
    'bos_get_context, bos_list_context_tools, bos_execute',
    'bos_get_context, bos_list_context_tools, bos_execute',
    'bos_get_context, bos_list_context_tools, bos_execute',
    'bos_get_context, bos_list_context_tools',
    'bos_get_context, bos_list_context_tools',
    'bos_get_context, bos_list_context_tools',
    'bos_get_context, bos_list_context_tools'
  ]);
  assert.deepEqual(education.negative_test_cases, []);
  assert.match(education.test_cases[0].expected_output, /education_center_search_students/);
  assert.match(education.test_cases[1].expected_output, /Calimatic reports that it is not authenticated/);
  assert.match(education.test_cases[2].expected_output, /education-center-class-operations/);
  assert.match(education.test_cases[3].expected_output, /query\.start_date[\s\S]*query\.end_date[\s\S]*query\.cursor/);
  assert.match(education.test_cases[4].expected_output, /education_center_search_students[\s\S]*no required input fields/);
  assert.match(education.test_cases[5].expected_output, /education_center_search_students[\s\S]*calimatic\.students\.read/);
  assert.match(education.test_cases[6].expected_output, /query[\s\S]*email[\s\S]*student_name/);
  const policy = JSON.parse(await readFile(`${root}/products/education-center/openai/acceptance-policy.json`, 'utf8'));
  assert.deepEqual(policy.cases['positive-1'].requirements, [{id:'student-search-tool', operator:'contains'}]);
  assert.deepEqual(policy.cases['positive-2'].expected_error_operations, ['education_center_get_camp_roster_report']);
  assert.deepEqual(policy.cases['positive-2'].requirements, [{id:'calimatic-api-key-configuration-response', operator:'equals'}]);
  assert.deepEqual(policy.cases['positive-3'].expected_error_operations, ['education_center_get_camp_roster_report']);
  assert.equal(policy.cases['positive-3'].required_skill_invocation, 'education-center-class-operations');
  assert.deepEqual(policy.cases['positive-3'].requirements, [{id:'class-operations-camp-key-setup-response', operator:'equals'}]);
  assert.equal(policy.cases['positive-4'].metadata_only, true);
  assert.deepEqual(policy.cases['positive-4'].requirements, [{id:'camp-roster-required-input-fields', operator:'equals'}]);
  assert.equal(policy.cases['positive-5'].metadata_only, true);
  assert.equal(policy.cases['positive-5'].metadata_tool_name, 'education_center_search_students');
  assert.deepEqual(policy.cases['positive-5'].requirements, [{id:'student-search-no-required-input-fields', operator:'equals'}]);
  assert.equal(policy.cases['positive-6'].metadata_only, true);
  assert.equal(policy.cases['positive-6'].metadata_fact, 'capability');
  assert.equal(policy.cases['positive-6'].metadata_tool_name, 'education_center_search_students');
  assert.deepEqual(policy.cases['positive-6'].requirements, [{id:'student-search-capability', operator:'equals'}]);
  assert.equal(policy.cases['positive-7'].metadata_only, true);
  assert.equal(policy.cases['positive-7'].metadata_fact, 'description_search_criteria');
  assert.equal(policy.cases['positive-7'].metadata_tool_name, 'education_center_search_students');
  assert.deepEqual(policy.cases['positive-7'].requirements, [{id:'student-search-description-criteria', operator:'contains'}]);

});

test("OpenAI submission paths reject temporary or escaping locations", async () => {
  for (const product of activeCodexProducts) {
    const invalid = structuredClone(product);
    invalid.openai_submission.import_file = "../../tmp/openai-marketplace-test-cases.json";
    assert.ok(validateProduct(invalid).some((failure) =>
      failure.includes("openai_submission.import_file must be a safe path under openai/")
    ));
  }
});


test("BOS public marketplace listing supplies bounded subtitle and publisher URLs", async () => {
  const manifest = JSON.parse(await readFile(`${root}/clients/codex/plugins/bos/.codex-plugin/plugin.json`, "utf8"));
  assert.ok(manifest.interface.shortDescription.length <= 30);
  for (const field of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    const url = new URL(manifest.interface[field]);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "dfsm.ai");
    assert.equal(url.username + url.password, "");
  }
  for (const field of ["support_url", "privacy_policy_url", "terms_of_service_url"]) {
    const base = (await listProducts()).find(({manifest}) => manifest.name === "bos").manifest;
    for (const value of ["http://dfsm.ai", "https://user:secret@example.test", "https://dfsm.ai/ bad", 123]) {
      assert.ok(validateProduct({...base, [field]: value}).some(error => error.includes(field)));
    }
  }
});
