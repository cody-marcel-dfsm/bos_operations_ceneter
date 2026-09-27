import assert from "node:assert/strict";
import {access, readFile} from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("BOC discovers BOS contracts by URL and packages no server contract artifacts", async () => {
  for (const forbidden of [
    "tests/fixtures/public-contracts/lead-director/v1/manifest.json",
    "scripts/import-lead-director-public-contract.mjs"
  ]) {
    await assert.rejects(access(new URL(forbidden, root)));
  }

  const packageModel = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(packageModel.scripts["contract:lead-director:import"], undefined);

  const buildSource = await readFile(
    new URL("scripts/build-bos-client-dependency-contract.mjs", root),
    "utf8"
  );
  assert.doesNotMatch(buildSource, /tests\/fixtures\/public-contracts|bos_service|\.\.\/bos\//u);

  const agentAuthority = await readFile(new URL("AGENTS.md", root), "utf8");
  assert.match(agentAuthority, /Never\s+copy, import, package, or read BOS Service schemas/u);

  const discoveryTest = await readFile(new URL("tests/journey-discovery.test.mjs", root), "utf8");
  assert.match(discoveryTest, /startSyntheticBosDiscoveryService/u);
  assert.match(discoveryTest, /fetchSyntheticDiscovery/u);
});
