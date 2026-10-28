# Native IA-014 acceptance owner

This private maintainer entry point produces runtime evidence. It never builds,
deploys, approves source, changes a customer grant or installs a plugin. Source
publication and host enrollment require their ordinary independent workflows.
An explicit native acceptance run does not authorize signing out the user's
current session. Recovery/revocation/migration cases need an authorized isolated
acceptance session; unavailable controls or fixtures remain OPEN.

## Original observations and independent results

After reviewed source enrollment, enroll the proof and semantic roles separately:

```
python tools/native_auth_acceptance.py enroll --role proof --target TARGET.json
python tools/native_auth_acceptance.py enroll --role semantic --target TARGET.json
```

The closed target contains `project`, `region`, `service`, `resource_url` and
`server`. The final two must be the product-owned BOS resource and BOS-Platform.
No arbitrary executable or read endpoint is accepted. Enrollment refuses source
or target replacement; an operator must explicitly reconcile changed enrollment
through the host's reviewed lifecycle. Keys stay private in Git metadata. This
trusts the host OS account, not hostile code running as that same account.

The binding JSON has exactly `commit`, `revision`, `image`, `client`,
`package_version`, `connection`. Commit and image must be immutable. Expected
values never establish observation: the owner captures fixed read-only gcloud
service/revision/service commands, native CLI version, and the existing native
registry/installed-package inspector. A changed serving identity, unavailable
version or missing native binding prevents acceptance. The latest template is
never substituted for the actual 100-percent serving revision.

```
python tools/native_auth_acceptance.py collect --binding BINDING.json
python tools/native_auth_acceptance.py assess --binding BINDING.json --run PROOF_RUN
python tools/native_auth_acceptance.py verify --binding BINDING.json --run PROOF_RUN --semantic-run SEMANTIC_RUN
```

Collection captures an original native session. The independently enrolled
semantic issuer starts a separate Sol/medium process with tools, network, shell,
plugins, rules and user configuration disabled. Original images are supplied as
images; captured text and pictures are explicitly untrusted. Neither producer
assertions, a generic source review, arbitrary screenshots, nor one receipt alone
can close acceptance. Both owner-issued originals must name the exact same proof
inventory, original run and independently observed identity. Changed artifacts,
source, enrollment, target or stale observations fail verification. The bounded
30-minute evidence freshness window is acceptance custody, not a build SLA.

Native cases use the selected authorized context; additional live organization
connections are not required. The fixed local producer separately exercises the
real client context-selection module with three synthetic organizations, return,
parallel selection, combined attribution, and negative selection boundaries.
That source-bound local proof does not claim live multi-org authorization or
replace native authentication, recovery, current roles, revocation or migration.
Unsupported native grammar remains OPEN until explicitly supported and reviewed.

## Closed verification envelope

Schema is `bos.native-auth-acceptance/v2`. The only top-level fields are `schema`,
`status`, `accepted`, `binding`, `observed_identity`, `proof`, `semantic`, `checks`,
`synthetic_only_checks`, `reason`. Exit 0 requires `accepted: true` and `PASSED`.
Missing/invalid proof exits 2; callers must never interpret process exit alone as
acceptance. Failed CLI decoding emits an OPEN error envelope, not this successful
verification envelope.

`observed_identity` contains `deployment` (`target`, `commit`, `revision`, `image`)
and `native` (`client`, `client_version`, `package_version`, `connection`,
`resource_url`). CLI version proves CLI identity only, not a desktop version.
Each `proof`/`semantic` descriptor has `run`, `issuer`, `implementation_sha256`,
`receipt_sha256`, `inventory_sha256`; issuer roles must differ. The semantic
original itself binds the proof run/inventory and observed identity, verified by
the owner before the envelope is issued. No imported boolean is authoritative.

Each of thirteen `checks` has `id`, `status`, `observed`, `event_ids`. The IDs are
the literal `OBLIGATIONS` tuple in the source. Synthetic-only checks are a separate
seven-name inventory. No omitted or duplicated check is permitted.

The private build-host consumer must enroll and pin this exact owner and both
issuer implementations, invoke this verifier, and compare the complete observed
release/client/package/connection identity. It must independently observe serving
before AND after verification and resume only the exact completed delivery's
acceptance under its target lock. It must never redeploy, reset delivery state or
promote health-only evidence into acceptance. No current live acceptance is claimed
by this implementation or its synthetic regressions.
