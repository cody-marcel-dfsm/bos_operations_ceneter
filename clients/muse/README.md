# BOS Operations Center for Muse Code

Install the BOS platform and Education Operation Center packages under `plugins/` from a published release.
Follow each product's README. BOS owns one native OAuth connection; Education Operation Center contributes skills.
Install My CRM independently from https://github.com/cody-marcel-dfsm/mycrm#muse-code for its eight CRM skills.
This repository does not copy or redistribute My CRM. All three products use the existing BOS connection.
The product logos reuse the canonical BOS plugin logo family defined in `brand/README.md`.

## Muse companion notification runtime

The companion at muse.ai is a separate host. Its reviewed notification runtime is repository source under `source/host-runtime/bos-journey-notifications/`, outside these generated plugin bundles.
Install an immutable published source release with `scripts/install-notification-host.mjs`; follow that component's README for the private existing-connection configuration, supported native hook, bounded monitoring, worker handoff, upgrade and retirement.
Skill sync alone supplies no runtime installation proof. Actual authenticated streaming, wake and intended worker evidence establish support on that host; source tests retain their own bounded scope.
