import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installClaudeLocal } from "../scripts/install-claude-local.mjs";
import { root } from "../scripts/lib/package-model.mjs";

test("Claude installer never handles the sensitive plugin value", async () => {
  const source = await readFile(
    new URL("../scripts/install-claude-local.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /promptForApiKey|bos_api_key|--config|suppliedApiKey/);
});

test("Claude local installer delegates sensitive configuration to Claude", async () => {
  const calls = [];
  let pluginListCount = 0;
  const run = (command, args) => {
    calls.push([command, args]);
    if (args[0] === "--version") return "2.1.220\n";
    if (args[0] === "plugin" && args[1] === "validate") return "Valid\n";
    if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") {
      return "[]";
    }
    if (args[0] === "plugin" && args[1] === "list") {
      pluginListCount += 1;
      return pluginListCount === 1
        ? "[]"
        : JSON.stringify([{
            id: "education-center@bos-education-center",
            enabled: true
          }]);
    }
    return "";
  };

  const result = await installClaudeLocal({
    base: root,
    run
  });
  assert.equal(result.selector, "education-center@bos-education-center");
  assert.deepEqual(
    calls.find(([, args]) => args[1] === "marketplace" && args[2] === "add")?.[1],
    [
      "plugin",
      "marketplace",
      "add",
      `${root}/clients/claude`,
      "--scope",
      "user"
    ]
  );
  assert.deepEqual(
    calls.find(([, args]) => args[1] === "install")?.[1],
    [
      "plugin",
      "install",
      "education-center@bos-education-center",
      "--scope",
      "user"
    ]
  );
  assert.doesNotMatch(JSON.stringify(calls), /api[_-]?key|bos_api_key|--config/i);
});

test("Claude local installer updates an existing local installation without asking again", async () => {
  const calls = [];
  const selector = "education-center@bos-education-center";
  const run = (command, args) => {
    calls.push([command, args]);
    if (args[0] === "--version") return "2.1.220\n";
    if (args[0] === "plugin" && args[1] === "validate") return "Valid\n";
    if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") {
      return JSON.stringify([{ name: "bos-education-center" }]);
    }
    if (args[0] === "plugin" && args[1] === "list") {
      return JSON.stringify([{ id: selector, enabled: true }]);
    }
    return "";
  };

  await installClaudeLocal({
    base: root,
    run
  });
  assert(calls.some(([, args]) =>
    args.join(" ") === "plugin marketplace update bos-education-center"
  ));
  assert(calls.some(([, args]) =>
    args.join(" ") === `plugin update ${selector} --scope user`
  ));
  assert(calls.some(([, args]) =>
    args.join(" ") === `plugin enable ${selector} --scope user`
  ));
});
