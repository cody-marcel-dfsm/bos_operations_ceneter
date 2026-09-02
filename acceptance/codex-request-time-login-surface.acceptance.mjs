import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { root } from "../scripts/lib/package-model.mjs";

test("post-release Codex request-time login evidence includes the versioned chat screenshot", async () => {
  const product = JSON.parse(await readFile(
    join(root, "products", "bos", "product.json"),
    "utf8"
  ));
  const evidence = await readFile(join(
    root,
    "Vault",
    "evidence",
    "codex-login",
    `${product.version}-request-time-sign-in-button.png`
  ));

  assert(evidence.length > 1024, "Request-time login screenshot evidence is unexpectedly small");
  assert.deepEqual(
    [...evidence.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "Request-time login acceptance evidence must be a PNG screenshot"
  );
});
