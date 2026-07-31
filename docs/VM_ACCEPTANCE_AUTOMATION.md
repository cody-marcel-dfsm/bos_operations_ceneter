# VM acceptance automation

The black-box customer test uses Tart and Apple's Virtualization Framework.
`bos-vanilla` contains macOS, Git, Codex, and an authenticated Codex account.
It contains no BOS marketplace, plugin, customer configuration, or BOS/provider
credential.

The harness clones `bos-vanilla` to the disposable `bos-acceptance` VM, launches
Codex, supplies the public GitHub ZIP URL, authenticates through MCP, provisions
the required Calimatic credential through MCP, and performs one read-only
Calimatic query. Secret values travel to the guest over SSH and are deleted
after the run. They are never committed or printed by the harness.

## Host setup

1. Install `tart` and `sshpass`.
2. Clone the current Apple-silicon macOS base image as `bos-vanilla`.
3. Run `sh scripts/vm/prepare-bos-vanilla.sh` to install the signed host Codex
   app and authenticated Codex session into `bos-vanilla`, then shut it down.
4. Copy `config/vm-acceptance.env.example` to
   `config/vm-acceptance.env` and fill in the non-secret test identifiers.
5. Put `BOS_TEST_API_KEY` and `CALIMATIC_API_TOKEN` in the ignored root `.env`.
6. Run `sh scripts/vm/run-macos-acceptance.sh`.

The acceptance VM is always disposable. Re-running the harness deletes the
previous `bos-acceptance` clone and starts from `bos-vanilla`.
