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
      import_file: "openai/chatgpt-app-submission.json",
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
    assert.equal(submission.app_info.category, "PRODUCTIVITY", product.name);
    assert.equal(submission.test_cases.length, 5, product.name);
    assert.equal(submission.negative_test_cases.length, 3, product.name);
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
    `${root}/products/bos/openai/chatgpt-app-submission.json`, "utf8"
  ));
  assert.deepEqual(Object.keys(bos.tools), [
    "bos_get_context",
    "bos_list_plugin_services",
    "bos_get_plugin_settings",
    "bos_set_plugin_enabled",
    "bos_begin_plugin_service_connection"
  ]);
  assert.deepEqual(
    bos.test_cases.map(({ tools_triggered }) => tools_triggered),
    [
      "bos_get_context",
      "bos_list_plugin_services",
      "bos_get_plugin_settings",
      "bos_set_plugin_enabled",
      "bos_begin_plugin_service_connection"
    ]
  );
  assert.match(JSON.stringify(bos.test_cases), /Acme Operations/);
  assert.match(JSON.stringify(bos.test_cases), /Workflow Sandbox/);
  assert.doesNotMatch(JSON.stringify(bos), /education_center_/);
  assert.doesNotMatch(JSON.stringify(bos), /Bright Horizons|Northstar Coding Academy/);

  assert.match(bos.negative_test_cases[1].user_prompt, /student camp roster/i);
  assert.match(bos.negative_test_cases[1].expected_output, /Education Operation Center/i);
  assert.match(bos.negative_test_cases[2].user_prompt, /another organization/i);
  assert.match(bos.negative_test_cases[2].expected_output, /cross-tenant/i);

  const education = JSON.parse(await readFile(
    `${root}/products/education-center/openai/chatgpt-app-submission.json`, "utf8"
  ));
  assert.deepEqual(Object.keys(education.tools), [
    "bos_get_context",
    "education_center_search_students",
    "education_center_list_enrollments",
    "education_center_get_camp_roster_report",
    "education_center_search_leads"
  ]);
  assert.ok(education.test_cases.slice(1).every(({ tools_triggered }) =>
    tools_triggered.startsWith("education_center_")
  ));
});

test("OpenAI submission paths reject temporary or escaping locations", async () => {
  for (const product of activeCodexProducts) {
    const invalid = structuredClone(product);
    invalid.openai_submission.import_file = "../../tmp/chatgpt-app-submission.json";
    assert.ok(validateProduct(invalid).some((failure) =>
      failure.includes("openai_submission.import_file must be a safe path under openai/")
    ));
  }
});
