import assert from "node:assert/strict";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { root } from "../scripts/lib/package-model.mjs";

test(
  "macOS shell installer embeds and installs the local marketplace",
  { skip: process.platform !== "darwin" },
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), "bos-shell-install-test-"));
    const packageRoot = join(temporary, "package");
    const home = join(temporary, "home");
    const fakeCodex = join(temporary, "codex");
    const calls = join(temporary, "codex-calls.txt");
    const marketplaceState = join(temporary, "marketplace-added");
    await mkdir(packageRoot, { recursive: true });
    await cp(
      join(root, "installer", "macos", "install.sh"),
      join(packageRoot, "install.sh")
    );
    await cp(join(root, "clients", "codex"), join(packageRoot, "marketplace"), {
      recursive: true
    });
    await writeFile(
      fakeCodex,
      [
        "#!/bin/sh",
        `printf '%s\\n' \"$*\" >> '${calls}'`,
        'if [ "$1 $2 $3" = "plugin marketplace list" ]; then',
        `  if [ -f '${marketplaceState}' ]; then`,
        `    printf '%s\\n' '{"marketplaces":[{"name":"bos-operations-center","root":"${home}/Library/Application Support/Infinite State Machines/BOS Marketplace"}]}'`,
        "  else",
        "    printf '%s\\n' '{\"marketplaces\":[]}'",
        "  fi",
        'elif [ "$1 $2 $3" = "plugin marketplace add" ]; then',
        `  : > '${marketplaceState}'`,
        "  printf '%s\\n' '{\"ok\":true}'",
        "else",
        "  printf '%s\\n' '{\"ok\":true}'",
        "fi",
        ""
      ].join("\n")
    );
    await chmod(fakeCodex, 0o755);

    for (let run = 0; run < 2; run += 1) {
      const result = spawnSync("sh", [join(packageRoot, "install.sh")], {
        env: { ...process.env, HOME: home, CODEX_BIN: fakeCodex },
        encoding: "utf8"
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }

    const installed = join(
      home,
      "Library",
      "Application Support",
      "Infinite State Machines",
      "BOS Marketplace"
    );
    assert.match(
      await readFile(
        join(installed, ".agents", "plugins", "marketplace.json"),
        "utf8"
      ),
      /bos-operations-center/
    );
    const recorded = await readFile(calls, "utf8");
    assert.equal(
      recorded.match(/plugin marketplace add/g)?.length,
      1,
      recorded
    );
    assert.equal(recorded.match(/plugin add bos@/g)?.length, 2, recorded);
    assert.equal(
      recorded.match(/plugin add icode-operations-center@/g)?.length,
      2,
      recorded
    );
  }
);
