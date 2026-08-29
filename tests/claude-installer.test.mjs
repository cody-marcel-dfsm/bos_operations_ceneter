import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installClaudeLocal } from "../scripts/install-claude-local.mjs";
import { readJson, root } from "../scripts/lib/package-model.mjs";

const releaseVersion = (await readJson(`${root}/products/bos/product.json`)).version;

function installed(id, enabled = true) {
  const name = id.split("@")[0];
  return {
    id,
    scope: "user",
    enabled,
    version: releaseVersion,
    installPath: `${root}/clients/claude/plugins/${name}`
  };
}

test("Claude installer contains no BOS credential handling", async () => {
  const source = await readFile(
    new URL("../scripts/install-claude-local.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /promptForApiKey|bos_api_key|--config|suppliedApiKey/);
});

test("Claude local installer directs users to the persistent account connector", async () => {
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
        : JSON.stringify([installed("bos@bos-education-center")]);
    }
    return "";
  };

  const result = await installClaudeLocal({
    base: root,
    run
  });
  assert.equal(result.selector, "bos@bos-education-center");
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
      "bos@bos-education-center",
      "--scope",
      "user"
    ]
  );
  assert.doesNotMatch(JSON.stringify(calls), /api[_-]?key|bos_api_key|--config/i);
  assert.equal(result.connectionScope, "claude_account");
  assert.equal(
    result.resourceUrl,
    "https://dfsm.ai/mcp/apps/bos/platform"
  );
});

test("Claude local installer updates an existing local installation without credential prompts", async () => {
  const calls = [];
  const selector = "bos@bos-education-center";
  const run = (command, args) => {
    calls.push([command, args]);
    if (args[0] === "--version") return "2.1.220\n";
    if (args[0] === "plugin" && args[1] === "validate") return "Valid\n";
    if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") {
      return JSON.stringify([{
        name: "bos-education-center",
        source: "directory",
        path: `${root}/clients/claude`
      }]);
    }
    if (args[0] === "plugin" && args[1] === "list") {
      return JSON.stringify([
        installed(selector),
        installed("education-center@bos-education-center")
      ]);
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
  assert.equal(calls.some(([, args]) =>
    args.join(" ") === `plugin enable ${selector} --scope user`
  ), false);
});

test("Claude local installer enables an installed disabled plugin", async () => {
  const calls = [];
  const selector = "bos@bos-education-center";
  let enabled = false;
  const run = (command, args) => {
    calls.push([command, args]);
    if (args[0] === "--version") return "2.1.220\n";
    if (args[0] === "plugin" && args[1] === "validate") return "Valid\n";
    if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") {
      return JSON.stringify([{
        name: "bos-education-center",
        source: "directory",
        path: `${root}/clients/claude`
      }]);
    }
    if (args[0] === "plugin" && args[1] === "list") {
      return JSON.stringify([installed(selector, enabled)]);
    }
    if (args[0] === "plugin" && args[1] === "enable") enabled = true;
    return "";
  };

  await installClaudeLocal({ base: root, run });
  assert(calls.some(([, args]) =>
    args.join(" ") === `plugin enable ${selector} --scope user`
  ));
});

test("Claude subservice installation uses the existing BOS connector", async () => {
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
        : JSON.stringify([installed("education-center@bos-education-center")]);
    }
    return "";
  };

  const result = await installClaudeLocal({ base: root, product: "education-center", run });
  assert.equal(result.selector, "education-center@bos-education-center");
  assert.equal(result.connectionScope, "bos_managed");
  assert.equal(result.resourceUrl, undefined);
  assert.doesNotMatch(JSON.stringify(calls), /api[_-]?key/i);
});

test("Claude local installer replaces a same-named remote marketplace with the local build", async () => {
  const calls = [];
  const selector = "education-center@bos-education-center";
  const run = (command, args) => {
    calls.push([command, args]);
    if (args[0] === "--version") return "2.1.220\n";
    if (args[0] === "plugin" && args[1] === "validate") return "Valid\n";
    if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") {
      return JSON.stringify([{
        name: "bos-education-center",
        source: "git",
        url: "https://github.com/example/old-marketplace.git"
      }]);
    }
    if (args[0] === "plugin" && args[1] === "list") {
      return JSON.stringify([
        installed(selector),
        installed("bos@bos-education-center")
      ]);
    }
    return "";
  };

  await installClaudeLocal({ base: root, run });
  assert(calls.some(([, args]) =>
    args.join(" ") === "plugin marketplace remove bos-education-center --scope user"
  ));
  assert(calls.some(([, args]) =>
    args.join(" ") === `plugin marketplace add ${root}/clients/claude --scope user`
  ));
  assert(calls.some(([, args]) =>
    args.join(" ") === "plugin install bos@bos-education-center --scope user"
  ));
  assert(calls.some(([, args]) =>
    args.join(" ") === `plugin install ${selector} --scope user`
  ));
});
