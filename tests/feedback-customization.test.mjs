import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const script = new URL(
  "../source/platform/submit-feedback/scripts/discover-customizations.mjs",
  import.meta.url
);

test("feedback discovery returns all typed overrides for the affected skill", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "bos-feedback-customizations-"));
  const productRoot = join(fixture, "product");
  const extensionRoot = join(fixture, "extensions");
  const extension = join(extensionRoot, "planning-acme");
  await mkdir(join(productRoot, "skills"), { recursive: true });
  await mkdir(extension, { recursive: true });
  await writeFile(
    join(productRoot, ".bos-product.json"),
    JSON.stringify({ schema_version: "1", name: "test-product", version: "1.2.3", client: "codex" })
  );
  await writeFile(
    join(extension, ".bos-extension.json"),
    JSON.stringify({
      schema_version: "2",
      ownership: "customer",
      tenant: { key: "acme" },
      extends: { product: "test-product", skill: "planning", tested_version: "1.2.2" },
      overrides: {
        terminology: { customer: "member" },
        defaults: { "planning-window": "21 days" },
        policies: { approval: "Director approves final plan" },
        exceptions: {}
      }
    })
  );
  const { stdout } = await execFileAsync(process.execPath, [
    script.pathname,
    "--product-root",
    productRoot,
    "--base-skill",
    "planning",
    "--tenant",
    "acme",
    "--extension-root",
    extensionRoot
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.customizations.length, 1);
  assert.equal(result.customizations[0].overrides.defaults["planning-window"], "21 days");
  assert.equal(result.customizations[0].overrides.terminology.customer, "member");
  assert.equal("tenant" in result.customizations[0], false);
});

test("feedback discovery excludes extensions for other base skills", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "bos-feedback-scope-"));
  const productRoot = join(fixture, "product");
  const extension = join(productRoot, "skills", "other-acme");
  await mkdir(extension, { recursive: true });
  await writeFile(
    join(productRoot, ".bos-product.json"),
    JSON.stringify({ schema_version: "1", name: "test-product", version: "1.2.3", client: "codex" })
  );
  await writeFile(
    join(extension, ".bos-extension.json"),
    JSON.stringify({
      schema_version: "2",
      ownership: "customer",
      tenant: { key: "acme" },
      extends: { product: "test-product", skill: "other", tested_version: "1.2.3" },
      overrides: { terminology: {}, defaults: { mode: "custom" }, policies: {}, exceptions: {} }
    })
  );
  const { stdout } = await execFileAsync(process.execPath, [
    script.pathname,
    "--product-root",
    productRoot,
    "--base-skill",
    "planning",
    "--tenant",
    "acme"
  ]);
  assert.deepEqual(JSON.parse(stdout).customizations, []);
});
