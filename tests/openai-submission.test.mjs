import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { root, validateProduct } from "../scripts/lib/package-model.mjs";

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

test("BOS owns permanent OpenAI submission source with the portal schema", async () => {
  const product = JSON.parse(
    await readFile(`${root}/products/bos/product.json`, "utf8")
  );
  assert.deepEqual(product.openai_submission, {
    import_file: "openai/chatgpt-app-submission.json",
    directory_icon: "openai/directory-icon.png",
    composer_icon: "openai/composer-icon.png"
  });

  const submission = JSON.parse(
    await readFile(
      `${root}/products/bos/${product.openai_submission.import_file}`,
      "utf8"
    )
  );
  assert.equal(submission.$schema, portalSchema);
  assert.equal(submission.schema_version, 1);
  assert.equal(submission.app_info.display_name, "BOS Business Operating System");
  assert.ok(submission.app_info.display_name.length <= 30);
  assert.ok(submission.app_info.subtitle.length <= 30);
  assert.equal(submission.app_info.category, "PRODUCTIVITY");
  assert.deepEqual(Object.keys(submission.tools), ["bos_get_context"]);
  assert.deepEqual(submission.tools.bos_get_context.annotations, {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false
  });
  assert.equal(submission.test_cases.length, 5);
  assert.equal(submission.negative_test_cases.length, 3);
  assert.ok(
    submission.test_cases.every(
      ({ tools_triggered }) => tools_triggered === "bos_get_context"
    )
  );
});

test("BOS OpenAI submission icons are permanent square PNG product assets", async () => {
  const product = JSON.parse(
    await readFile(`${root}/products/bos/product.json`, "utf8")
  );
  const directoryIcon = await readFile(
    `${root}/products/bos/${product.openai_submission.directory_icon}`
  );
  const composerIcon = await readFile(
    `${root}/products/bos/${product.openai_submission.composer_icon}`
  );
  assert.deepEqual(pngDimensions(directoryIcon), { width: 512, height: 512 });
  assert.deepEqual(pngDimensions(composerIcon), { width: 96, height: 96 });
});

test("BOS rejects temporary or escaping OpenAI submission paths", async () => {
  const product = JSON.parse(
    await readFile(`${root}/products/bos/product.json`, "utf8")
  );
  const invalid = structuredClone(product);
  invalid.openai_submission.import_file = "../../tmp/chatgpt-app-submission.json";
  assert.ok(
    validateProduct(invalid).some((failure) =>
      failure.includes("openai_submission.import_file must be a safe path under openai/")
    )
  );
});
